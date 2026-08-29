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
