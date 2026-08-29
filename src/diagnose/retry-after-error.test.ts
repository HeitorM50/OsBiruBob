import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import type {
  ObserveReport,
  TaskReport,
  ToolCallRecord,
} from "../domain/types";
import { observe } from "../observe/index";
import { parseSession } from "../parser/index";
import { detectRetryAfterError } from "./retry-after-error";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadBaselineReport(): ObserveReport {
  const raw = readFileSync(
    join(process.cwd(), "benchmark/rodada-a.json"),
    "utf-8"
  );
  const parsed = parseSession(raw);
  if (!parsed.ok) {
    throw new Error(`Baseline parse failed: ${parsed.error.message}`);
  }
  return observe(parsed.value);
}

function makeToolCallRecord(
  overrides: Partial<ToolCallRecord> & { callId: string; name: string; turnIndex: number }
): ToolCallRecord {
  return {
    arguments: {},
    assistantMessageId: `asst-${overrides.callId}`,
    resultMessageId: `result-${overrides.callId}`,
    isError: false,
    errorMessage: null,
    permission: "read",
    durationMs: 100,
    isOutsideWorkspace: false,
    ...overrides,
  };
}

function makeTaskReport(
  taskId: string,
  toolCalls: ToolCallRecord[]
): TaskReport {
  return {
    taskId,
    parentId: null,
    isSubtask: false,
    title: "[REDACTED]",
    modeId: "synthetic-test-mode",
    createdAt: 1_787_958_109_275,
    updatedAt: 1_787_958_332_549,
    durationMs: 223_274,
    completed: true,
    cost: 0,
    contextTokens: 0,
    context: {
      fixedOverhead: 0,
      reportedTotal: 0,
      conversationTokens: 0,
      reportedTotalInconsistent: false,
      breakdown: {
        roleDefinition: 0,
        staticSections: 0,
        skills: 0,
        baseRules: 0,
        projectRules: 0,
        customInstructions: 0,
        environment: 0,
        toolSystemPrompts: 0,
        toolDefinitions: 0,
        mcpToolDefinitions: 0,
      },
      breakdownPct: {
        roleDefinition: 0,
        staticSections: 0,
        skills: 0,
        baseRules: 0,
        projectRules: 0,
        customInstructions: 0,
        environment: 0,
        toolSystemPrompts: 0,
        toolDefinitions: 0,
        mcpToolDefinitions: 0,
      },
      breakdownSumDelta: 0,
      breakdownSumConsistent: true,
      loadedSkills: [],
      maxContextWindow: null,
      pressure: null,
    },
    turns: [],
    toolCalls,
    toolInventory: {
      available: [],
      used: [],
      idle: [],
      idleRatio: 0,
      toolDefinitionTokens: 0,
      estimatedTokensPerTool: null,
    },
    externalCommands: [],
    humanInterventions: [],
    approval: {
      autoApprovalEnabled: false,
      allowedPermissions: [],
      approvedCommands: [],
    },
  };
}

