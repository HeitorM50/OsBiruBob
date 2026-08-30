import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import { TOOL_CATALOG_ABSENT } from "../catalog";
import { diagnoseWithCatalogs } from "../diagnose";
import type { Finding, FindingKind, PrescriptionKind } from "../domain/types";
import { observe } from "../observe";
import { parseSession } from "../parser";
import { prescribeOverheadReduction } from "./overhead";

interface ToolInput {
  name: string;
  group: string;
  purpose?: string | null;
  essential?: boolean;
}

function baseFinding(kind: FindingKind, overrides: Partial<Finding> = {}): Finding {
  const hints: Partial<Record<string, PrescriptionKind>> = {
    "unused-tool": "disable-tool",
    "skill-overhead": "disable-skill",
  };
  return {
    id: `${kind}:session-1:task-1`,
    sessionId: "session-1",
    taskId: "task-1",
    kind,
    detectedAt: 1_700_000_000_000,
    evidence: { type: "breakdown", redactable: false },
    confidence: "high",
    metric: {},
    prescriptionHint: hints[kind] ?? "disable-tool",
    ...overrides,
  };
}

function unusedFinding(
  tools: readonly ToolInput[],
  tokenImpact: number | undefined = 600,
  overrides: Partial<Finding> = {}
): Finding {
  const idleTools = tools.map((tool) => ({
    name: tool.name,
    group: tool.group,
    purpose: tool.purpose ?? null,
    essential: tool.essential ?? false,
  }));
  const candidates = idleTools.filter((tool) => !tool.essential);
  return baseFinding("unused-tool", {
    evidence: {
      type: "breakdown",
      redactable: false,
      unusedTools: candidates.map((tool) => tool.name),
    },
    metric: {
      idleTools,
      disableCandidateCount: candidates.length,
      tokenImpactIsEstimate: true,
    },
    ...(tokenImpact === undefined ? {} : { tokenImpact }),
    ...overrides,
  });
}

function skillFinding(overrides: Partial<Finding> = {}): Finding {
  return baseFinding("skill-overhead", {
    evidence: {
      type: "breakdown",
      redactable: false,
      breakdownField: "skills",
      breakdownValue: 1541,
    },
    metric: { skillTokens: 1541, loadedSkills: [] },
    tokenImpact: 1541,
    ...overrides,
  });
}

function loadBaseline() {
  const raw = readFileSync(
    resolve(__dirname, "../../fixtures/sample-export.json"),
    "utf-8"
  );
  const parsed = parseSession(raw);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return observe(parsed.value);
}

