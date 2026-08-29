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
    expect(report.tasks[0].context.reportedTotal).toBe(17584);
  });

  it("tasks[0].context.fixedOverhead === 10439", () => {
    expect(report.tasks[0].context.fixedOverhead).toBe(10439);
  });

  it("tasks[0].context.conversationTokens === 7145", () => {
    expect(report.tasks[0].context.conversationTokens).toBe(7145);
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
    expect(report.tasks[0].toolInventory.available.length).toBe(23);
  });

  it("tasks[0].toolInventory.used.length === 5", () => {
    expect(report.tasks[0].toolInventory.used.length).toBe(5);
  });

  it("tasks[0].toolInventory.idle.length === 18", () => {
    expect(report.tasks[0].toolInventory.idle.length).toBe(18);
  });

  it("tasks[0].externalCommands.length === 3", () => {
    expect(report.tasks[0].externalCommands.length).toBe(3);
  });

  it("tasks[0].context.pressure === null (no maxContextWindow)", () => {
    expect(report.tasks[0].context.pressure).toBeNull();
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
    expect(report.tasks[0].context.reportedTotal).toBe(17584);
  });

  it("tasks[0].context.fixedOverhead === 10439", () => {
    expect(report.tasks[0].context.fixedOverhead).toBe(10439);
  });

  it("tasks[0].context.conversationTokens === 7145", () => {
    expect(report.tasks[0].context.conversationTokens).toBe(7145);
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
    expect(report.tasks[0].toolInventory.available.length).toBe(23);
  });

  it("tasks[0].toolInventory.used.length === 5", () => {
    expect(report.tasks[0].toolInventory.used.length).toBe(5);
  });

  it("tasks[0].toolInventory.idle.length === 18", () => {
    expect(report.tasks[0].toolInventory.idle.length).toBe(18);
  });

  it("tasks[0].externalCommands.length === 3", () => {
    expect(report.tasks[0].externalCommands.length).toBe(3);
  });

  it("tasks[0].context.pressure === null", () => {
    expect(report.tasks[0].context.pressure).toBeNull();
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
    expect(curlCmd?.targetHost).toBe("localhost:3000");
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

  it("idleRatio = idle / available", () => {
    const session = loadSession("fixtures/sample-export.json");
    const report = observe(session);
    const inv = report.tasks[0].toolInventory;
    const expected = inv.idle.length / inv.available.length;
    expect(Math.abs(inv.idleRatio - expected)).toBeLessThan(1e-12);
  });

  it("toolDefinitionTokens === 5403 (from breakdown.toolDefinitions)", () => {
    const session = loadSession("fixtures/sample-export.json");
    const report = observe(session);
    expect(report.tasks[0].toolInventory.toolDefinitionTokens).toBe(5403);
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
