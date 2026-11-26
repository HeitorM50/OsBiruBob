import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import type { Finding, FindingKind, PrescriptionKind, Session } from "../domain/types";
import { diagnose } from "../diagnose/index";
import { observe } from "../observe/index";
import { parseSession } from "../parser/index";
import { prescribeAgentsMd, renderAgentsMd } from "./index";

const SENSITIVE_PATH = "C:/private/customer/secret-plan.ts";
const SENSITIVE_MESSAGE = "Deploy with password hunter2";
const SENSITIVE_ERROR = "token=private-api-token";

function finding(kind: FindingKind, overrides: Partial<Finding> = {}): Finding {
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
    evidence: { type: "cross-reference", redactable: false },
    confidence: "high",
    metric: {},
    prescriptionHint: prescriptionHints[kind] ?? "agents-md-section",
    ...overrides,
  };
}

/** One finding of every supported kind, with realistic, safe metrics. */
function fullSet(taskId = "task-1"): Finding[] {
  return [
    finding("project-rules-absent", { id: `pra:${taskId}`, taskId }),
    finding("mcp-candidate", {
      id: `mcp:${taskId}`,
      taskId,
      metric: { serverLabel: "Docker MCP Server", binaries: ["docker"], hitCount: 2, httpHitCount: 0 },
    }),
    finding("redundant-read", {
      id: `rr:${taskId}`,
      taskId,
      metric: { path: SENSITIVE_PATH, readCount: 3, distinctTurns: 3 },
    }),
    finding("retry-after-error", {
      id: `retry:${taskId}`,
      taskId,
      metric: { toolName: "execute_command", attemptCount: 2, successObserved: true },
    }),
    finding("unused-tool", {
      id: `unused:${taskId}`,
      taskId,
      metric: {
        idleTools: [
          { name: "grep", group: "code-navigation", essential: false },
          { name: "FindSymbol", group: "code-navigation", essential: false },
          { name: "attempt_completion", group: "core", essential: true },
        ],
      },
    }),
    finding("human-intervention", {
      id: `hi:${taskId}`,
      taskId,
      metric: { interventionCount: 2 },
      prescription: SENSITIVE_MESSAGE,
    }),
  ];
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
      externalCommands: [`docker run ${SENSITIVE_PATH}`],
    },
    metric: {
      path: SENSITIVE_PATH,
      command: SENSITIVE_MESSAGE,
      // Free-form strings in identifier slots must be dropped, not rendered.
      toolName: SENSITIVE_PATH,
      serverLabel: `<script>${SENSITIVE_MESSAGE}`,
      binaries: [SENSITIVE_PATH, "docker"],
      idleTools: [{ name: SENSITIVE_PATH, group: SENSITIVE_MESSAGE }],
      attemptCount: 2,
      readCount: 3,
      distinctTurns: 2,
      interventionCount: 1,
    },
    description: `Sensitive description: ${SENSITIVE_MESSAGE}`,
    prescription: `Sensitive proposed rule: ${SENSITIVE_ERROR}`,
  });
}

function ruleLines(markdown: string): string[] {
  return markdown.split("\n").filter((line) => line.startsWith("- "));
}

function file(findings: readonly Finding[]) {
  const files = prescribeAgentsMd(findings).filter((item) => item.kind === "agents-md-file");
  expect(files).toHaveLength(1);
  return files[0];
}

