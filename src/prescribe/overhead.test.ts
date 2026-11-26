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

  it("emits one alphabetically ordered prescription per group with purpose and Bob steps", () => {
    const source = unusedFinding([
      { name: "start_workflow", group: "workflow", purpose: "Runs a workflow." },
      { name: "switch_mode", group: "mode", purpose: "Switches active mode." },
      { name: "use_skill", group: "skill", purpose: "Activates a skill." },
    ]);
    const result = prescribeOverheadReduction([source]);

    expect(result.map((item) => item.kind)).toEqual([
      "disable-tool",
      "disable-tool",
      "disable-tool",
    ]);
    expect(result[0].content).toContain("Group: mode");
    expect(result[0].content).toContain("- switch_mode: Switches active mode.");
    expect(result[0].targetFile).toBe(".bob/custom_modes.yaml");
    expect(result[0].tools).toEqual([
      { name: "switch_mode", group: "mode", purpose: "Switches active mode." },
    ]);
    expect(result[0].isEstimate).toBe(true);
    expect(result[0].estimationBasis).toBeTruthy();
    expect(result[1].content).toContain("Group: skill");
    expect(result[2].content).toContain("Group: workflow");
    expect(result.every((item) => item.findingIds[0] === source.id)).toBe(true);
  });

  it("preserves the 'other' group without claiming a Bob-group token saving", () => {
    const result = prescribeOverheadReduction([
      unusedFinding([{ name: "future_tool", group: "other" }], undefined),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].content).toContain("Group: other");
    expect(result[0].content).toContain("future_tool");
    expect(result[0]).not.toHaveProperty("estimatedTokenSaving");
    expect(result[0]).not.toHaveProperty("targetFile");
  });

  it("retains essential tools and excludes them from recommendations", () => {
    const result = prescribeOverheadReduction([
      unusedFinding(
        [
          { name: "use_skill", group: "skill" },
          { name: "apply_diff", group: "edit", essential: true },
        ],
        100
      ),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].content).toContain("use_skill");
    expect(result[0].content).not.toContain("apply_diff");
    expect(result[0].rationale).toContain("apply_diff");
    expect(result[0].estimatedTokenSaving).toBe(100);
  });

  it("emits no tool prescription when every idle tool is essential", () => {
    expect(
      prescribeOverheadReduction([
        unusedFinding(
          [{ name: "apply_diff", group: "edit", essential: true }],
          undefined
        ),
      ])
    ).toEqual([]);
  });

  it("distributes the estimate exactly across Bob groups and omits 'other' from saving allocation", () => {
    const estimated = prescribeOverheadReduction([
      unusedFinding(
        [
          { name: "a", group: "mode" },
          { name: "b", group: "mode" },
          { name: "c", group: "skill" },
          { name: "artifact", group: "other" },
        ],
        10
      ),
    ]);
    const mode = estimated.find((item) => item.content?.includes("Group: mode"))!;
    const skill = estimated.find((item) => item.content?.includes("Group: skill"))!;
    const other = estimated.find((item) => item.content?.includes("Group: other"))!;

    expect(mode.estimatedTokenSaving).toBe(20 / 3);
    expect(skill.estimatedTokenSaving).toBe(10 - 20 / 3);
    expect(other).not.toHaveProperty("estimatedTokenSaving");
    expect(
      estimated.reduce((sum, item) => sum + (item.estimatedTokenSaving ?? 0), 0)
    ).toBe(10);

    const unavailable = prescribeOverheadReduction([
      unusedFinding([{ name: "a", group: "skill" }], 600, { tokenImpact: undefined }),
    ]);
    expect(unavailable[0]).not.toHaveProperty("estimatedTokenSaving");
  });

  it("rejects malformed metrics and candidate mismatches without partial output", () => {
    const malformed = unusedFinding([{ name: "a", group: "skill" }], 10, {
      metric: { idleTools: "not-an-array", disableCandidateCount: 1 },
    });
    const mismatch = unusedFinding([{ name: "a", group: "skill" }], 10, {
      evidence: { type: "breakdown", redactable: false, unusedTools: ["different"] },
    });
    expect(prescribeOverheadReduction([malformed, mismatch])).toEqual([]);
  });

  it("deduplicates identical tools but rejects conflicting duplicates", () => {
    const duplicate = unusedFinding(
      [
        { name: "same", group: "skill" },
        { name: "same", group: "skill" },
      ],
      20,
      {
        evidence: { type: "breakdown", redactable: false, unusedTools: ["same"] },
        metric: {
          idleTools: [
            { name: "same", group: "skill", purpose: null, essential: false },
            { name: "same", group: "skill", purpose: null, essential: false },
          ],
          disableCandidateCount: 1,
          tokenImpactIsEstimate: true,
        },
      }
    );
    expect(prescribeOverheadReduction([duplicate])).toHaveLength(1);

    const conflicting = unusedFinding([{ name: "same", group: "skill" }], 10, {
      metric: {
        idleTools: [
          { name: "same", group: "skill", purpose: null, essential: false },
          { name: "same", group: "mode", purpose: null, essential: false },
        ],
        disableCandidateCount: 1,
        tokenImpactIsEstimate: true,
      },
    });
    expect(prescribeOverheadReduction([conflicting])).toEqual([]);
  });
});