function makeReport(tasks: TaskReport[]): ObserveReport {
  return {
    sessionId: "test-session",
    exportedAt: 1_787_958_446_197,
    workspace: "[REDACTED]",
    tasks,
    totals: {
      taskCount: tasks.filter((t) => !t.isSubtask).length,
      subtaskCount: tasks.filter((t) => t.isSubtask).length,
      cost: 0,
      assistantTurns: 0,
      toolCalls: 0,
      erroredToolCalls: 0,
      humanInterventions: 0,
    },
    unavailableMetrics: [],
    anomalies: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("detectRetryAfterError", () => {
  // Test 1: baseline produces 0 findings.
  it("emits 0 findings for benchmark/rodada-a.json (no retries in the baseline)", () => {
    const report = loadBaselineReport();
    const findings = detectRetryAfterError(report);
    expect(findings).toHaveLength(0);
  });

  // Test 2: failure followed by same tool → 1 finding with both turns and schema.
  it("emits 1 finding when a failure is followed by the same tool in a later turn", () => {
    const toolCalls = [
      makeToolCallRecord({
        callId: "c1",
        name: "read_file",
        turnIndex: 0,
        isError: true,
        errorMessage: "Synthetic read error",
      }),
      makeToolCallRecord({ callId: "c2", name: "read_file", turnIndex: 1, isError: false }),
    ];
    const report = makeReport([makeTaskReport("task-a", toolCalls)]);
    const findings = detectRetryAfterError(report);

    expect(findings).toHaveLength(1);
    const f = findings[0];
    expect(f.kind).toBe("retry-after-error");
    expect(f.sessionId).toBe("test-session");
    expect(f.taskId).toBe("task-a");
    expect(f.confidence).toBe("high");
    expect(f.prescriptionHint).toBe("agents-md-section");
    expect(f.evidence.redactable).toBe(true);
    expect(f.evidence.type).toBe("cross-reference");
    expect(f.evidence.turnIndices).toEqual([0, 1]);
    expect(f.evidence.toolCallIds).toContain("c1");
    expect(f.evidence.toolCallIds).toContain("c2");
    expect(f.evidence.rawValue).toBe("Synthetic read error");
    expect(f.metric.toolName).toBe("read_file");
    expect(f.metric.firstErrorTurn).toBe(0);
    expect(f.metric.retryTurn).toBe(1);
    expect(f.metric.attemptCount).toBe(2);
  });

  // Test 3: retry with changed arguments → 1 finding (arguments are irrelevant).
  it("emits 1 finding when the retry uses different arguments (arguments are not compared)", () => {
    const toolCalls = [
      makeToolCallRecord({
        callId: "c1",
        name: "execute_command",
        turnIndex: 0,
        isError: true,
        arguments: { command: "npm build" },
      }),
      makeToolCallRecord({
        callId: "c2",
        name: "execute_command",
        turnIndex: 2,
        isError: false,
        arguments: { command: "npm run build" },
      }),
    ];
    const report = makeReport([makeTaskReport("task-b", toolCalls)]);
    const findings = detectRetryAfterError(report);

    expect(findings).toHaveLength(1);
    expect(findings[0].metric.toolName).toBe("execute_command");
    expect(findings[0].metric.firstErrorTurn).toBe(0);
    expect(findings[0].metric.retryTurn).toBe(2);
    expect(findings[0].metric.attemptCount).toBe(2);
  });

  // Test 4: different tool after failure → 0 findings.
  it("emits 0 findings when a different tool is called after the failure", () => {
    const toolCalls = [
      makeToolCallRecord({ callId: "c1", name: "read_file", turnIndex: 0, isError: true }),
      makeToolCallRecord({ callId: "c2", name: "write_file", turnIndex: 1, isError: false }),
    ];
    const report = makeReport([makeTaskReport("task-c", toolCalls)]);
    expect(detectRetryAfterError(report)).toHaveLength(0);
  });

  // Test 5: isError: null → 0 findings (null is missing data, not an error).
  it("emits 0 findings when isError is null (missing data must not trigger the detector)", () => {
    const toolCalls = [
      makeToolCallRecord({ callId: "c1", name: "read_file", turnIndex: 0, isError: null }),
      makeToolCallRecord({ callId: "c2", name: "read_file", turnIndex: 1, isError: false }),
    ];
    const report = makeReport([makeTaskReport("task-d", toolCalls)]);
    expect(detectRetryAfterError(report)).toHaveLength(0);
  });

  it("does not treat an unmatched call after a failure as a retry", () => {
    const toolCalls = [
      makeToolCallRecord({ callId: "c1", name: "read_file", turnIndex: 0, isError: true }),
      makeToolCallRecord({
        callId: "c2",
        name: "read_file",
        turnIndex: 1,
        isError: null,
        errorMessage: null,
        resultMessageId: null,
      }),
    ];
    const report = makeReport([makeTaskReport("task-orphan-retry", toolCalls)]);
    expect(detectRetryAfterError(report)).toHaveLength(0);
  });

  // Test 6: three attempts (fail → fail → success) → 1 finding with attemptCount = 3.
  it("emits 1 finding with attemptCount = 3 for a three-attempt chain ending in success", () => {
    const toolCalls = [
      makeToolCallRecord({ callId: "c1", name: "write_file", turnIndex: 0, isError: true }),
      makeToolCallRecord({ callId: "c2", name: "write_file", turnIndex: 1, isError: true }),
      makeToolCallRecord({ callId: "c3", name: "write_file", turnIndex: 2, isError: false }),
    ];
    const report = makeReport([makeTaskReport("task-e", toolCalls)]);
    const findings = detectRetryAfterError(report);

    expect(findings).toHaveLength(1);
    expect(findings[0].metric.attemptCount).toBe(3);
    expect(findings[0].metric.successObserved).toBe(true);
    expect(findings[0].metric.firstErrorTurn).toBe(0);
    expect(findings[0].metric.retryTurn).toBe(1);
    expect(findings[0].evidence.toolCallIds).toEqual(["c1", "c2", "c3"]);
  });

  it("counts retries when no successful result is observed", () => {
    const toolCalls = [
      makeToolCallRecord({ callId: "c1", name: "write_file", turnIndex: 0, isError: true }),
      makeToolCallRecord({ callId: "c2", name: "write_file", turnIndex: 2, isError: true }),
    ];
    const findings = detectRetryAfterError(
      makeReport([makeTaskReport("task-no-success", toolCalls)])
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].metric.attemptCount).toBe(2);
    expect(findings[0].metric.successObserved).toBe(false);
  });

  // Test 7: failure without a later retry → 0 findings.
  it("emits 0 findings when a failure has no later retry (unrecovered error is out of scope)", () => {
    const toolCalls = [
      makeToolCallRecord({ callId: "c1", name: "read_file", turnIndex: 0, isError: true }),
    ];
    const report = makeReport([makeTaskReport("task-f", toolCalls)]);
    expect(detectRetryAfterError(report)).toHaveLength(0);
  });

  it("stops counting attempts at the first success", () => {
    const toolCalls = [
      makeToolCallRecord({ callId: "c1", name: "read_file", turnIndex: 0, isError: true }),
      makeToolCallRecord({ callId: "c2", name: "read_file", turnIndex: 1, isError: false }),
      makeToolCallRecord({ callId: "c3", name: "read_file", turnIndex: 4, isError: false }),
    ];
    const findings = detectRetryAfterError(
      makeReport([makeTaskReport("task-stop-at-success", toolCalls)])
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].metric.attemptCount).toBe(2);
    expect(findings[0].evidence.toolCallIds).toEqual(["c1", "c2"]);
  });

  it("emits separate findings for independent retry chains of the same tool", () => {
    const toolCalls = [
      makeToolCallRecord({ callId: "c1", name: "read_file", turnIndex: 0, isError: true }),
      makeToolCallRecord({ callId: "c2", name: "read_file", turnIndex: 1, isError: false }),
      makeToolCallRecord({ callId: "c3", name: "read_file", turnIndex: 3, isError: true }),
      makeToolCallRecord({ callId: "c4", name: "read_file", turnIndex: 4, isError: false }),
    ];
    const findings = detectRetryAfterError(
      makeReport([makeTaskReport("task-independent-chains", toolCalls)])
    );

    expect(findings).toHaveLength(2);
    expect(findings.map((finding) => finding.evidence.turnIndices)).toEqual([
      [0, 1],
      [3, 4],
    ]);
    expect(new Set(findings.map((finding) => finding.id)).size).toBe(2);
  });

  it("excludes parallel same-turn calls from the retry attempt count", () => {
    const toolCalls = [
      makeToolCallRecord({ callId: "c1", name: "read_file", turnIndex: 0, isError: true }),
      makeToolCallRecord({ callId: "c2", name: "read_file", turnIndex: 0, isError: false }),
      makeToolCallRecord({ callId: "c3", name: "read_file", turnIndex: 1, isError: false }),
    ];
    const findings = detectRetryAfterError(
      makeReport([makeTaskReport("task-parallel", toolCalls)])
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].metric.attemptCount).toBe(2);
    expect(findings[0].evidence.toolCallIds).toEqual(["c1", "c3"]);
  });

  // Regression: isError === false alone should not trigger.
  it("emits 0 findings when all calls succeed", () => {
    const toolCalls = [
      makeToolCallRecord({ callId: "c1", name: "read_file", turnIndex: 0, isError: false }),
      makeToolCallRecord({ callId: "c2", name: "read_file", turnIndex: 1, isError: false }),
    ];
    const report = makeReport([makeTaskReport("task-g", toolCalls)]);
    expect(detectRetryAfterError(report)).toHaveLength(0);
  });

  // Regression: empty toolCalls → 0 findings.
  it("emits 0 findings for a task with no tool calls", () => {
    const report = makeReport([makeTaskReport("task-h", [])]);
    expect(detectRetryAfterError(report)).toHaveLength(0);
  });

  // Regression: two separate tools, each retried → 2 findings.
  it("emits 2 findings when two different tools are each independently retried", () => {
    const toolCalls = [
      makeToolCallRecord({ callId: "c1", name: "read_file",  turnIndex: 0, isError: true }),
      makeToolCallRecord({ callId: "c2", name: "write_file", turnIndex: 1, isError: true }),
      makeToolCallRecord({ callId: "c3", name: "read_file",  turnIndex: 2, isError: false }),
      makeToolCallRecord({ callId: "c4", name: "write_file", turnIndex: 3, isError: false }),
    ];
    const report = makeReport([makeTaskReport("task-i", toolCalls)]);
    const findings = detectRetryAfterError(report);

    expect(findings).toHaveLength(2);
    const toolNames = findings.map((f) => f.metric.toolName as string).sort();
    expect(toolNames).toEqual(["read_file", "write_file"]);
  });

  // Regression: same tool in a later task turn (same turnIndex is NOT a retry).
  it("does not count a retry within the same turn (later turn required)", () => {
    // Both calls happen on turn 0 — parallel calls; no later-turn retry.
    const toolCalls = [
      makeToolCallRecord({ callId: "c1", name: "read_file", turnIndex: 0, isError: true }),
      makeToolCallRecord({ callId: "c2", name: "read_file", turnIndex: 0, isError: false }),
    ];
    const report = makeReport([makeTaskReport("task-j", toolCalls)]);
    expect(detectRetryAfterError(report)).toHaveLength(0);
  });

  // Regression: detector is pure — does not mutate input.
  it("is deterministic and does not mutate its input", () => {
    const toolCalls = [
      makeToolCallRecord({ callId: "c1", name: "read_file", turnIndex: 0, isError: true }),
      makeToolCallRecord({ callId: "c2", name: "read_file", turnIndex: 1, isError: false }),
    ];
    const report = makeReport([makeTaskReport("task-k", toolCalls)]);
    const before = structuredClone(report);

    const first  = detectRetryAfterError(report);
    const second = detectRetryAfterError(report);

    expect(first).toEqual(second);
    expect(report).toEqual(before);
  });
});