describe("prescribeAgentsMd", () => {
  it("returns no prescriptions for empty input", () => {
    expect(prescribeAgentsMd([])).toEqual([]);
  });

  it("ignores unknown and unsupported finding families", () => {
    expect(
      prescribeAgentsMd([finding("skill-overhead"), finding("future-finding")])
    ).toEqual([]);
  });

  it("renders the target sections in a stable order, only when supported", () => {
    const markdown = file(fullSet()).content ?? "";
    const headings = markdown.split("\n").filter((line) => line.startsWith("## "));
    expect(headings).toEqual([
      "## Environment",
      "## Commands",
      "## Tool policy",
      "## Working agreements",
    ]);

    const onlyRetry = file([fullSet()[3]]).content ?? "";
    expect(onlyRetry.split("\n").filter((line) => line.startsWith("## "))).toEqual([
      "## Tool policy",
    ]);
  });

  it("derives rule text from finding metrics", () => {
    const markdown = file(fullSet()).content ?? "";

    expect(markdown).toContain("This repo uses `docker` from the shell (2 shell commands observed)");
    expect(markdown).toContain("Docker MCP Server");
    expect(markdown).toContain("1 file re-read in 2 extra turns");
    expect(markdown).toContain("When `execute_command` fails");
    expect(markdown).toContain("1 retry chain, 2 attempts");
    expect(markdown).toContain("2 loaded tools stayed idle");
    expect(markdown).toContain("Idle (code-navigation): `FindSymbol`, `grep`.");
    expect(markdown).not.toContain("attempt_completion"); // essential tools are never listed
    expect(markdown).toContain("2 mid-task user messages in 1 separate moment");
  });

  it("emits command placeholders instead of inventing commands", () => {
    const markdown = file([finding("project-rules-absent")]).content ?? "";
    expect(markdown).toContain("Test: <!-- fill in: test command -->");
    expect(markdown).toContain("Build: <!-- fill in: build command -->");
    expect(markdown).toContain("Lint / typecheck: <!-- fill in: lint command -->");
    expect(markdown).not.toMatch(/npm|yarn|pnpm|make /);
  });

  it("ends every rule with a hindsight trace comment", () => {
    const markdown = file(fullSet()).content ?? "";
    const rules = ruleLines(markdown);
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule).toMatch(/ <!-- hindsight: [a-z-]+ ×\d+ -->$/);
    }
    expect(markdown).toContain("<!-- hindsight: retry-after-error ×1 -->");
  });

  it("counts supporting findings in the trace comment", () => {
    const markdown =
      file([
        finding("retry-after-error", { id: "a", metric: { toolName: "read_file", attemptCount: 2 } }),
        finding("retry-after-error", { id: "b", metric: { toolName: "read_file", attemptCount: 3 } }),
        finding("redundant-read", { id: "c", metric: { distinctTurns: 2 } }),
        finding("redundant-read", { id: "d", metric: { distinctTurns: 4 } }),
      ]).content ?? "";

    expect(markdown).toContain("(2 retry chains, 5 attempts). <!-- hindsight: retry-after-error ×2 -->");
    expect(markdown).toContain("2 files re-read in 4 extra turns");
    expect(markdown).toContain("<!-- hindsight: redundant-read ×2 -->");
  });

  it("is byte-identical for the same findings in any order", () => {
    const findings = fullSet();
    const forward = prescribeAgentsMd(findings);
    const reverse = prescribeAgentsMd([...findings].reverse());
    const shuffled = prescribeAgentsMd([findings[3], findings[0], findings[5], findings[1], findings[4], findings[2]]);

    expect(reverse).toEqual(forward);
    expect(shuffled).toEqual(forward);
    expect(renderAgentsMd(reverse)).toBe(renderAgentsMd(forward));
  });

  it("deduplicates repeated Finding IDs", () => {
    const first = finding("redundant-read", { id: "same", metric: { distinctTurns: 2 } });
    const markdown = file([first, { ...first }]).content ?? "";
    expect(markdown).toContain("<!-- hindsight: redundant-read ×1 -->");
  });

  it("aggregates a multi-task session into a single document", () => {
    const prescriptions = prescribeAgentsMd([...fullSet("task-1"), ...fullSet("task-2")]);
    const files = prescriptions.filter((item) => item.kind === "agents-md-file");
    const markdown = renderAgentsMd(prescriptions);

    expect(files).toHaveLength(1);
    expect(files[0].taskId).toBe("task-1");
    expect(files[0].findingIds).toHaveLength(12);
    expect(markdown.match(/^# AGENTS\.md$/gm)).toHaveLength(1);
    expect(markdown).not.toContain("---");
    expect(markdown).toContain("(4 shell commands observed)");
    expect(markdown).toContain("<!-- hindsight: unused-tool ×2 -->");
    expect(markdown.split("When `execute_command` fails")).toHaveLength(2);
  });

  it("drops subtask findings when root task IDs are provided", () => {
    const findings = [
      ...fullSet("root"),
      finding("retry-after-error", {
        id: "sub-retry",
        taskId: "subtask",
        metric: { toolName: "write_file", attemptCount: 2 },
      }),
    ];
    const markdown = renderAgentsMd(prescribeAgentsMd(findings, { rootTaskIds: ["root"] }));
    expect(markdown).not.toContain("write_file");
    expect(markdown).toContain("execute_command");
  });

  it("keeps separate sessions in separate file prescriptions", () => {
    const prescriptions = prescribeAgentsMd([
      ...fullSet(),
      finding("project-rules-absent", { id: "other", sessionId: "session-2" }),
    ]);
    const files = prescriptions.filter((item) => item.kind === "agents-md-file");
    expect(files.map((item) => item.sessionId)).toEqual(["session-1", "session-2"]);
  });

  it("does not leak sensitive fields or free-form metric strings", () => {
    const sources = [
      "human-intervention",
      "redundant-read",
      "retry-after-error",
      "mcp-candidate",
      "unused-tool",
      "project-rules-absent",
    ].map((kind) => sensitiveFinding(kind));
    const prescriptions = prescribeAgentsMd(sources);
    const markdown = renderAgentsMd(prescriptions);
    const publicText = prescriptions
      .map((item) => `${item.id}\n${item.rationale ?? ""}\n${item.content ?? ""}`)
      .join("\n");

    expect(markdown).not.toBe("");
    for (const secret of [
      ...sources.map((item) => item.id),
      SENSITIVE_PATH,
      SENSITIVE_MESSAGE,
      SENSITIVE_ERROR,
      "secret-plan",
      "<script>",
    ]) {
      expect(markdown).not.toContain(secret);
      expect(publicText).not.toContain(secret);
    }
  });

  it("does not mutate frozen input", () => {
    const source = sensitiveFinding("human-intervention");
    Object.freeze(source.evidence);
    Object.freeze(source.metric);
    Object.freeze(source);
    expect(() => prescribeAgentsMd(Object.freeze([source]))).not.toThrow();
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

  it("composes the same document from section-only input", () => {
    const prescriptions = prescribeAgentsMd(fullSet());
    const sections = prescriptions.filter((item) => item.kind === "agents-md-section");
    expect(sections).toHaveLength(4);
    expect(renderAgentsMd([...sections].reverse())).toBe(renderAgentsMd(prescriptions));
  });
});

describe("real exports", () => {
  function load(relative: string): { session: Session; markdown: string; findings: Finding[] } {
    const parsed = parseSession(readFileSync(join(process.cwd(), relative), "utf-8"));
    if (!parsed.ok) throw new Error(parsed.error.message);
    const report = observe(parsed.value);
    const findings = diagnose(report);
    const rootTaskIds = report.tasks.filter((task) => !task.isSubtask).map((task) => task.taskId);
    const markdown = renderAgentsMd(prescribeAgentsMd(findings, { rootTaskIds }));
    return { session: parsed.value, markdown, findings };
  }

  /** Every string an export may carry that must never reach the draft. */
  function privateStrings(session: Session): string[] {
    const values = new Set<string>();
    for (const entry of session.tasks) {
      values.add(entry.task.title);
      values.add(entry.task.env.staticEnvInfo.primaryWorkspace);
      for (const message of entry.messages as unknown as Array<Record<string, unknown>>) {
        const data = (message.data ?? {}) as Record<string, unknown>;
        if (typeof data.content === "string") values.add(data.content);
        for (const call of (data.toolCalls ?? []) as Array<Record<string, unknown>>) {
          const args = (call.arguments ?? {}) as Record<string, unknown>;
          for (const value of Object.values(args)) {
            if (typeof value === "string") values.add(value);
          }
          if (typeof call.arguments === "string") values.add(call.arguments);
        }
      }
    }
    return [...values].filter((value) => value.trim().length >= 6);
  }

  it.each(["fixtures/sample-export.json", "benchmark/rodada-a.json"])(
    "produces a traceable draft without private content for %s",
    (relative) => {
      const { session, markdown } = load(relative);

      expect(markdown.match(/^# AGENTS\.md$/gm)).toHaveLength(1);
      expect(markdown).toContain("## Environment");
      expect(markdown).toContain("`docker`");
      expect(markdown).toContain("## Commands");
      expect(markdown).toContain("## Tool policy");
      for (const rule of ruleLines(markdown)) expect(rule).toMatch(/<!-- hindsight: [a-z-]+ ×\d+ -->$/);

      const secrets = privateStrings(session);
      expect(secrets.length).toBeGreaterThan(0);
      for (const secret of secrets) expect(markdown).not.toContain(secret);
      expect(markdown).not.toMatch(/[A-Za-z]:[\\/]|\/home\/|\/Users\/|\.tsx?\b|\.json\b/);
      expect(load(relative).markdown).toBe(markdown);
    }
  );
});