describe("prescribeOverheadReduction — Skill overhead", () => {
  it("emits actionable Bob Settings → Skills steps and distinguishes measured overhead from estimated saving", () => {
    const source = skillFinding();
    const result = prescribeOverheadReduction([source]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: "disable-skill",
      findingIds: [source.id],
      createdAt: source.detectedAt,
      estimatedTokenSaving: 1541,
      isEstimate: true,
    });
    expect(result[0].content).toContain("Settings → Skills");
    expect(result[0].content).toContain("Allow Bob to use this skill");
    expect(result[0].content).toContain(".bob/custom_modes.yaml");
    expect(result[0].steps?.length).toBeGreaterThanOrEqual(3);
    expect(result[0].rationale).toContain("measured");
    expect(result[0].rationale).toContain("upper-bound estimate");
    expect(result[0].estimationBasis).toContain("measured breakdown.skills");
  });

  it("does not emit when loadedSkills is non-empty or absent (unavailable)", () => {
    expect(
      prescribeOverheadReduction([
        skillFinding({ metric: { skillTokens: 1541, loadedSkills: ["private-skill"] } }),
        skillFinding({ metric: { skillTokens: 1541 } }),
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
      { name: "z", group: "workflow" },
      { name: "a", group: "mode" },
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
      unusedFinding([{ name: "a", group: "mode" }], 10),
      unusedFinding([{ name: "b", group: "mode" }], 10, {
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
    const source = unusedFinding([{ name: "safe_tool", group: "skill" }], 10, {
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
    const visible = result
      .map((item) => `${item.id}\n${item.content}\n${item.rationale}`)
      .join("\n");
    expect(visible).not.toContain(secret);
  });

  it("does not mutate deeply frozen input", () => {
    const source = unusedFinding([{ name: "a", group: "skill" }], 10);
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

  it("never emits custom-mode (handled by prescribeCustomMode)", () => {
    const result = prescribeOverheadReduction([
      unusedFinding([{ name: "a", group: "skill" }]),
      skillFinding(),
    ]);
    expect(result.some((item) => item.kind === "custom-mode")).toBe(false);
  });
});

describe("prescribeOverheadReduction — baseline integration", () => {
  const baseline = loadBaseline();

  it("produces only disableable Bob groups (+ other without inflated savings) and one Skill prescription", () => {
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
      mode: 1,
      other: 2,
      skill: 1,
      subagent: 1,
      subtask: 1,
      workflow: 1,
    });
    expect(
      tools.reduce((sum, item) => sum + (item.estimatedTokenSaving ?? 0), 0)
    ).toBe((5403 / 23) * 5);
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
