/**
 * Observe — Hindsight
 *
 * Responsibility: transform a Session into stable, typed metrics (ObserveReport)
 * that detectors can consume.
 *
 * Allowed imports: src/domain/types.ts, src/parser/index.ts.
 * Forbidden imports: diagnose, prescribe, compare, CLI/UI.
 * Forbidden Node APIs: fs, path, process, os.
 * Forbidden network: fetch, XMLHttpRequest.
 */

import type { ContextBreakdown, BreakdownDetail, ContextSummary } from "../domain/types";

// ---------------------------------------------------------------------------
// Tolerance for sum(breakdown) vs total validation
// ---------------------------------------------------------------------------
/**
 * Maximum absolute difference between sum(breakdown fields) and total that is
 * treated as acceptable rounding. The real export rounds individual fields to
 * integers; across 10 fields the accumulated rounding error is at most ±10.
 * We use 10 as the tolerance — it is explicitly documented and never hides a
 * real data anomaly for normal exports.
 */
export const BREAKDOWN_SUM_TOLERANCE = 10;

// ---------------------------------------------------------------------------
// buildContextSummary — public entry point
// ---------------------------------------------------------------------------

/**
 * Derive a `ContextSummary` from the raw `contextWindowBreakdown` stored on a
 * task's costs.
 *
 * @param bd               - The `contextWindowBreakdown` from `task.costs`.
 * @param maxContextWindow - Optional external parameter (e.g. 270000 for the
 *                           Claude model limit displayed in the Bob UI). When
 *                           null (default), `pressure` is null — the module
 *                           never assumes a default window size.
 *
 * @returns ContextSummary — never throws.
 *
 * Domain rules applied here:
 * - fixedOverhead  = bd.total  (fixed overhead; denominator for percentages)
 * - reportedTotal  = bd.reportedTotal  (total context at task end)
 * - conversationTokens = max(reportedTotal − fixedOverhead, 0)
 *   If reportedTotal < fixedOverhead, `reportedTotalInconsistent` is true;
 *   conversationTokens is clamped to 0, never negative.
 * - breakdownPct[field] = breakdown[field] / fixedOverhead * 100
 *   When fixedOverhead === 0 all percentages are 0 (safe division guard).
 * - breakdownSumDelta and breakdownSumConsistent expose sum validation using
 *   BREAKDOWN_SUM_TOLERANCE.
 * - Future numeric fields in breakdown are preserved in both `breakdown` and
 *   `breakdownPct` (forward-compatibility policy).
 * - No rounding anywhere — presentation layer is responsible.
 */
export function buildContextSummary(
  bd: ContextBreakdown,
  maxContextWindow: number | null = null
): ContextSummary {
  const fixedOverhead = bd.total;
  const reportedTotal = bd.reportedTotal;
  const conversationTokens = Math.max(reportedTotal - fixedOverhead, 0);
  const reportedTotalInconsistent = reportedTotal < fixedOverhead;

  // Build breakdown preserving future numeric fields (forward-compatibility).
  // Known fields come from BreakdownDetail; any extra numeric keys are kept.
  const breakdown: BreakdownDetail & Record<string, number> = {
    ...bd.breakdown,
  };

  // Compute percentages.  When fixedOverhead === 0 every field is 0 (safe).
  const breakdownPct: Record<string, number> = {};
  for (const key of Object.keys(breakdown)) {
    const value = breakdown[key];
    breakdownPct[key] = fixedOverhead > 0 ? (value / fixedOverhead) * 100 : 0;
  }

  const breakdownDelta = breakdownSumDelta(bd);
  const validMaxContextWindow =
    maxContextWindow !== null && Number.isFinite(maxContextWindow) && maxContextWindow > 0
      ? maxContextWindow
      : null;
  const pressure =
    validMaxContextWindow !== null ? reportedTotal / validMaxContextWindow : null;

  return {
    fixedOverhead,
    reportedTotal,
    conversationTokens,
    reportedTotalInconsistent,
    breakdown,
    breakdownPct: breakdownPct as Record<keyof BreakdownDetail, number> & Record<string, number>,
    breakdownSumDelta: breakdownDelta,
    breakdownSumConsistent: breakdownDelta <= BREAKDOWN_SUM_TOLERANCE,
    loadedSkills: bd.loadedSkills ?? [],
    maxContextWindow: validMaxContextWindow,
    pressure,
  };
}

// ---------------------------------------------------------------------------
// validateBreakdownSum — exported for tests and diagnostics
// ---------------------------------------------------------------------------

/**
 * Returns the absolute difference between sum(breakdown fields) and total.
 * Callers can compare this against BREAKDOWN_SUM_TOLERANCE.
 */
export function breakdownSumDelta(bd: ContextBreakdown): number {
  const sum = Object.values(bd.breakdown).reduce((acc, value) => acc + value, 0);
  return Math.abs(sum - bd.total);
}
