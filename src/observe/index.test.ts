/**
 * Observe — ContextSummary tests
 *
 * Covers all 11 acceptance criteria from the issue.
 * Uses local fixtures only — no network, no API key, no external services.
 *
 * Fixture: benchmark/rodada-a.json
 * Expected baseline values from domain-model.md compliance gate:
 *   total (fixedOverhead) = 10439
 *   reportedTotal         = 17584
 *   conversationTokens    = 7145
 *   projectRules          = 0
 *   toolDefinitions       = 5403  → ~51.76% of 10439
 * Observe tests — extractTurnMetrics
 *
 * Baseline characterisation uses benchmark/rodada-a.json (same content as
 * fixtures/sample-export.json). Synthetic fixtures cover edge-cases not present
 * in the real export.
 *
 * No network, no API key, no external services. All fixtures are local.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseSession } from "../parser/index";
import {
  buildContextSummary,
  breakdownSumDelta,
  BREAKDOWN_SUM_TOLERANCE,
} from "./index";
import type { ContextBreakdown } from "../domain/types";
import { extractTurnMetrics } from "./index";
import type { Message } from "../domain/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readFixture(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf-8");
}

function getBaselineBreakdown(): ContextBreakdown {
  const content = readFixture("benchmark/rodada-a.json");
  const result = parseSession(content);
  if (!result.ok) throw new Error("Fixture parse failed: " + result.error.message);
  return result.value.tasks[0].task.costs.contextWindowBreakdown;
}

/** Minimal valid ContextBreakdown builder for synthetic test cases. */
function makeBreakdown(
  overrides: Partial<ContextBreakdown> & { breakdownOverrides?: Partial<Record<string, number>> }
): ContextBreakdown {
  const { breakdownOverrides = {}, ...rest } = overrides;
  return {
    total: 1000,
    reportedTotal: 1200,
    key: "test",
    breakdown: {
      roleDefinition: 100,
      staticSections: 100,
      skills: 100,
      baseRules: 100,
      projectRules: 100,
      customInstructions: 100,
      environment: 100,
      toolSystemPrompts: 100,
      toolDefinitions: 100,
      mcpToolDefinitions: 0,
      ...breakdownOverrides,
    },
    ...rest,
  };
}

// ---------------------------------------------------------------------------
// Test 1 — Real baseline fixture (benchmark/rodada-a.json via sample-export.json)
// ---------------------------------------------------------------------------

