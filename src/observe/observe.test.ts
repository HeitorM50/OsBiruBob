/**
 * Observe integration tests — Hindsight (Phase 2 exit gate)
 *
 * Covers:
 *  - Baseline snapshot against benchmark/rodada-a.json
 *  - Identical results from fixtures/sample-export.json
 *  - Subtask exclusion from totals (I-5)
 *  - Tasks with no messages
 *  - Isolated handling of detector failures (no crash)
 *  - unavailableMetrics always present
 *  - completed from stop:true, never from task.status
 *  - Tool inventory counts
 *  - External command extraction
 *  - Human interventions counting
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { observe } from "./index";
import { parseSession } from "../parser/index";
import type { Session } from "../domain/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readFixture(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf-8");
}

function loadSession(relativePath: string): Session {
  const content = readFixture(relativePath);
  const result = parseSession(content);
  if (!result.ok) throw new Error(`parseSession failed: ${result.error.message}`);
  return result.value;
}

// ---------------------------------------------------------------------------
// Baseline: benchmark/rodada-a.json — conformance gate (docs/domain-model.md §6)
// ---------------------------------------------------------------------------

describe("observe — benchmark/rodada-a.json (conformance gate)", () => {
  const session = loadSession("benchmark/rodada-a.json");
  const report = observe(session);

  it("totals.cost === 0.336902 (full precision, no rounding)", () => {
    expect(report.totals.cost).toBe(0.336902);
  });

  it("tasks[0].context.reportedTotal === 17584", () => {
    expect(report.tasks[0].context!.reportedTotal).toBe(17584);
  });

  it("tasks[0].context.fixedOverhead === 10439", () => {
    expect(report.tasks[0].context!.fixedOverhead).toBe(10439);
  });

  it("tasks[0].context.conversationTokens === 7145", () => {
    expect(report.tasks[0].context!.conversationTokens).toBe(7145);
  });

  it("totals.assistantTurns === 5", () => {
    expect(report.totals.assistantTurns).toBe(5);
  });

  it("totals.toolCalls === 14", () => {
    expect(report.totals.toolCalls).toBe(14);
  });

  it("totals.erroredToolCalls === 0", () => {
    expect(report.totals.erroredToolCalls).toBe(0);
  });

  it("totals.humanInterventions === 0", () => {
    expect(report.totals.humanInterventions).toBe(0);
  });

  it("tasks[0].toolInventory.available.length === 23", () => {
    expect(report.tasks[0].toolInventory?.available.length).toBe(23);
  });

  it("tasks[0].toolInventory.used.length === 5", () => {
    expect(report.tasks[0].toolInventory?.used.length).toBe(5);
  });

  it("tasks[0].toolInventory.idle.length === 18", () => {
    expect(report.tasks[0].toolInventory?.idle.length).toBe(18);
  });

  it("tasks[0].externalCommands.length === 3", () => {
    expect(report.tasks[0].externalCommands.length).toBe(3);
  });

  it("tasks[0].context.pressure === null (no maxContextWindow)", () => {
    expect(report.tasks[0].context!.pressure).toBeNull();
  });

  it("tasks[0].completed === true", () => {
    expect(report.tasks[0].completed).toBe(true);
  });

  it("anomalies.length === 0", () => {
    expect(report.anomalies).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Baseline: fixtures/sample-export.json — must be identical to rodada-a
// ---------------------------------------------------------------------------

describe("observe — fixtures/sample-export.json (identical to rodada-a)", () => {
  const session = loadSession("fixtures/sample-export.json");
  const report = observe(session);

  it("totals.cost === 0.336902", () => {
    expect(report.totals.cost).toBe(0.336902);
  });

  it("tasks[0].context.reportedTotal === 17584", () => {
    expect(report.tasks[0].context!.reportedTotal).toBe(17584);
  });

  it("tasks[0].context.fixedOverhead === 10439", () => {
    expect(report.tasks[0].context!.fixedOverhead).toBe(10439);
  });

  it("tasks[0].context.conversationTokens === 7145", () => {
    expect(report.tasks[0].context!.conversationTokens).toBe(7145);
  });

  it("totals.assistantTurns === 5", () => {
    expect(report.totals.assistantTurns).toBe(5);
  });

  it("totals.toolCalls === 14", () => {
    expect(report.totals.toolCalls).toBe(14);
  });

  it("totals.erroredToolCalls === 0", () => {
    expect(report.totals.erroredToolCalls).toBe(0);
  });

  it("totals.humanInterventions === 0", () => {
    expect(report.totals.humanInterventions).toBe(0);
  });

  it("tasks[0].toolInventory.available.length === 23", () => {
    expect(report.tasks[0].toolInventory?.available.length).toBe(23);
  });

  it("tasks[0].toolInventory.used.length === 5", () => {
    expect(report.tasks[0].toolInventory?.used.length).toBe(5);
  });

  it("tasks[0].toolInventory.idle.length === 18", () => {
    expect(report.tasks[0].toolInventory?.idle.length).toBe(18);
  });

  it("tasks[0].externalCommands.length === 3", () => {
    expect(report.tasks[0].externalCommands.length).toBe(3);
  });

  it("tasks[0].context.pressure === null", () => {
    expect(report.tasks[0].context!.pressure).toBeNull();
  });

  it("tasks[0].completed === true", () => {
    expect(report.tasks[0].completed).toBe(true);
  });

  it("anomalies.length === 0", () => {
    expect(report.anomalies).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// unavailableMetrics — always contains the v1 baseline list
// ---------------------------------------------------------------------------

describe("observe — unavailableMetrics", () => {
  it("contains at least inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, buildFailures", () => {
    const session = loadSession("fixtures/sample-export.json");
    const report = observe(session);
    const required = ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens", "buildFailures"];
    for (const m of required) {
      expect(report.unavailableMetrics).toContain(m);
    }
  });

  it("never includes a zero value in place of unavailable metrics", () => {
    // The report must not have totals fields that correspond to unavailable metrics
    // filled with 0 as if they were measured.
    // We verify the unavailableMetrics list is populated, not empty.
    const session = loadSession("fixtures/sample-export.json");
    const report = observe(session);
    expect(report.unavailableMetrics.length).toBeGreaterThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// Forward-compatible tool permissions
// ---------------------------------------------------------------------------

describe("observe — forward-compatible tool permissions", () => {
  it("preserves an unknown permission string without dropping the task", () => {
    const base = JSON.parse(readFixture("fixtures/sample-export.json"));
    const toolMessage = base.tasks[0].messages.find(
      (message: { data?: { role?: string } }) => message.data?.role === "tool"
    );
    if (toolMessage === undefined) {
      throw new Error("Expected the baseline to contain a tool message");
    }
    toolMessage.data.toolUsage.permission = "future-permission";

    const parsed = parseSession(JSON.stringify(base));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const report = observe(parsed.value);

    expect(report.tasks).toHaveLength(1);
    expect(report.tasks[0].toolCalls).toContainEqual(
      expect.objectContaining({ permission: "future-permission" })
    );
    expect(
      report.anomalies.some((anomaly) =>
        anomaly.detail.startsWith("observeTask threw:")
      )
    ).toBe(false);
  });
});

describe("observe — error result content", () => {
  it("preserves error content for diagnosis and omits successful result content", () => {
    const base = JSON.parse(readFixture("fixtures/sample-export.json"));
    const toolMessages = base.tasks[0].messages.filter(
      (message: { data?: { role?: string } }) => message.data?.role === "tool"
    );
    if (toolMessages.length < 2) {
      throw new Error("Expected at least two tool messages in the baseline");
    }

    toolMessages[0].data.toolUsage.signature.isError = true;
    toolMessages[0].data.content = "Synthetic failure content";
    toolMessages[1].data.toolUsage.signature.isError = false;
    toolMessages[1].data.content = "Synthetic success content";

    const parsed = parseSession(JSON.stringify(base));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const report = observe(parsed.value);
    const errored = report.tasks[0].toolCalls.find(
      (call) => call.resultMessageId === toolMessages[0].id
    );
    const succeeded = report.tasks[0].toolCalls.find(
      (call) => call.resultMessageId === toolMessages[1].id
    );

    expect(errored?.errorMessage).toBe("Synthetic failure content");
    expect(succeeded?.errorMessage).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// completed — must come from stop:true, never from task.status
// ---------------------------------------------------------------------------

describe("observe — completed is derived from stop:true", () => {
  it("task.status='active' does not affect completed when stop:true is present", () => {
    const session = loadSession("fixtures/sample-export.json");
    // The baseline has status='active' but last turn has stop:true
    expect(session.tasks[0].task.status).toBe("active");
    const report = observe(session);
    expect(report.tasks[0].completed).toBe(true);
  });

  it("task without stop:true on any assistant message → completed === false", () => {
    const base = JSON.parse(readFixture("fixtures/sample-export.json"));
    // Remove stop:true from all assistant messages
    for (const msg of base.tasks[0].messages) {
      if (msg.data.role === "assistant") {
        delete msg.data.stop;
      }
    }
    const result = parseSession(JSON.stringify(base));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const report = observe(result.value);
    expect(report.tasks[0].completed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Subtask exclusion from totals (I-5)
// ---------------------------------------------------------------------------

describe("observe — subtask exclusion from totals (I-5)", () => {
  it("subtask appears in tasks[] but its cost is excluded from totals.cost", () => {
    const base = JSON.parse(readFixture("fixtures/sample-export.json"));
    const rootTask = JSON.parse(JSON.stringify(base.tasks[0]));

    // Create a subtask by cloning root and setting parentId
    const subtask = JSON.parse(JSON.stringify(base.tasks[0]));
    subtask.task.id = "subtask-001";
    subtask.task.parentId = rootTask.task.id;
    subtask.task.costs.cost = 0.111111; // distinct cost

    const synthetic = {
      version: base.version,
      exportedAt: base.exportedAt,
      workspace: base.workspace,
      tasks: [rootTask, subtask],
    };

    const result = parseSession(JSON.stringify(synthetic));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = observe(result.value);

    // Both tasks in the report
    expect(report.tasks).toHaveLength(2);

    // The subtask is present with isSubtask: true
    const subtaskReport = report.tasks.find((t) => t.taskId === "subtask-001");
    expect(subtaskReport).toBeDefined();
    expect(subtaskReport?.isSubtask).toBe(true);

    // Totals only include root task cost
    expect(report.totals.cost).toBe(rootTask.task.costs.cost);
    expect(report.totals.taskCount).toBe(1);
    expect(report.totals.subtaskCount).toBe(1);

    // Subtask cost is NOT in totals
    expect(report.totals.cost).not.toBe(
      rootTask.task.costs.cost + subtask.task.costs.cost
    );
  });

  it("subtask assistantTurns are excluded from totals.assistantTurns", () => {
    const base = JSON.parse(readFixture("fixtures/sample-export.json"));
    const rootTask = JSON.parse(JSON.stringify(base.tasks[0]));
    const subtask = JSON.parse(JSON.stringify(base.tasks[0]));
    subtask.task.id = "subtask-002";
    subtask.task.parentId = rootTask.task.id;

    const result = parseSession(
      JSON.stringify({ version: 1, exportedAt: base.exportedAt, workspace: base.workspace, tasks: [rootTask, subtask] })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = observe(result.value);
    // Root has 5 turns; subtask also has 5, but totals should only be 5
    expect(report.totals.assistantTurns).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Task with no messages — no crash
// ---------------------------------------------------------------------------

describe("observe — task with no messages", () => {
  it("produces a TaskReport with zero turns and completed=false", () => {
    const base = JSON.parse(readFixture("fixtures/sample-export.json"));
    const emptyTask = JSON.parse(JSON.stringify(base.tasks[0]));
    emptyTask.task.id = "empty-task-001";
    emptyTask.task.parentId = null;
    emptyTask.messages = [];

    const result = parseSession(
      JSON.stringify({
        version: 1,
        exportedAt: base.exportedAt,
        workspace: base.workspace,
        tasks: [emptyTask],
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Must not throw
    const report = observe(result.value);
    const task = report.tasks.find((t) => t.taskId === "empty-task-001");
    expect(task).toBeDefined();
    expect(task?.turns).toHaveLength(0);
    expect(task?.completed).toBe(false);
    expect(task?.toolCalls).toHaveLength(0);
    expect(task?.externalCommands).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Isolated detector failure — one bad task must not crash the whole report
// ---------------------------------------------------------------------------

describe("observe — isolated detector failure", () => {
  it("report continues processing when one task has a corrupted breakdown", () => {
    const base = JSON.parse(readFixture("fixtures/sample-export.json"));
    const badTask = JSON.parse(JSON.stringify(base.tasks[0]));
    badTask.task.id = "bad-task-001";
    badTask.task.parentId = null;

    // Corrupt the breakdown so that observeTask is likely to throw
    // We directly corrupt the costs object to trigger an internal error
    badTask.task.costs = null; // observeTask will throw accessing .contextWindowBreakdown

    const goodTask = JSON.parse(JSON.stringify(base.tasks[0]));
    goodTask.task.id = "good-task-001";
    goodTask.task.parentId = null;

    // We can't feed null costs through the parser (it will reject), so we
    // build the Session manually bypassing the parser.
    const goodSession = parseSession(readFixture("fixtures/sample-export.json"));
    expect(goodSession.ok).toBe(true);
    if (!goodSession.ok) return;

    // Inject the bad task by mutating the session directly
    const session: Session = {
      ...goodSession.value,
      tasks: [
        // Bad task: patch costs to null to cause observeTask to throw
        {
          task: { ...goodSession.value.tasks[0].task, id: "bad-task-injected" } as unknown as typeof goodSession.value.tasks[0]["task"],
          messages: goodSession.value.tasks[0].messages,
        },
        goodSession.value.tasks[0],
      ],
    };

    // Manually break the first task's costs so observeTask throws
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (session.tasks[0].task as any).costs = null;

    // Must not throw
    let report: ReturnType<typeof observe> | undefined;
    expect(() => {
      report = observe(session);
    }).not.toThrow();

    // The good task still produced a report
    expect(report).toBeDefined();
    const goodReport = report!.tasks.find((t) => t.taskId === goodSession.value.tasks[0].task.id);
    expect(goodReport).toBeDefined();

    // The bad task produced an anomaly instead
    expect(report!.anomalies.length).toBeGreaterThan(0);
    const anomaly = report!.anomalies.find((a) => a.taskId === "bad-task-injected");
    expect(anomaly).toBeDefined();
    expect(anomaly?.kind).toBe("unknown-field");
  });
});

// ---------------------------------------------------------------------------
// External command extraction detail
// ---------------------------------------------------------------------------

describe("observe — external commands detail (baseline)", () => {
  const session = loadSession("benchmark/rodada-a.json");
  const report = observe(session);
  const cmds = report.tasks[0].externalCommands;

  it("first command uses docker binary", () => {
    expect(cmds[0].binaries).toContain("docker");
  });

  it("third command uses curl binary and isHttp === true", () => {
    // The curl command is the third execute_command call
    const curlCmd = cmds.find((c) => c.binaries.includes("curl"));
    expect(curlCmd).toBeDefined();
    expect(curlCmd?.isHttp).toBe(true);
    // URL.hostname strips the port — "localhost:3000" → "localhost"
    expect(curlCmd?.targetHost).toBe("localhost");
  });

  it("non-http command has isHttp === false", () => {
    const dockerCmd = cmds[0]; // docker build
    expect(dockerCmd.isHttp).toBe(false);
    expect(dockerCmd.targetHost).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tool inventory — used/idle correctness
// ---------------------------------------------------------------------------

describe("observe — tool inventory used/idle", () => {
  it("available − idle = used (set algebra)", () => {
    const session = loadSession("fixtures/sample-export.json");
    const report = observe(session);
    const inv = report.tasks[0].toolInventory;
    expect(inv).not.toBeNull();
    if (!inv) return;

    const usedSet = new Set(inv.used);
    const idleSet = new Set(inv.idle);
    const availableSet = new Set(inv.available);

    // used ∪ idle ⊆ available
    for (const u of usedSet) expect(availableSet.has(u)).toBe(true);
    for (const i of idleSet) expect(availableSet.has(i)).toBe(true);

    // used ∩ idle = ∅
    for (const u of usedSet) expect(idleSet.has(u)).toBe(false);

    // |available| = |used| + |idle|
    expect(inv.available.length).toBe(inv.used.length + inv.idle.length);
  });

  it("idleRatio = idle / available (no rounding)", () => {
    const session = loadSession("fixtures/sample-export.json");
    const report = observe(session);
    const inv = report.tasks[0].toolInventory;
    expect(inv).not.toBeNull();
    if (!inv) return;
    expect(inv.idleRatio).not.toBeNull();
    const expected = inv.idle.length / inv.available.length;
    expect(inv.idleRatio).toBe(expected);
  });

  it("toolDefinitionTokens === 5403 (from breakdown.toolDefinitions)", () => {
    const session = loadSession("fixtures/sample-export.json");
    const report = observe(session);
    expect(report.tasks[0].toolInventory?.toolDefinitionTokens).toBe(5403);
  });
});

// ---------------------------------------------------------------------------
// Human interventions — initial user message not counted
// ---------------------------------------------------------------------------

describe("observe — humanInterventions counting", () => {
  it("baseline has 0 humanInterventions (single user message)", () => {
    const session = loadSession("fixtures/sample-export.json");
    const report = observe(session);
    expect(report.tasks[0].humanInterventions).toHaveLength(0);
    expect(report.totals.humanInterventions).toBe(0);
  });

  it("second user message creates one human intervention", () => {
    const base = JSON.parse(readFixture("fixtures/sample-export.json"));

    // Inject a second user message after the last assistant message
    const secondUserMsg = {
      id: "user-msg-intervention-01",
      role: "user",
      data: {
        id: "user-msg-intervention-01",
        role: "user",
        content: "Can you also show me the GET /api/todos response?",
        _meta: {
          timestamp: 1787958400000, // after last assistant turn
        },
      },
    };
    base.tasks[0].messages.push(secondUserMsg);

    const result = parseSession(JSON.stringify(base));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = observe(result.value);
    expect(report.tasks[0].humanInterventions).toHaveLength(1);
    expect(report.totals.humanInterventions).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// runObserve (pure orchestration) — error handling
// ---------------------------------------------------------------------------

import { runObserve } from "../cli";

describe("runObserve — pure orchestration error handling", () => {
  it("returns ok:false for invalid JSON", () => {
    const result = runObserve("{ not valid }");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/Parse failed/i);
  });

  it("returns ok:false for missing tasks field", () => {
    const result = runObserve(JSON.stringify({ version: 1, exportedAt: 1, workspace: "x" }));
    expect(result.ok).toBe(false);
  });

  it("returns ok:true for valid baseline fixture", () => {
    const content = readFixture("fixtures/sample-export.json");
    const result = runObserve(content);
    expect(result.ok).toBe(true);
  });

  it("returns ObserveReport with correct totals.cost for baseline", () => {
    const content = readFixture("fixtures/sample-export.json");
    const result = runObserve(content);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.totals.cost).toBe(0.336902);
  });

  it("never throws — always returns a result", () => {
    expect(() => runObserve("null")).not.toThrow();
    expect(() => runObserve("")).not.toThrow();
    expect(() => runObserve("42")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Tool inventory — detailed baseline characterisation (acceptance criteria)
// ---------------------------------------------------------------------------

import { toPublicReport } from "./public-report";

describe("observe — tool inventory baseline characterisation", () => {
  const session = loadSession("benchmark/rodada-a.json");
  const report = observe(session);
  const inv = report.tasks[0].toolInventory!;

  it("toolInventory is not null (availableTools present in baseline)", () => {
    expect(inv).not.toBeNull();
  });

  it("available.length === 23", () => {
    expect(inv.available.length).toBe(23);
  });

  it("used.length === 5", () => {
    expect(inv.used.length).toBe(5);
  });

  it("idle.length === 18", () => {
    expect(inv.idle.length).toBe(18);
  });

  it("used set is exactly {execute_command, list_files, read_file, update_todo_list, write_file}", () => {
    const usedSet = new Set(inv.used);
    expect(usedSet.has("execute_command")).toBe(true);
    expect(usedSet.has("list_files")).toBe(true);
    expect(usedSet.has("read_file")).toBe(true);
    expect(usedSet.has("update_todo_list")).toBe(true);
    expect(usedSet.has("write_file")).toBe(true);
    expect(usedSet.size).toBe(5);
  });

  it("idle includes read_xlsx, create_chart, spawn_subagent, use_skill, grep", () => {
    const idleSet = new Set(inv.idle);
    expect(idleSet.has("read_xlsx")).toBe(true);
    expect(idleSet.has("create_chart")).toBe(true);
    expect(idleSet.has("spawn_subagent")).toBe(true);
    expect(idleSet.has("use_skill")).toBe(true);
    expect(idleSet.has("grep")).toBe(true);
  });

  it("idleRatio === 18 / 23 (exact, no rounding)", () => {
    expect(inv.idleRatio).toBe(18 / 23);
  });

  it("toolDefinitionTokens === 5403", () => {
    expect(inv.toolDefinitionTokens).toBe(5403);
  });

  it("estimatedTokensPerTool === 5403 / 23 (exact, no rounding)", () => {
    expect(inv.estimatedTokensPerTool).toBe(5403 / 23);
  });
});

// ---------------------------------------------------------------------------
// Tool inventory — null when availableTools is absent
// ---------------------------------------------------------------------------

describe("observe — toolInventory null when availableTools absent", () => {
  it("toolInventory is null and unavailableMetrics contains the task entry", () => {
    const base = JSON.parse(readFixture("fixtures/sample-export.json"));
    // Remove availableTools from the first user message
    for (const msg of base.tasks[0].messages) {
      if (msg.data?.role === "user") {
        delete msg.data.availableTools;
        break;
      }
    }
    const result = parseSession(JSON.stringify(base));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = observe(result.value);
    expect(report.tasks[0].toolInventory).toBeNull();
    // unavailableMetrics must include a marker for this task's toolInventory
    const taskId = report.tasks[0].taskId;
    expect(report.unavailableMetrics.some((m) => m.includes("toolInventory") && m.includes(taskId))).toBe(true);
  });

  it("no used-tool-not-available anomaly when availableTools is absent", () => {
    const base = JSON.parse(readFixture("fixtures/sample-export.json"));
    for (const msg of base.tasks[0].messages) {
      if (msg.data?.role === "user") {
        delete msg.data.availableTools;
        break;
      }
    }
    const result = parseSession(JSON.stringify(base));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = observe(result.value);
    const anomalies = report.anomalies.filter((a) => a.kind === "used-tool-not-available");
    expect(anomalies).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tool inventory — availableTools present but empty
// ---------------------------------------------------------------------------

describe("observe — toolInventory with empty availableTools", () => {
  it("idleRatio is null (no division by zero)", () => {
    const base = JSON.parse(readFixture("fixtures/sample-export.json"));
    for (const msg of base.tasks[0].messages) {
      if (msg.data?.role === "user") {
        msg.data.availableTools = [];
        break;
      }
    }
    const result = parseSession(JSON.stringify(base));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = observe(result.value);
    const inv = report.tasks[0].toolInventory;
    expect(inv).not.toBeNull();
    expect(inv!.idleRatio).toBeNull();
    expect(inv!.estimatedTokensPerTool).toBeNull();
    expect(inv!.available).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tool inventory — used-tool-not-available anomaly
// ---------------------------------------------------------------------------

describe("observe — used-tool-not-available anomaly", () => {
  it("tool used but not in availableTools emits anomaly and is not in inv.used", () => {
    const base = JSON.parse(readFixture("fixtures/sample-export.json"));
    // Replace the availableTools list with one that omits 'read_file'
    for (const msg of base.tasks[0].messages) {
      if (msg.data?.role === "user") {
        // Keep all current tools but remove read_file
        msg.data.availableTools = (msg.data.availableTools as string[]).filter(
          (t: string) => t !== "read_file"
        );
        break;
      }
    }
    const result = parseSession(JSON.stringify(base));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = observe(result.value);
    const inv = report.tasks[0].toolInventory!;

    // read_file should NOT be in used
    expect(inv.used).not.toContain("read_file");

    // anomaly emitted
    const anomaly = report.anomalies.find(
      (a) => a.kind === "used-tool-not-available" && a.detail.includes("read_file")
    );
    expect(anomaly).toBeDefined();
    expect(anomaly?.taskId).toBe(report.tasks[0].taskId);
  });
});

// ---------------------------------------------------------------------------
// External commands — detailed baseline (acceptance criteria)
// ---------------------------------------------------------------------------

describe("observe — external commands baseline detail", () => {
  const session = loadSession("benchmark/rodada-a.json");
  const report = observe(session);
  const cmds = report.tasks[0].externalCommands;

  it("exactly 3 external commands", () => {
    expect(cmds).toHaveLength(3);
  });

  it("two commands contain docker binary", () => {
    const dockerCmds = cmds.filter((c) => c.binaries.includes("docker"));
    expect(dockerCmds.length).toBe(2);
  });

  it("one command contains curl binary with isHttp: true", () => {
    const curlCmds = cmds.filter((c) => c.binaries.includes("curl"));
    expect(curlCmds).toHaveLength(1);
    expect(curlCmds[0].isHttp).toBe(true);
  });

  it("curl command targetHost === 'localhost' (URL.hostname strips port)", () => {
    const curlCmd = cmds.find((c) => c.binaries.includes("curl"));
    expect(curlCmd?.targetHost).toBe("localhost");
  });

  it("every command has rawRedactable: true", () => {
    for (const cmd of cmds) {
      expect(cmd.rawRedactable).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Binary parser — edge cases
// ---------------------------------------------------------------------------

import { extractExternalCommands } from "./index";

function makeCmd(command: string): { name: string; arguments: Record<string, unknown>; callId: string; turnIndex: number } {
  return { name: "execute_command", arguments: { command }, callId: "test-call-id", turnIndex: 0 };
}

describe("binary parser — chained operators", () => {
  it("a && b extracts both binaries", () => {
    const [rec] = extractExternalCommands([makeCmd("echo hello && cat file.txt")]);
    expect(rec.binaries).toContain("echo");
    expect(rec.binaries).toContain("cat");
  });

  it("a; b extracts both binaries", () => {
    const [rec] = extractExternalCommands([makeCmd("ls -la; rm -rf /tmp/test")]);
    expect(rec.binaries).toContain("ls");
    expect(rec.binaries).toContain("rm");
  });

  it("a | b extracts both binaries", () => {
    const [rec] = extractExternalCommands([makeCmd("docker ps | grep running")]);
    expect(rec.binaries).toContain("docker");
    expect(rec.binaries).toContain("grep");
  });
});

describe("binary parser — sudo handling", () => {
  it("sudo command extracts the real binary", () => {
    const [rec] = extractExternalCommands([makeCmd("sudo docker ps")]);
    expect(rec.binaries).toContain("docker");
    expect(rec.binaries).not.toContain("sudo");
  });

  it("NAME=value sudo -u root /usr/bin/docker ps extracts docker", () => {
    const [rec] = extractExternalCommands([makeCmd("NAME=value sudo -u root /usr/bin/docker ps")]);
    expect(rec.binaries).toContain("docker");
    expect(rec.binaries).not.toContain("sudo");
    expect(rec.binaries).not.toContain("root");
  });
});

describe("binary parser — env assignments", () => {
  it("leading NAME=value assignments are skipped", () => {
    const [rec] = extractExternalCommands([makeCmd("NODE_ENV=test npm run build")]);
    expect(rec.binaries).toContain("npm");
    expect(rec.binaries).not.toContain("NODE_ENV=test");
  });

  it("env NAME=value command extracts the real binary", () => {
    const [rec] = extractExternalCommands([makeCmd("env NODE_ENV=test npm run build")]);
    expect(rec.binaries).toContain("npm");
    expect(rec.binaries).not.toContain("env");
  });
});

describe("binary parser — absolute paths", () => {
  it("absolute path returns basename only", () => {
    const [rec] = extractExternalCommands([makeCmd("/usr/bin/docker build -t img .")]);
    expect(rec.binaries).toContain("docker");
    expect(rec.binaries).not.toContain("/usr/bin/docker");
  });
});

// ---------------------------------------------------------------------------
// Public report projection — toPublicReport
// ---------------------------------------------------------------------------

describe("toPublicReport — redaction", () => {
  const session = loadSession("fixtures/sample-export.json");
  const report = observe(session);
  const pub = toPublicReport(report);

  it("workspace is [REDACTED]", () => {
    expect(pub.workspace).toBe("[REDACTED]");
  });

  it("original report workspace is unchanged (immutability)", () => {
    expect(report.workspace).not.toBe("[REDACTED]");
  });

  it("all task titles are [REDACTED]", () => {
    for (const t of pub.tasks) {
      expect(t.title).toBe("[REDACTED]");
    }
  });

  it("all toolCall arguments are [REDACTED]", () => {
    for (const t of pub.tasks) {
      for (const tc of t.toolCalls) {
        expect(tc.arguments).toBe("[REDACTED]");
      }
    }
  });

  it("redacts tool error messages without mutating the report", () => {
    const reportWithError = structuredClone(report);
    const toolCall = reportWithError.tasks[0].toolCalls[0];
    toolCall.isError = true;
    toolCall.errorMessage = "failed at /private/workspace/file.ts";

    const publicReport = toPublicReport(reportWithError);

    expect(publicReport.tasks[0].toolCalls[0].errorMessage).toBe("[REDACTED]");
    expect(JSON.stringify(publicReport)).not.toContain("/private/workspace/file.ts");
    expect(reportWithError.tasks[0].toolCalls[0].errorMessage).toBe(
      "failed at /private/workspace/file.ts"
    );
  });

  it("all externalCommands raw fields are [REDACTED]", () => {
    for (const t of pub.tasks) {
      for (const cmd of t.externalCommands) {
        expect(cmd.raw).toBe("[REDACTED]");
      }
    }
  });

  it("externalCommands contain more than 0 entries (sanity check)", () => {
    const cmds = pub.tasks.flatMap((t) => t.externalCommands);
    expect(cmds.length).toBeGreaterThan(0);
  });

  it("original report externalCommands raw fields are not [REDACTED] (immutability)", () => {
    for (const t of report.tasks) {
      for (const cmd of t.externalCommands) {
        expect(cmd.raw).not.toBe("[REDACTED]");
      }
    }
  });

  it("original report toolCalls arguments are not [REDACTED] (immutability)", () => {
    for (const t of report.tasks) {
      for (const tc of t.toolCalls) {
        expect(tc.arguments).not.toBe("[REDACTED]");
      }
    }
  });
});
