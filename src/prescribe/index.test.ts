import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import type { Finding, FindingKind, PrescriptionKind } from "../domain/types";
import { diagnose } from "../diagnose/index";
import { observe } from "../observe/index";
import { parseSession } from "../parser/index";
import { prescribeAgentsMd, renderAgentsMd } from "./index";

const SENSITIVE_PATH = "C:/private/customer/secret-plan.ts";
const SENSITIVE_MESSAGE = "Deploy with password hunter2";
const SENSITIVE_ERROR = "token=private-api-token";

function finding(
  kind: FindingKind,
  overrides: Partial<Finding> = {}
): Finding {
  const prescriptionHints: Partial<Record<string, PrescriptionKind>> = {
    "project-rules-absent": "agents-md-file",
    "human-intervention": "agents-md-section",
    "redundant-read": "agents-md-section",
    "retry-after-error": "agents-md-section",
    "unused-tool": "disable-tool",
    "skill-overhead": "disable-skill",
    "mcp-candidate": "enable-mcp",
  };

  return {
    id: `${kind}:session-1:task-1`,
    sessionId: "session-1",
    taskId: "task-1",
    kind,
    detectedAt: 1_725_000_000_000,
    evidence: {
      type: "cross-reference",
      redactable: false,
    },
    confidence: "high",
    metric: {},
    prescriptionHint: prescriptionHints[kind] ?? "agents-md-section",
    ...overrides,
  };
}

function sensitiveFinding(kind: FindingKind): Finding {
  return finding(kind, {
    id: `${kind}:${SENSITIVE_PATH}`,
    evidence: {
      type: "cross-reference",
      redactable: true,
      messageIds: [`message:${SENSITIVE_MESSAGE}`],
      toolCallIds: [`tool:${SENSITIVE_PATH}`],
      rawValue: SENSITIVE_ERROR,
    },
    metric: {
      path: SENSITIVE_PATH,
      command: SENSITIVE_MESSAGE,
      attemptCount: 2,
      readCount: 3,
    },
    description: `Sensitive description: ${SENSITIVE_MESSAGE}`,
    prescription: `Sensitive proposed rule: ${SENSITIVE_ERROR}`,
  });
}