describe("buildContextSummary — baseline fixture", () => {
  const bd = getBaselineBreakdown();
  const summary = buildContextSummary(bd);

  it("fixedOverhead equals bd.total (10439)", () => {
    expect(summary.fixedOverhead).toBe(10439);
  });

  it("reportedTotal equals bd.reportedTotal (17584)", () => {
    expect(summary.reportedTotal).toBe(17584);
  });

  it("conversationTokens equals reportedTotal − fixedOverhead (7145)", () => {
    expect(summary.conversationTokens).toBe(7145);
  });

  it("does not flag consistent baseline totals", () => {
    expect(summary.reportedTotalInconsistent).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test 2 — Breakdown percentages
// ---------------------------------------------------------------------------

describe("buildContextSummary — breakdown percentages", () => {
  const bd = getBaselineBreakdown();
  const summary = buildContextSummary(bd);

  it("toolDefinitions pct ≈ 51.76% (5403/10439*100)", () => {
    const expected = (5403 / 10439) * 100;
    expect(summary.breakdownPct.toolDefinitions).toBeCloseTo(expected, 5);
  });

  it("all 10 known breakdown fields are present in breakdownPct", () => {
    const knownFields = [
      "roleDefinition",
      "staticSections",
      "skills",
      "baseRules",
      "projectRules",
      "customInstructions",
      "environment",
      "toolSystemPrompts",
      "toolDefinitions",
      "mcpToolDefinitions",
    ];
    for (const field of knownFields) {
      expect(Object.prototype.hasOwnProperty.call(summary.breakdownPct, field)).toBe(true);
    }
  });

  it("sum of all breakdown percentages ≈ 100% of fixedOverhead", () => {
    const totalPct = Object.values(summary.breakdownPct).reduce((a, b) => a + b, 0);
    expect(totalPct).toBeCloseTo(100, 5);
  });
});

// ---------------------------------------------------------------------------
// Test 3 — projectRules === 0
// ---------------------------------------------------------------------------

describe("buildContextSummary — projectRules signal", () => {
  it("baseline fixture has projectRules === 0", () => {
    const bd = getBaselineBreakdown();
    const summary = buildContextSummary(bd);
    expect(summary.breakdown.projectRules).toBe(0);
  });

  it("projectRules === 0 does not prevent other fields from being populated", () => {
    const bd = getBaselineBreakdown();
    const summary = buildContextSummary(bd);
    // No causality inferred — just the raw signal
    expect(summary.breakdown.toolDefinitions).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Test 4 — Missing maxContextWindow (default)
// ---------------------------------------------------------------------------

describe("buildContextSummary — maxContextWindow absent", () => {
  it("maxContextWindow is null when not provided", () => {
    const bd = getBaselineBreakdown();
    const summary = buildContextSummary(bd);
    expect(summary.maxContextWindow).toBeNull();
  });

  it("pressure is null when maxContextWindow is null", () => {
    const bd = getBaselineBreakdown();
    const summary = buildContextSummary(bd);
    expect(summary.pressure).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test 5 — maxContextWindow = 270000
// ---------------------------------------------------------------------------

describe("buildContextSummary — maxContextWindow = 270000", () => {
  it("pressure ≈ 0.065 (17584 / 270000)", () => {
    const bd = getBaselineBreakdown();
    const summary = buildContextSummary(bd, 270000);
    const expected = 17584 / 270000;
    expect(summary.pressure).toBeCloseTo(expected, 6);
  });

  it("maxContextWindow is preserved on the summary", () => {
    const bd = getBaselineBreakdown();
    const summary = buildContextSummary(bd, 270000);
    expect(summary.maxContextWindow).toBe(270000);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "treats invalid maxContextWindow %s as unavailable",
    (maxContextWindow) => {
      const bd = getBaselineBreakdown();
      const summary = buildContextSummary(bd, maxContextWindow);
      expect(summary.maxContextWindow).toBeNull();
      expect(summary.pressure).toBeNull();
    }
  );
});

// ---------------------------------------------------------------------------
// Test 6 — total === 0 (division-by-zero guard)
// ---------------------------------------------------------------------------

describe("buildContextSummary — total === 0", () => {
  const bd = makeBreakdown({ total: 0, reportedTotal: 0, breakdownOverrides: { toolDefinitions: 0, mcpToolDefinitions: 0, roleDefinition: 0, staticSections: 0, skills: 0, baseRules: 0, projectRules: 0, customInstructions: 0, environment: 0, toolSystemPrompts: 0 } });
  const summary = buildContextSummary(bd);

  it("does not throw", () => {
    expect(() => buildContextSummary(bd)).not.toThrow();
  });

  it("all breakdownPct fields are 0", () => {
    for (const [, v] of Object.entries(summary.breakdownPct)) {
      expect(v).toBe(0);
    }
  });

  it("conversationTokens is 0", () => {
    expect(summary.conversationTokens).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Test 7 — reportedTotal < total (inconsistency signal + non-negative clamping)
// ---------------------------------------------------------------------------

describe("buildContextSummary — reportedTotal < fixedOverhead", () => {
  const bd = makeBreakdown({ total: 1000, reportedTotal: 800 });
  const summary = buildContextSummary(bd);

  it("exposes an explicit inconsistency signal", () => {
    expect(summary.reportedTotalInconsistent).toBe(true);
  });

  it("conversationTokens is never negative (clamped to 0)", () => {
    expect(summary.conversationTokens).toBe(0);
    expect(summary.conversationTokens).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Test 8 — Known field with value 0 (mcpToolDefinitions)
// ---------------------------------------------------------------------------

describe("buildContextSummary — known field with value 0", () => {
  it("mcpToolDefinitions === 0 is preserved in breakdown and breakdownPct", () => {
    const bd = getBaselineBreakdown();
    const summary = buildContextSummary(bd);
    expect(summary.breakdown.mcpToolDefinitions).toBe(0);
    expect(summary.breakdownPct.mcpToolDefinitions).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Test 9 — Future numeric breakdown field is preserved
// ---------------------------------------------------------------------------

describe("buildContextSummary — forward-compatibility: future numeric field", () => {
  it("preserves an unknown numeric field through JSON parsing and summary extraction", () => {
    const raw = JSON.parse(readFixture("benchmark/rodada-a.json")) as {
      tasks: Array<{
        task: {
          costs: {
            contextWindowBreakdown: {
              total: number;
              breakdown: Record<string, number>;
            };
          };
        };
      }>;
    };
    const rawBreakdown = raw.tasks[0].task.costs.contextWindowBreakdown;
    rawBreakdown.breakdown.futureField = 500;
    rawBreakdown.total += 500;

    const parsed = parseSession(JSON.stringify(raw));
    if (!parsed.ok) throw new Error("Fixture parse failed: " + parsed.error.message);
    const bd = parsed.value.tasks[0].task.costs.contextWindowBreakdown;
    const summary = buildContextSummary(bd);

    // The future field must pass through
    expect((summary.breakdown as Record<string, number>)["futureField"]).toBe(500);
    expect((summary.breakdownPct as Record<string, number>)["futureField"]).toBeCloseTo(
      (500 / 10939) * 100,
      5
    );
    expect(summary.breakdownSumConsistent).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 10 — breakdownSumDelta within tolerance
// ---------------------------------------------------------------------------

describe("breakdownSumDelta — sum validation", () => {
  it("baseline fixture sum equals total exactly (delta === 0)", () => {
    const bd = getBaselineBreakdown();
    expect(breakdownSumDelta(bd)).toBe(0);
    const summary = buildContextSummary(bd);
    expect(summary.breakdownSumDelta).toBe(0);
    expect(summary.breakdownSumConsistent).toBe(true);
  });

  it("delta is within BREAKDOWN_SUM_TOLERANCE for baseline", () => {
    const bd = getBaselineBreakdown();
    expect(breakdownSumDelta(bd)).toBeLessThanOrEqual(BREAKDOWN_SUM_TOLERANCE);
  });

  it("delta exceeds BREAKDOWN_SUM_TOLERANCE when breakdown fields diverge significantly", () => {
    const bd = makeBreakdown({ total: 1000, breakdownOverrides: { toolDefinitions: 500 } });
    const summary = buildContextSummary(bd);
    expect(breakdownSumDelta(bd)).toBeGreaterThan(BREAKDOWN_SUM_TOLERANCE);
    expect(summary.breakdownSumDelta).toBeGreaterThan(BREAKDOWN_SUM_TOLERANCE);
    expect(summary.breakdownSumConsistent).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test 11 — Regression: loadedSkills defaults to [] when absent in export
// ---------------------------------------------------------------------------

describe("buildContextSummary — regression: loadedSkills absent", () => {
  it("loadedSkills is [] when bd.loadedSkills is undefined", () => {
    const bd = makeBreakdown({});
    // Ensure loadedSkills is not present
    delete (bd as unknown as Record<string, unknown>)["loadedSkills"];
    const summary = buildContextSummary(bd);
    expect(summary.loadedSkills).toEqual([]);
  });

  it("loadedSkills is preserved when bd.loadedSkills is populated", () => {
    const bd: ContextBreakdown = {
      ...makeBreakdown({}),
      loadedSkills: ["skill-a", "skill-b"],
    };
    const summary = buildContextSummary(bd);
    expect(summary.loadedSkills).toEqual(["skill-a", "skill-b"]);
  });
});
function loadRodadaA() {
  const content = readFixture("benchmark/rodada-a.json");
  const result = parseSession(content);
  if (!result.ok) throw new Error(`parseSession failed: ${result.error.message}`);
  return result.value;
}

// ---------------------------------------------------------------------------
// Baseline: benchmark/rodada-a.json
// ---------------------------------------------------------------------------

describe("extractTurnMetrics — benchmark/rodada-a.json (baseline)", () => {
  const session = loadRodadaA();
  const messages = session.tasks[0].messages;
  const turns = extractTurnMetrics(messages);

  it("produces exactly five turns", () => {
    expect(turns).toHaveLength(5);
  });

  it("assigns indices [0, 1, 2, 3, 4]", () => {
    expect(turns.map((t) => t.index)).toEqual([0, 1, 2, 3, 4]);
  });

  it("timestamps match expected epoch ms values", () => {
    expect(turns.map((t) => t.timestamp)).toEqual([
      1787958111009,
      1787958248859,
      1787958289168,
      1787958305385,
      1787958332549,
    ]);
  });

  it("contextTokens match accumulated values (not increments)", () => {
    expect(turns.map((t) => t.contextTokens)).toEqual([14522, 15190, 16714, 17302, 17584]);
  });

  it("contextDelta: null on first turn, correct increments thereafter", () => {
    expect(turns[0].contextDelta).toBeNull();
    expect(turns[1].contextDelta).toBe(668);
    expect(turns[2].contextDelta).toBe(1524);
    expect(turns[3].contextDelta).toBe(588);
    expect(turns[4].contextDelta).toBe(282);
  });

  it("costs preserved with full precision (no rounding)", () => {
    expect(turns.map((t) => t.cost)).toEqual([
      0.029044, 0.03038, 0.033428, 0.034604, 0.035168,
    ]);
  });

  it("sum of turn costs equals 0.16262400000000002 within absolute tolerance 1e-12", () => {
    const sum = turns.reduce((acc, t) => acc + t.cost, 0);
    expect(Math.abs(sum - 0.16262400000000002)).toBeLessThan(1e-12);
  });

  it("task.costs.cost is 0.336902 (characterisation: diverges from turn cost sum)", () => {
    const taskCost = session.tasks[0].task.costs.cost;
    expect(taskCost).toBe(0.336902);
    // The divergence is intentional — different measurements, not to be reconciled.
    expect(Math.abs(taskCost - 0.16262400000000002)).toBeGreaterThan(1e-12);
  });

  it("reasoningTokens === 0 on all turns", () => {
    expect(turns.every((t) => t.reasoningTokens === 0)).toBe(true);
  });

  it("tool call counts per turn are [6, 3, 2, 3, 0]", () => {
    expect(turns.map((t) => t.toolCallIds.length)).toEqual([6, 3, 2, 3, 0]);
  });

  it("tool call IDs are preserved correctly for each turn", () => {
    expect(turns[0].toolCallIds).toEqual([
      "tooluse_5PQM2lnxPYGrPb3SsoDdKM",
      "tooluse_bzuidsdycUDuDnTXermOXv",
      "tooluse_8abc6iY39vc6bI85wVBE5N",
      "tooluse_MQTdrQ5lCR2vlQ7qXMvVSJ",
      "tooluse_Zt6Q4TtrBXXHrbwWuy9pW6",
      "tooluse_LWAv0N20SjnJsmyBhOUSmT",
    ]);
    expect(turns[1].toolCallIds).toEqual([
      "tooluse_n4ZYuahWdehoV9gwa6I0uO",
      "tooluse_k3b4qBWdQwJOa33u4L6kG4",
      "tooluse_U9TJOD9e6KykXlnVXt9K74",
    ]);
    expect(turns[2].toolCallIds).toEqual([
      "tooluse_nootttgTHNPZfckQopQjc6",
      "tooluse_xXuz7l0OOOMlvEIQhMp5Qc",
    ]);
    expect(turns[3].toolCallIds).toEqual([
      "tooluse_YXqXoCBewjwOmP8zULgkfn",
      "tooluse_7daQXIVDiYL0VAH4UL8Mkt",
      "tooluse_CgC47vxseMblYd9XpiKN30",
    ]);
    expect(turns[4].toolCallIds).toEqual([]);
  });

  it("only the last turn has stop === true", () => {
    expect(turns.slice(0, 4).every((t) => t.stop === false)).toBe(true);
    expect(turns[4].stop).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Ordering — reversed or shuffled input still produces timestamp order
// ---------------------------------------------------------------------------

describe("extractTurnMetrics — ordering invariants", () => {
  it("reversed messages array produces same turn order as original", () => {
    const session = loadRodadaA();
    const messages = session.tasks[0].messages;
    const forward = extractTurnMetrics(messages);
    const reversed = extractTurnMetrics([...messages].reverse());
    expect(reversed.map((t) => t.timestamp)).toEqual(forward.map((t) => t.timestamp));
    expect(reversed.map((t) => t.messageId)).toEqual(forward.map((t) => t.messageId));
  });

  it("shuffled messages array produces same turn order as original", () => {
    const session = loadRodadaA();
    const messages = session.tasks[0].messages;
    // Deterministic shuffle — rotate by 7
    const shuffled: Message[] = [
      ...messages.slice(7),
      ...messages.slice(0, 7),
    ];
    const forward = extractTurnMetrics(messages);
    const fromShuffled = extractTurnMetrics(shuffled);
    expect(fromShuffled.map((t) => t.timestamp)).toEqual(forward.map((t) => t.timestamp));
  });

  it("does not mutate the original messages array", () => {
    const session = loadRodadaA();
    const messages = session.tasks[0].messages;
    const originalIds = messages.map((m) => m.id);
    extractTurnMetrics(messages);
    expect(messages.map((m) => m.id)).toEqual(originalIds);
  });
});

// ---------------------------------------------------------------------------
// Filtering — non-assistant messages are ignored without accessing spend
// ---------------------------------------------------------------------------

describe("extractTurnMetrics — filtering edge cases", () => {
  it("ignores tool and user messages from baseline (no spend access)", () => {
    const session = loadRodadaA();
    const messages = session.tasks[0].messages;
    // Baseline has 21 messages total; 5 assistant, rest are user/tool/system
    const nonAssistant = messages.filter((m) => m.role !== "assistant");
    expect(nonAssistant.length).toBeGreaterThan(0);
    // Should return no turns — none are assistant with spend
    const turns = extractTurnMetrics(nonAssistant);
    expect(turns).toHaveLength(0);
  });

  it("ignores assistant message without spend (no crash)", () => {
    const session = loadRodadaA();
    const messages = session.tasks[0].messages;
    // Inject a synthetic assistant message without spend
    const syntheticNoSpend: Message = {
      id: "synthetic-no-spend",
      role: "assistant",
      data: {
        id: "synthetic-no-spend",
        role: "assistant",
        content: "hello",
        _meta: {
          timestamp: 9999999999999,
          // spend intentionally absent
        },
      },
    };
    const augmented = [...messages, syntheticNoSpend];
    // Should still produce exactly 5 turns (the synthetic one is ignored)
    const turns = extractTurnMetrics(augmented);
    expect(turns).toHaveLength(5);
    expect(turns.every((t) => t.messageId !== "synthetic-no-spend")).toBe(true);
  });

  it("returns empty array for an empty messages list", () => {
    expect(extractTurnMetrics([])).toEqual([]);
  });

  // Regression: envelope role === "assistant" but data.role disagrees (e.g. "tool").
  // Such a message must be skipped — using it would produce wrong metrics and
  // potentially access fields (toolUsage) that belong to the wrong data shape.
  it("ignores message where envelope role is 'assistant' but data.role is 'tool' (divergent roles)", () => {
    // Cast to Message: this object is intentionally malformed to simulate corrupt
    // export data. The parser now rejects these at parse time, but extractTurnMetrics
    // must also handle them defensively in case data ever arrives pre-parsed.
    const divergent = {
      id: "divergent-roles",
      role: "assistant", // envelope says assistant
      data: {
        id: "divergent-roles",
        role: "tool", // data says tool — mismatch
        content: "",
        _meta: {
          timestamp: 1000,
          spend: { cost: 0.05, contextTokens: 500, reasoningTokens: 0 },
        },
        toolUsage: {
          signature: {
            id: "tooluse_divergent",
            name: "some_tool",
            arguments: {},
            isError: false,
          },
          permission: "read",
          isOutsideWorkspace: false,
        },
      },
    } as unknown as Message;
    const turns = extractTurnMetrics([divergent]);
    expect(turns).toHaveLength(0);
  });

  // Regression: data.role === "assistant" but envelope role is not "assistant".
  // The message must also be skipped in this direction.
  it("ignores message where data.role is 'assistant' but envelope role is 'user' (divergent roles, other direction)", () => {
    const divergent = {
      id: "divergent-roles-2",
      role: "user", // envelope says user
      data: {
        id: "divergent-roles-2",
        role: "assistant", // data says assistant — mismatch
        content: "",
        _meta: {
          timestamp: 2000,
          spend: { cost: 0.05, contextTokens: 500, reasoningTokens: 0 },
        },
      },
    } as unknown as Message;
    const turns = extractTurnMetrics([divergent]);
    expect(turns).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Timestamp tie-breaking — deterministic by original position
// ---------------------------------------------------------------------------

describe("extractTurnMetrics — timestamp tie-breaking", () => {
  it("uses original position as deterministic tiebreaker for equal timestamps", () => {
    // Two assistant messages with the same timestamp — position determines order
    const msgA: Message = {
      id: "msg-a",
      role: "assistant",
      data: {
        id: "msg-a",
        role: "assistant",
        content: "",
        _meta: {
          timestamp: 1000,
          spend: { cost: 0.01, contextTokens: 100, reasoningTokens: 0 },
        },
      },
    };
    const msgB: Message = {
      id: "msg-b",
      role: "assistant",
      data: {
        id: "msg-b",
        role: "assistant",
        content: "",
        _meta: {
          timestamp: 1000,
          spend: { cost: 0.02, contextTokens: 200, reasoningTokens: 0 },
        },
      },
    };
    const turns = extractTurnMetrics([msgA, msgB]);
    expect(turns[0].messageId).toBe("msg-a");
    expect(turns[1].messageId).toBe("msg-b");
    // Reversed input → same timestamps, reversed original positions → reversed order
    const turnsRev = extractTurnMetrics([msgB, msgA]);
    expect(turnsRev[0].messageId).toBe("msg-b");
    expect(turnsRev[1].messageId).toBe("msg-a");
  });
});

// ---------------------------------------------------------------------------
// Invalid export — missing _meta.timestamp rejected by parseSession
// ---------------------------------------------------------------------------

describe("parseSession — missing _meta.timestamp", () => {
  it("returns ok:false with error path containing _meta.timestamp", () => {
    const base = JSON.parse(readFixture("fixtures/sample-export.json"));
    // Remove timestamp from the first message's _meta
    delete base.tasks[0].messages[0].data._meta.timestamp;
    const result = parseSession(JSON.stringify(base));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/timestamp/);
    // Path should reference _meta or timestamp
    const errorText = `${result.error.message} ${result.error.path ?? ""}`;
    expect(errorText.toLowerCase()).toMatch(/timestamp/);
  });
});