describe("prescribeOverheadReduction — tool groups", () => {
  it("returns no prescriptions for empty or unsupported input", () => {
    expect(prescribeOverheadReduction([])).toEqual([]);
    expect(prescribeOverheadReduction([baseFinding("project-rules-absent")])).toEqual([]);
  });

  it("emits one alphabetically ordered prescription per group", () => {
    const source = unusedFinding([
      { name: "zeta", group: "planning" },
      { name: "beta", group: "editing" },
      { name: "alpha", group: "editing" },
    ]);
    const result = prescribeOverheadReduction([source]);

    expect(result.map((item) => item.kind)).toEqual(["disable-tool", "disable-tool"]);
    expect(result[0].content).toContain("Group: editing");
    expect(result[0].content?.indexOf("- alpha")).toBeLessThan(
      result[0].content?.indexOf("- beta") ?? -1
    );
    expect(result[1].content).toContain("Group: planning");
    expect(result.every((item) => item.findingIds[0] === source.id)).toBe(true);
  });

  it("preserves the outros group", () => {
    const result = prescribeOverheadReduction([
      unusedFinding([{ name: "future_tool", group: "outros" }]),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].content).toContain("Group: outros");
    expect(result[0].content).toContain("future_tool");
  });

  it("retains essential tools and excludes them from recommendations", () => {
    const result = prescribeOverheadReduction([
      unusedFinding([
        { name: "safe_to_disable", group: "editing" },
        { name: "required_tool", group: "editing", essential: true },
      ], 100),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].content).toContain("safe_to_disable");
    expect(result[0].content).not.toContain("required_tool");
    expect(result[0].rationale).toContain("required_tool");
    expect(result[0].estimatedTokenSaving).toBe(100);
  });

  it("emits no tool prescription when every idle tool is essential", () => {
    expect(
      prescribeOverheadReduction([
        unusedFinding(
          [{ name: "required_tool", group: "editing", essential: true }],
          undefined
        ),
      ])
    ).toEqual([]);
  });

  it("distributes the estimate exactly and leaves missing estimates absent", () => {
    const estimated = prescribeOverheadReduction([
      unusedFinding([
        { name: "a", group: "one" },
        { name: "b", group: "one" },
        { name: "c", group: "two" },
      ], 10),
    ]);
    expect(estimated[0].estimatedTokenSaving).toBe(20 / 3);
    expect(estimated[1].estimatedTokenSaving).toBe(10 - 20 / 3);
    expect(
      estimated.reduce((sum, item) => sum + (item.estimatedTokenSaving ?? 0), 0)
    ).toBe(10);

    const unavailable = prescribeOverheadReduction([
      unusedFinding([{ name: "a", group: "one" }], 600, { tokenImpact: undefined }),
    ]);
    expect(unavailable[0]).not.toHaveProperty("estimatedTokenSaving");
  });

  it("rejects malformed metrics and candidate mismatches without partial output", () => {
    const malformed = unusedFinding([{ name: "a", group: "one" }], 10, {
      metric: { idleTools: "not-an-array", disableCandidateCount: 1 },
    });
    const mismatch = unusedFinding([{ name: "a", group: "one" }], 10, {
      evidence: { type: "breakdown", redactable: false, unusedTools: ["different"] },
    });
    expect(prescribeOverheadReduction([malformed, mismatch])).toEqual([]);
  });

  it("deduplicates identical tools but rejects conflicting duplicates", () => {
    const duplicate = unusedFinding([
      { name: "same", group: "editing" },
      { name: "same", group: "editing" },
    ], 20, {
      evidence: { type: "breakdown", redactable: false, unusedTools: ["same"] },
      metric: {
        idleTools: [
          { name: "same", group: "editing", purpose: null, essential: false },
          { name: "same", group: "editing", purpose: null, essential: false },
        ],
        disableCandidateCount: 1,
        tokenImpactIsEstimate: true,
      },
    });
    expect(prescribeOverheadReduction([duplicate])).toHaveLength(1);

    const conflicting = unusedFinding([{ name: "same", group: "editing" }], 10, {
      metric: {
        idleTools: [
          { name: "same", group: "editing", purpose: null, essential: false },
          { name: "same", group: "planning", purpose: null, essential: false },
        ],
        disableCandidateCount: 1,
        tokenImpactIsEstimate: true,
      },
    });
    expect(prescribeOverheadReduction([conflicting])).toEqual([]);
  });
});

describe("prescribeOverheadReduction — Skill overhead", () => {
  it("emits a generic Skill prescription with the aggregate estimate", () => {
    const source = skillFinding();
    const result = prescribeOverheadReduction([source]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: "disable-skill",
      findingIds: [source.id],
      createdAt: source.detectedAt,
      estimatedTokenSaving: 1541,
    });
    expect(result[0].content).toContain("does not identify a specific Skill");
    expect(result[0].rationale?.toLowerCase()).toContain("estimated");
  });

  it("does not invent a target when loaded Skills are named", () => {
    expect(
      prescribeOverheadReduction([
        skillFinding({ metric: { skillTokens: 1541, loadedSkills: ["private-skill"] } }),
      ])
    ).toEqual([]);
  });

  it("keeps an unavailable estimate absent", () => {
    const result = prescribeOverheadReduction([skillFinding({ tokenImpact: undefined })]);
    expect(result[0]).not.toHaveProperty("estimatedTokenSaving");
  });
});

