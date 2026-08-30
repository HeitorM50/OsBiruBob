/**
 * Compare — index.test.ts
 *
 * Covers all 7 acceptance criteria from issue #20.
 *
 * Fixtures:
 *   benchmark/rodada-a.json — Round A baseline
 *   benchmark/rodada-b.json — Round B optimised
 *
 * Expected values (from the issue contract table):
 *   costA            = 0.336902
 *   costB            = 0.270606
 *   costDelta        = -0.066296
 *   fixedOverheadA   = 10439
 *   fixedOverheadB   = 7740
 *   fixedOverheadDelta = -2699
 *   contextTokensA   = 17584
 *   contextTokensB   = 13551
 *   contextTokensDelta = -4033
 *   assistantTurnsA  = 5
 *   assistantTurnsB  = 6
 *   assistantTurnsDelta = +1
 *   humanInterventionsA = 0
 *   humanInterventionsB = 0
 *   humanInterventionsDelta = 0
 *   projectRulesTokensA = 0
 *   projectRulesTokensB = 121
 *   valid            = true
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseSession } from "../parser/index";
import { observe } from "../observe/index";
import { compare } from "./index";
import type { ObserveReport } from "../domain/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readFixture(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf-8");
}

function observeFixture(relativePath: string): ObserveReport {
  const content = readFixture(relativePath);
  const result = parseSession(content);
  if (!result.ok) {
    throw new Error(`Fixture parse failed (${relativePath}): ${result.error.message}`);
  }
  return observe(result.value);
}

/** Build a minimal synthetic ObserveReport for unit tests. */
function makeReport(overrides: {
  sessionId?: string;
  rootTaskCount?: number;
  cost?: number;
  assistantTurns?: number;
  humanInterventions?: number;
  fixedOverhead?: number;
  contextTokens?: number;
  projectRules?: number;
  allowedPermissions?: Array<"read" | "edit" | "execute" | "todo">;
}): ObserveReport {
  const {
    sessionId = "sess-a",
    rootTaskCount = 1,
    cost = 0.1,
    assistantTurns = 2,
    humanInterventions = 0,
    fixedOverhead = 1000,
    contextTokens = 2000,
    projectRules = 0,
    allowedPermissions = ["read", "execute"],
  } = overrides;

  const tasks = Array.from({ length: rootTaskCount }, (_, i) => ({
    taskId: `task-${i}`,
    parentId: null,
    isSubtask: false,
    title: "[REDACTED]",
    modeId: "default",
    createdAt: 1000000,
    updatedAt: 1001000,
    durationMs: 1000,
    completed: true,
    cost,
    contextTokens,
    context: {
      fixedOverhead,
      reportedTotal: contextTokens,
      conversationTokens: contextTokens - fixedOverhead,
      reportedTotalInconsistent: false,
      breakdown: {
        roleDefinition: 0,
        staticSections: 0,
        skills: 0,
        baseRules: 0,
        projectRules,
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
    turns: Array.from({ length: assistantTurns }, (_, j) => ({
      index: j,
      messageId: `msg-${j}`,
      timestamp: 1000000,
      cost: cost / assistantTurns,
      contextTokens,
      contextDelta: null,
      reasoningTokens: 0,
      toolCallIds: [],
      stop: j === assistantTurns - 1,
    })),
    toolCalls: [],
    toolInventory: null,
    externalCommands: [],
    humanInterventions: Array.from({ length: humanInterventions }, (_, k) => ({
      messageId: `hi-${k}`,
      afterTurnIndex: 0,
      timestamp: 1000500,
      content: "[REDACTED]",
    })),
    approval: {
      autoApprovalEnabled: true,
      allowedPermissions,
      approvedCommands: [],
    },
  }));

  return {
    sessionId,
    exportedAt: 1000000,
    workspace: "[REDACTED]",
    tasks,
    totals: {
      taskCount: rootTaskCount,
      subtaskCount: 0,
      cost: cost * rootTaskCount,
      assistantTurns: assistantTurns * rootTaskCount,
      toolCalls: 0,
      erroredToolCalls: 0,
      humanInterventions: humanInterventions * rootTaskCount,
    },
    unavailableMetrics: ["buildFailures"],
    anomalies: [],
  };
}

// ---------------------------------------------------------------------------
// Test 1 — Characterisation against real benchmark fixtures
// ---------------------------------------------------------------------------

describe("compare — characterisation (rodada-a vs rodada-b)", () => {
  it("produces the expected metrics from benchmark fixtures", () => {
    const reportA = observeFixture("benchmark/rodada-a.json");
    const reportB = observeFixture("benchmark/rodada-b.json");

    const result = compare(reportA, reportB);
    const m = result.metrics;

    expect(result.valid).toBe(true);

    // Cost
    expect(m.costA).toBeCloseTo(0.336902, 6);
    expect(m.costB).toBeCloseTo(0.270606, 6);
    expect(m.costDelta).toBeCloseTo(-0.066296, 6);

    // Fixed overhead
    expect(m.fixedOverheadA).toBe(10439);
    expect(m.fixedOverheadB).toBe(7740);
    expect(m.fixedOverheadDelta).toBe(-2699);

    // Context tokens
    expect(m.contextTokensA).toBe(17584);
    expect(m.contextTokensB).toBe(13551);
    expect(m.contextTokensDelta).toBe(-4033);

    // Assistant turns
    expect(m.assistantTurnsA).toBe(5);
    expect(m.assistantTurnsB).toBe(6);
    expect(m.assistantTurnsDelta).toBe(1);

    // Human interventions
    expect(m.humanInterventionsA).toBe(0);
    expect(m.humanInterventionsB).toBe(0);
    expect(m.humanInterventionsDelta).toBe(0);

    // Project rules tokens
    expect(m.projectRulesTokensA).toBe(0);
    expect(m.projectRulesTokensB).toBe(121);
  });
});

// ---------------------------------------------------------------------------
// Test 2 — valid: false by permission difference
// ---------------------------------------------------------------------------

describe("compare — validation: permission set mismatch", () => {
  it("produces valid:false with invalidReason when allowedPermissions differ", () => {
    const reportA = makeReport({ allowedPermissions: ["read", "execute"] });
    const reportB = makeReport({ allowedPermissions: ["read", "edit", "execute"] });

    const result = compare(reportA, reportB);

    expect(result.valid).toBe(false);
    expect(result.invalidReason).toBeTruthy();
    expect(result.invalidReason).toContain("allowedPermissions");
  });
});

// ---------------------------------------------------------------------------
// Test 3 — permission order does not invalidate
// ---------------------------------------------------------------------------

describe("compare — validation: permission order is irrelevant", () => {
  it("keeps valid:true when same permissions appear in different order", () => {
    const reportA = makeReport({ allowedPermissions: ["read", "todo", "execute"] });
    const reportB = makeReport({ allowedPermissions: ["read", "execute", "todo"] });

    const result = compare(reportA, reportB);

    expect(result.valid).toBe(true);
    expect(result.invalidReason).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Test 4 — no rounding
// ---------------------------------------------------------------------------

describe("compare — no rounding on cost delta", () => {
  it("preserves IEEE 754 precision on costDelta", () => {
    const costA = 0.336902;
    const costB = 0.270606;
    const reportA = makeReport({ cost: costA });
    const reportB = makeReport({ cost: costB });

    const result = compare(reportA, reportB);

    // The delta must equal the exact floating-point subtraction — no rounding applied.
    expect(result.metrics.costDelta).toBe(costB - costA);
    expect(result.metrics.costDelta).not.toBe(Math.round((costB - costA) * 1e6) / 1e6);
  });
});

// ---------------------------------------------------------------------------
// Test 5 — regression is reported (positive delta)
// ---------------------------------------------------------------------------

describe("compare — regression reporting", () => {
  it("reports a positive assistantTurnsDelta when B has more turns than A", () => {
    const reportA = makeReport({ assistantTurns: 5 });
    const reportB = makeReport({ assistantTurns: 6 });

    const result = compare(reportA, reportB);

    expect(result.metrics.assistantTurnsDelta).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Test 6 — buildFailures stays absent
// ---------------------------------------------------------------------------

describe("compare — buildFailures is absent", () => {
  it("never fills buildFailures* fields — they must be absent", () => {
    const reportA = makeReport({});
    const reportB = makeReport({});

    const result = compare(reportA, reportB);
    const m = result.metrics;

    expect(m.buildFailuresA).toBeUndefined();
    expect(m.buildFailuresB).toBeUndefined();
    expect(m.buildFailuresDelta).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Test 7 — denominator zero does not produce Infinity or NaN
// ---------------------------------------------------------------------------

describe("compare — denominator-zero safety", () => {
  it("does not produce Infinity or NaN when cost is 0", () => {
    const reportA = makeReport({ cost: 0 });
    const reportB = makeReport({ cost: 0 });

    const result = compare(reportA, reportB);
    const m = result.metrics;

    expect(Number.isFinite(m.costDelta)).toBe(true);
    expect(Number.isNaN(m.costDelta)).toBe(false);
    expect(Number.isFinite(m.contextTokensDelta)).toBe(true);
    expect(Number.isFinite(m.fixedOverheadDelta)).toBe(true);
  });

  it("does not produce Infinity or NaN when contextTokens is 0", () => {
    const reportA = makeReport({ contextTokens: 0, fixedOverhead: 0 });
    const reportB = makeReport({ contextTokens: 0, fixedOverhead: 0 });

    const result = compare(reportA, reportB);
    const m = result.metrics;

    expect(Number.isFinite(m.contextTokensDelta)).toBe(true);
    expect(Number.isFinite(m.fixedOverheadDelta)).toBe(true);
  });
});
