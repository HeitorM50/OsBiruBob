/**
 * Compare — Hindsight (Phase 5 / F5)
 *
 * Responsibility: receive two ObserveReports (Round A and Round B) and
 * produce a Comparison with absolute deltas.
 *
 * Allowed imports: src/domain/types.ts only.
 * Forbidden imports: diagnose, prescribe, CLI/UI.
 * Forbidden Node APIs: fs, path, process, os.
 * Forbidden network: fetch, XMLHttpRequest.
 */

import type { ObserveReport, Comparison, ComparisonMetrics } from "../domain/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sort-and-join a permission array for stable set comparison. */
function permissionSetKey(perms: readonly string[]): string {
  return [...perms].sort().join(",");
}

/**
 * Pick the last root-task's approval summary allowedPermissions.
 * If there are no root tasks, returns an empty array.
 */
function rootPermissions(report: ObserveReport): readonly string[] {
  const rootTasks = report.tasks.filter((t) => !t.isSubtask);
  if (rootTasks.length === 0) return [];
  // All root tasks in a session share the same approval config — use the last one.
  return rootTasks[rootTasks.length - 1].approval.allowedPermissions;
}

/**
 * Sum `contextTokens` for root tasks.
 *
 * Note (I-2): contextTokens on a TaskReport is the *accumulated* value at task
 * end (from task.costs.contextTokens), not a per-turn increment. For a
 * single-task session this is the correct final context size. When a session
 * has multiple root tasks we sum their final sizes as a proxy — the same
 * heuristic used by SessionTotals for other metrics.
 */
function sumContextTokens(report: ObserveReport): number {
  return report.tasks
    .filter((t) => !t.isSubtask)
    .reduce((acc, t) => acc + t.contextTokens, 0);
}

/** Sum fixedOverhead (contextWindowBreakdown.total) across root tasks. */
function sumFixedOverhead(report: ObserveReport): number {
  return report.tasks
    .filter((t) => !t.isSubtask)
    .reduce((acc, t) => acc + t.context.fixedOverhead, 0);
}

/**
 * Sum projectRules tokens across root tasks.
 * Returns null when no root tasks exist (avoids emitting 0 for an absent metric).
 */
function sumProjectRulesTokens(report: ObserveReport): number | null {
  const rootTasks = report.tasks.filter((t) => !t.isSubtask);
  if (rootTasks.length === 0) return null;
  return rootTasks.reduce((acc, t) => acc + t.context.breakdown.projectRules, 0);
}

// ---------------------------------------------------------------------------
// compare — public entry point
// ---------------------------------------------------------------------------

/**
 * Compare two ObserveReports (Round A = baseline, Round B = optimised).
 *
 * - Delta is always B − A. Negative = improvement (cost/tokens); positive = regression.
 * - No rounding. Precision is IEEE 754 as-is (I-3).
 * - Subtasks are excluded from all aggregations (I-5).
 * - buildFailures* is absent — not derivable from the export (domain-model.md § Modelo 9).
 * - valid is false when the experiment protocol is broken:
 *     • allowedPermissions sets differ between rounds;
 *     • root-task counts differ.
 *
 * @param reportA - ObserveReport for Round A (baseline).
 * @param reportB - ObserveReport for Round B (optimised).
 * @returns Comparison — never throws.
 */
export function compare(reportA: ObserveReport, reportB: ObserveReport): Comparison {
  // ── Validity check ─────────────────────────────────────────────────────────
  const rootCountA = reportA.tasks.filter((t) => !t.isSubtask).length;
  const rootCountB = reportB.tasks.filter((t) => !t.isSubtask).length;

  const permKeyA = permissionSetKey(rootPermissions(reportA));
  const permKeyB = permissionSetKey(rootPermissions(reportB));

  let valid = true;
  let invalidReason: string | undefined;

  if (rootCountA !== rootCountB) {
    valid = false;
    invalidReason = `Root task count differs: A has ${rootCountA}, B has ${rootCountB}`;
  } else if (permKeyA !== permKeyB) {
    valid = false;
    invalidReason = `allowedPermissions set differs: A=[${permKeyA}], B=[${permKeyB}]`;
  }

  // ── Metrics ────────────────────────────────────────────────────────────────
  const costA = reportA.totals.cost;
  const costB = reportB.totals.cost;

  const contextTokensA = sumContextTokens(reportA);
  const contextTokensB = sumContextTokens(reportB);

  const fixedOverheadA = sumFixedOverhead(reportA);
  const fixedOverheadB = sumFixedOverhead(reportB);

  const assistantTurnsA = reportA.totals.assistantTurns;
  const assistantTurnsB = reportB.totals.assistantTurns;

  const humanInterventionsA = reportA.totals.humanInterventions;
  const humanInterventionsB = reportB.totals.humanInterventions;

  const projectRulesTokensA = sumProjectRulesTokens(reportA) ?? undefined;
  const projectRulesTokensB = sumProjectRulesTokens(reportB) ?? undefined;

  const metrics: ComparisonMetrics = {
    costA,
    costB,
    costDelta: costB - costA,

    contextTokensA,
    contextTokensB,
    contextTokensDelta: contextTokensB - contextTokensA,

    fixedOverheadA,
    fixedOverheadB,
    fixedOverheadDelta: fixedOverheadB - fixedOverheadA,

    assistantTurnsA,
    assistantTurnsB,
    assistantTurnsDelta: assistantTurnsB - assistantTurnsA,

    humanInterventionsA,
    humanInterventionsB,
    humanInterventionsDelta: humanInterventionsB - humanInterventionsA,

    // buildFailures*: intentionally absent — not derivable from the export.

    projectRulesTokensA,
    projectRulesTokensB,
  };

  // ── Comparison object ──────────────────────────────────────────────────────
  const rootTaskA = reportA.tasks.find((t) => !t.isSubtask);
  const rootTaskB = reportB.tasks.find((t) => !t.isSubtask);

  const result: Comparison = {
    id: `cmp-${reportA.sessionId}-${reportB.sessionId}`,
    sessionIdA: reportA.sessionId,
    sessionIdB: reportB.sessionId,
    taskIdA: rootTaskA?.taskId ?? "unknown",
    taskIdB: rootTaskB?.taskId ?? "unknown",
    createdAt: Date.now(),
    metrics,
    valid,
  };

  if (invalidReason !== undefined) {
    result.invalidReason = invalidReason;
  }

  return result;
}