describe("prescribeOverheadReduction — determinism, privacy and immutability", () => {
  it("is invariant to Finding and tool order and removes duplicate Findings", () => {
    const tools = [
      { name: "z", group: "two" },
      { name: "a", group: "one" },
    ];
    const first = unusedFinding(tools, 20);
    const reordered = unusedFinding([...tools].reverse(), 20);
    const skill = skillFinding();

    expect(prescribeOverheadReduction([first, skill, first])).toEqual(
      prescribeOverheadReduction([skill, reordered])
    );
  });

  it("keeps different sessions and tasks separate", () => {
    const result = prescribeOverheadReduction([
      unusedFinding([{ name: "a", group: "one" }], 10),
      unusedFinding([{ name: "b", group: "one" }], 10, {
        id: "other-task",
        taskId: "task-2",
      }),
      skillFinding({ id: "other-session", sessionId: "session-2" }),
    ]);
    expect(new Set(result.map((item) => `${item.sessionId}/${item.taskId}`))).toEqual(
      new Set(["session-1/task-1", "session-1/task-2", "session-2/task-1"])
    );
  });

  it("does not copy sensitive Finding fields into public output or IDs", () => {
    const secret = "C:/private/customer/password.txt";
    const source = unusedFinding([{ name: "safe_tool", group: "editing" }], 10, {
      id: `unused-tool:${secret}`,
      description: secret,
      prescription: secret,
      evidence: {
        type: "breakdown",
        redactable: false,
        unusedTools: ["safe_tool"],
        rawValue: secret,
      },
    });
    const result = prescribeOverheadReduction([source]);
    const visible = result.map((item) => `${item.id}\n${item.content}\n${item.rationale}`).join("\n");
    expect(visible).not.toContain(secret);
  });

  it("does not mutate deeply frozen input", () => {
    const source = unusedFinding([{ name: "a", group: "one" }], 10);
    Object.freeze(source.evidence.unusedTools);
    Object.freeze(source.evidence);
    const idleTools = source.metric.idleTools as Array<Record<string, unknown>>;
    idleTools.forEach(Object.freeze);
    Object.freeze(idleTools);
    Object.freeze(source.metric);
    Object.freeze(source);
    const input = Object.freeze([source]);
    expect(() => prescribeOverheadReduction(input)).not.toThrow();
  });

  it("never emits custom-mode", () => {
    const result = prescribeOverheadReduction([
      unusedFinding([{ name: "a", group: "one" }]),
      skillFinding(),
    ]);
    expect(result.some((item) => item.kind === "custom-mode")).toBe(false);
  });
});

describe("prescribeOverheadReduction — baseline integration", () => {
  const baseline = loadBaseline();

  it("produces six tool groups and one generic Skill prescription", () => {
    const diagnosis = diagnoseWithCatalogs(baseline);
    const result = prescribeOverheadReduction(diagnosis.findings);
    const tools = result.filter((item) => item.kind === "disable-tool");
    const skills = result.filter((item) => item.kind === "disable-skill");
    const groupCounts = Object.fromEntries(
      tools.map((item) => [
        item.content?.match(/^Group: (.+)$/m)?.[1],
        item.content?.match(/^- /gm)?.length,
      ])
    );

    expect(result).toHaveLength(7);
    expect(tools).toHaveLength(6);
    expect(skills).toHaveLength(1);
    expect(groupCounts).toEqual({
      "code-navigation": 5,
      delegation: 3,
      documentation: 2,
      editing: 4,
      planning: 2,
      presentation: 2,
    });
    expect(tools.reduce((sum, item) => sum + (item.estimatedTokenSaving ?? 0), 0)).toBe(
      (5403 / 23) * 18
    );
    expect(skills[0].estimatedTokenSaving).toBe(1541);
    expect(result.some((item) => item.kind === "custom-mode")).toBe(false);
  });

  it("emits no tool prescription and records the reason when the catalogue is absent", () => {
    const diagnosis = diagnoseWithCatalogs(baseline, { tools: null });
    const result = prescribeOverheadReduction(diagnosis.findings);
    expect(diagnosis.unavailableMetrics).toContain(TOOL_CATALOG_ABSENT);
    expect(result.some((item) => item.kind === "disable-tool")).toBe(false);
    expect(result.filter((item) => item.kind === "disable-skill")).toHaveLength(1);
  });
});