describe("prescribeAgentsMd", () => {
  it("returns no prescriptions for empty input", () => {
    expect(prescribeAgentsMd([])).toEqual([]);
  });

  it("ignores unknown and non-AGENTS.md finding families", () => {
    const findings = [
      finding("unused-tool"),
      finding("skill-overhead"),
      finding("mcp-candidate"),
      finding("future-finding"),
    ];

    expect(prescribeAgentsMd(findings)).toEqual([]);
  });

  it("creates a minimal file prescription for project-rules-absent", () => {
    const source = finding("project-rules-absent");
    const prescriptions = prescribeAgentsMd([source]);

    expect(prescriptions).toHaveLength(1);
    expect(prescriptions[0]).toMatchObject({
      sessionId: source.sessionId,
      taskId: source.taskId,
      findingIds: [source.id],
      kind: "agents-md-file",
      status: "pending",
      createdAt: source.detectedAt,
      targetFile: "AGENTS.md",
    });
    expect(prescriptions[0].content).toContain("# AGENTS.md");
    expect(prescriptions[0].content).toContain("## Working guidelines");
  });

  it.each([
    ["human-intervention", "Confirm ambiguous requirements"],
    ["redundant-read", "Reuse information already gathered"],
    ["retry-after-error", "Inspect and address the cause"],
  ] as const)("creates a safe section for %s", (kind, expectedText) => {
    const source = finding(kind);
    const prescriptions = prescribeAgentsMd([source]);
    const section = prescriptions.find((item) => item.kind === "agents-md-section");
    const file = prescriptions.find((item) => item.kind === "agents-md-file");

    expect(section).toMatchObject({
      findingIds: [source.id],
      createdAt: source.detectedAt,
      status: "pending",
    });
    expect(section?.content).toContain(expectedText);
    expect(file?.findingIds).toEqual([source.id]);
    expect(file?.content).toContain(expectedText);
  });

  it("derives file createdAt from the latest used finding", () => {
    const older = finding("project-rules-absent", { detectedAt: 100 });
    const newer = finding("retry-after-error", {
      id: "retry-safe-id",
      detectedAt: 300,
    });

    const file = prescribeAgentsMd([newer, older]).find(
      (item) => item.kind === "agents-md-file"
    );

    expect(file?.createdAt).toBe(300);
    expect(file?.findingIds).toEqual([older.id, newer.id]);
  });

  it("is deterministic when equivalent findings arrive in a different order", () => {
    const findings = [
      finding("retry-after-error", { id: "retry-id", detectedAt: 30 }),
      finding("project-rules-absent", { id: "project-id", detectedAt: 10 }),
      finding("human-intervention", { id: "human-id", detectedAt: 20 }),
    ];

    const forward = prescribeAgentsMd(findings);
    const reverse = prescribeAgentsMd([...findings].reverse());

    expect(reverse).toEqual(forward);
  });

  it("deduplicates repeated Finding IDs and duplicate rendered rules", () => {
    const first = finding("redundant-read", { id: "same-finding" });
    const duplicate = { ...first };
    const another = finding("redundant-read", {
      id: "another-finding",
      detectedAt: first.detectedAt + 1,
    });

    const prescriptions = prescribeAgentsMd([first, duplicate, another]);
    const sections = prescriptions.filter((item) => item.kind === "agents-md-section");
    const markdown = renderAgentsMd(prescriptions);
    const rule = "Reuse information already gathered";

    expect(sections).toHaveLength(2);
    expect(markdown.split(rule)).toHaveLength(2);
  });

  it("keeps sessions and tasks in separate file prescriptions", () => {
    const prescriptions = prescribeAgentsMd([
      finding("project-rules-absent", { id: "one" }),
      finding("human-intervention", { id: "two", taskId: "task-2" }),
      finding("retry-after-error", {
        id: "three",
        sessionId: "session-2",
        taskId: "task-1",
      }),
    ]);

    const files = prescriptions.filter((item) => item.kind === "agents-md-file");
    expect(files).toHaveLength(3);
    expect(files.map((item) => `${item.sessionId}/${item.taskId}`).sort()).toEqual([
      "session-1/task-1",
      "session-1/task-2",
      "session-2/task-1",
    ]);
  });

  it.each([
    "human-intervention",
    "redundant-read",
    "retry-after-error",
  ] as const)("does not leak sensitive fields for %s", (kind) => {
    const source = sensitiveFinding(kind);
    const prescriptions = prescribeAgentsMd([source]);
    const markdown = renderAgentsMd(prescriptions);
    const publicIds = prescriptions.map((item) => item.id).join("\n");

    for (const secret of [
      source.id,
      source.description,
      source.prescription,
      SENSITIVE_PATH,
      SENSITIVE_MESSAGE,
      SENSITIVE_ERROR,
      source.evidence.messageIds?.[0],
      source.evidence.toolCallIds?.[0],
    ]) {
      if (secret) {
        expect(markdown).not.toContain(secret);
        expect(publicIds).not.toContain(secret);
      }
    }
  });

  it("does not mutate frozen input", () => {
    const source = sensitiveFinding("human-intervention");
    Object.freeze(source.evidence);
    Object.freeze(source.metric);
    Object.freeze(source);
    const input = Object.freeze([source]);

    expect(() => prescribeAgentsMd(input)).not.toThrow();
    expect(source.description).toContain(SENSITIVE_MESSAGE);
  });
});

describe("renderAgentsMd", () => {
  it("returns an empty string without AGENTS.md prescriptions", () => {
    expect(renderAgentsMd([])).toBe("");
    expect(
      renderAgentsMd([
        {
          id: "other",
          sessionId: "session",
          taskId: "task",
          findingIds: ["finding"],
          kind: "disable-tool",
          status: "pending",
          createdAt: 1,
          content: SENSITIVE_MESSAGE,
        },
      ])
    ).toBe("");
  });

  it("composes a minimal document from section-only input", () => {
    const section = prescribeAgentsMd([finding("redundant-read")]).find(
      (item) => item.kind === "agents-md-section"
    );
    if (!section) throw new Error("Expected section prescription");

    const markdown = renderAgentsMd([section]);
    expect(markdown).toContain("# AGENTS.md");
    expect(markdown).toContain(section.content);
  });
});

describe("baseline integration", () => {
  it("runs parse → observe → diagnose → prescribe without leaking private export content", () => {
    const raw = readFileSync(
      join(process.cwd(), "fixtures/sample-export.json"),
      "utf-8"
    );
    const parsed = parseSession(raw);
    if (!parsed.ok) throw new Error(parsed.error.message);

    const findings = diagnose(observe(parsed.value));
    const prescriptions = prescribeAgentsMd(findings);
    const files = prescriptions.filter((item) => item.kind === "agents-md-file");
    const markdown = renderAgentsMd(prescriptions);

    expect(files).toHaveLength(1);
    expect(files[0].findingIds).toEqual(
      findings
        .filter((item) => item.kind === "project-rules-absent")
        .map((item) => item.id)
    );
    expect(prescriptions.some((item) => item.kind === "disable-tool")).toBe(false);
    expect(prescriptions.some((item) => item.kind === "disable-skill")).toBe(false);
    expect(markdown).toContain("# AGENTS.md");
    expect(markdown).not.toContain(parsed.value.tasks[0].task.title);
    expect(markdown).not.toContain(parsed.value.tasks[0].task.env.staticEnvInfo.primaryWorkspace);
  });
});
