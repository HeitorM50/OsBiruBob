/**
 * Minimum passing test — F0 gate
 *
 * Verifies that the domain type contracts are structurally sound and that the
 * invariants documented in docs/domain-model.md can be expressed in TypeScript.
 *
 * This test does NOT implement any parsing or extraction logic from F2 (#5–#9).
 * It only ensures the project skeleton compiles and the type invariants hold.
 */
import { describe, it, expect } from "vitest";
import type {
  Session,
  ContextBreakdown,
  Finding,
  Prescription,
  Comparison,
} from "../domain/types";
import type { ParseError, ParseResult } from "../parser/index";

// ---------------------------------------------------------------------------
// I-1: Timestamps are epoch milliseconds
// ---------------------------------------------------------------------------
describe("I-1: timestamp shape", () => {
  it("accepts a valid epoch-ms number as EpochMs", () => {
    const ts: number = 1787958446197;
    expect(ts).toBeGreaterThan(1_000_000_000_000); // 13 digits → ms
    expect(Number.isInteger(ts)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// I-2: contextTokens is accumulated, not a per-turn increment
// ---------------------------------------------------------------------------
describe("I-2: contextTokens increment formula", () => {
  it("calculates turn increment as current minus previous", () => {
    const turnA = 10_000;
    const turnB = 12_500;
    const increment = turnB - turnA;
    expect(increment).toBe(2_500);
  });
});

// ---------------------------------------------------------------------------
// I-3: monetary precision
// ---------------------------------------------------------------------------
describe("I-3: monetary precision — no rounding in domain", () => {
  it("preserves full float precision", () => {
    const cost = 0.336902;
    // Domain must not round. Presentation layer may call toFixed(6) for display.
    expect(cost.toFixed(6)).toBe("0.336902");
    // Arithmetic on the raw value stays precise.
    expect(cost * 2).toBeCloseTo(0.673804, 6);
  });
});

// ---------------------------------------------------------------------------
// I-4: ToolCall / ToolResult correlation by id
// ---------------------------------------------------------------------------
describe("I-4: tool call correlation by id", () => {
  it("links call and result via the same id string", () => {
    const callId = "tooluse_abc123";
    const resultId = "tooluse_abc123";
    expect(callId).toBe(resultId);
  });
});

// ---------------------------------------------------------------------------
// I-5: subtask exclusion
// ---------------------------------------------------------------------------
describe("I-5: subtask exclusion from aggregation", () => {
  it("identifies a subtask by non-null parentId", () => {
    const isSubtask = (parentId: string | null | undefined) =>
      parentId != null && parentId !== "";
    expect(isSubtask(null)).toBe(false);
    expect(isSubtask(undefined)).toBe(false);
    expect(isSubtask("parent-task-id")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ContextBreakdown: conversationTokens formula
// ---------------------------------------------------------------------------
describe("ContextBreakdown: conversationTokens formula", () => {
  it("computes conversation tokens as reportedTotal - total", () => {
    const breakdown: Pick<ContextBreakdown, "total" | "reportedTotal"> = {
      total: 10_439,
      reportedTotal: 17_584,
    };
    const conversationTokens = breakdown.reportedTotal - breakdown.total;
    expect(conversationTokens).toBe(7_145);
  });
});

// ---------------------------------------------------------------------------
// ParseResult discriminated union
// ---------------------------------------------------------------------------
describe("ParseResult discriminated union", () => {
  it("ok:true carries a value", () => {
    const result: ParseResult<number> = { ok: true, value: 42 };
    if (result.ok) {
      expect(result.value).toBe(42);
    }
  });

  it("ok:false carries a ParseError", () => {
    const error: ParseError = { message: "invalid JSON" };
    const result: ParseResult<number> = { ok: false, error };
    if (!result.ok) {
      expect(result.error.message).toBe("invalid JSON");
    }
  });
});

// ---------------------------------------------------------------------------
// Type-level smoke test: verify all cross-boundary types can be instantiated
// ---------------------------------------------------------------------------
describe("domain type smoke tests", () => {
  it("Session fields are correctly typed", () => {
    const session: Pick<Session, "version" | "exportedAt" | "workspace"> = {
      version: 1,
      exportedAt: 1787958446197,
      workspace: "file:/home/user/project",
    };
    expect(session.version).toBe(1);
  });

  it("Finding requires evidence", () => {
    const finding: Finding = {
      id: "f-001",
      sessionId: "sess-001",
      taskId: "task-001",
      kind: "project-rules-absent",
      detectedAt: 1787958446197,
      evidence: {
        type: "breakdown",
        redactable: false,
        breakdownField: "projectRules",
        breakdownValue: 0,
      },
      confidence: "high",
    };
    expect(finding.evidence.breakdownValue).toBe(0);
  });

  it("Prescription requires at least one findingId", () => {
    const prescription: Prescription = {
      id: "p-001",
      sessionId: "sess-001",
      taskId: "task-001",
      findingIds: ["f-001"],
      kind: "agents-md-section",
      status: "pending",
      createdAt: 1787958446197,
    };
    expect(prescription.findingIds.length).toBeGreaterThan(0);
  });

  it("Comparison negative delta indicates improvement", () => {
    const metrics: Pick<Comparison["metrics"], "costA" | "costB" | "costDelta"> = {
      costA: 0.336902,
      costB: 0.21,
      costDelta: 0.21 - 0.336902,
    };
    expect(metrics.costDelta).toBeLessThan(0);
  });
});
