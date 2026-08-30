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

interface InventoryCounts {
  available: number;
  idle: number;
}

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

function rootTasks(report: ObserveReport): ObserveReport["tasks"] {
  return report.tasks.filter((task) => !task.isSubtask);
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
  return rootTasks(report).reduce((acc, task) => acc + task.contextTokens, 0);
}

/** Sum fixedOverhead (contextWindowBreakdown.total) across root tasks. */
function sumFixedOverhead(report: ObserveReport): number {
  return rootTasks(report).reduce(
    (acc, task) => acc + task.context.fixedOverhead,
    0
  );
}

function sumConversationTokens(report: ObserveReport): number {
  return rootTasks(report).reduce(
    (acc, task) => acc + task.context.conversationTokens,
    0
  );
}

function sumBreakdownField(
  report: ObserveReport,
  field: "skills" | "projectRules"
): number | null {
  const tasks = rootTasks(report);
  if (tasks.length === 0) return null;
  return tasks.reduce((acc, task) => acc + task.context.breakdown[field], 0);
}

function sumExternalCommands(report: ObserveReport): number {
  return rootTasks(report).reduce(
    (acc, task) => acc + task.externalCommands.length,
    0
  );
}

function sumDurationMs(report: ObserveReport): number {
  return rootTasks(report).reduce((acc, task) => acc + task.durationMs, 0);
}

/**
 * Aggregate a session inventory without double-counting tools repeated by root
 * tasks. One missing inventory makes the session-level metric unavailable.
 */
function inventoryCounts(report: ObserveReport): InventoryCounts | null {
  const tasks = rootTasks(report);
  if (tasks.length === 0 || tasks.some((task) => task.toolInventory === null)) {
    return null;
  }

  const available = new Set<string>();
  const used = new Set<string>();
  for (const task of tasks) {
    for (const tool of task.toolInventory?.available ?? []) available.add(tool);
    for (const tool of task.toolInventory?.used ?? []) used.add(tool);
  }

  let idle = 0;
  for (const tool of available) {
    if (!used.has(tool)) idle += 1;
  }
  return { available: available.size, idle };
}

/**
 * Sum projectRules tokens across root tasks.
 * Returns null when no root tasks exist (avoids emitting 0 for an absent metric).
 */
function sumProjectRulesTokens(report: ObserveReport): number | null {
  return sumBreakdownField(report, "projectRules");
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

  const conversationTokensA = sumConversationTokens(reportA);
  const conversationTokensB = sumConversationTokens(reportB);

  const fixedOverheadA = sumFixedOverhead(reportA);
  const fixedOverheadB = sumFixedOverhead(reportB);

  const assistantTurnsA = reportA.totals.assistantTurns;
  const assistantTurnsB = reportB.totals.assistantTurns;

  const humanInterventionsA = reportA.totals.humanInterventions;
  const humanInterventionsB = reportB.totals.humanInterventions;

  const erroredToolCallsA = reportA.totals.erroredToolCalls;
  const erroredToolCallsB = reportB.totals.erroredToolCalls;

  const externalCommandsA = sumExternalCommands(reportA);
  const externalCommandsB = sumExternalCommands(reportB);

  const skillTokensA = sumBreakdownField(reportA, "skills") ?? undefined;
  const skillTokensB = sumBreakdownField(reportB, "skills") ?? undefined;

  const inventoryA = inventoryCounts(reportA);
  const inventoryB = inventoryCounts(reportB);

  const durationMsA = sumDurationMs(reportA);
  const durationMsB = sumDurationMs(reportB);

  const projectRulesTokensA = sumProjectRulesTokens(reportA) ?? undefined;
  const projectRulesTokensB = sumProjectRulesTokens(reportB) ?? undefined;

  const metrics: ComparisonMetrics = {
    costA,
    costB,
    costDelta: costB - costA,

    contextTokensA,
    contextTokensB,
    contextTokensDelta: contextTokensB - contextTokensA,

    conversationTokensA,
    conversationTokensB,
    conversationTokensDelta: conversationTokensB - conversationTokensA,

    fixedOverheadA,
    fixedOverheadB,
    fixedOverheadDelta: fixedOverheadB - fixedOverheadA,

    assistantTurnsA,
    assistantTurnsB,
    assistantTurnsDelta: assistantTurnsB - assistantTurnsA,

    humanInterventionsA,
    humanInterventionsB,
    humanInterventionsDelta: humanInterventionsB - humanInterventionsA,

    erroredToolCallsA,
    erroredToolCallsB,
    erroredToolCallsDelta: erroredToolCallsB - erroredToolCallsA,

    externalCommandsA,
    externalCommandsB,
    externalCommandsDelta: externalCommandsB - externalCommandsA,

    ...(skillTokensA !== undefined && skillTokensB !== undefined
      ? {
          skillTokensA,
          skillTokensB,
          skillTokensDelta: skillTokensB - skillTokensA,
        }
      : {}),

    durationMsA,
    durationMsB,
    durationMsDelta: durationMsB - durationMsA,

    // buildFailures*: intentionally absent — not derivable from the export.

    projectRulesTokensA,
    projectRulesTokensB,
    ...(projectRulesTokensA !== undefined && projectRulesTokensB !== undefined
      ? { projectRulesTokensDelta: projectRulesTokensB - projectRulesTokensA }
      : {}),

    ...(inventoryA !== null && inventoryB !== null
      ? {
          availableToolsA: inventoryA.available,
          availableToolsB: inventoryB.available,
          availableToolsDelta: inventoryB.available - inventoryA.available,
          idleToolsA: inventoryA.idle,
          idleToolsB: inventoryB.idle,
          idleToolsDelta: inventoryB.idle - inventoryA.idle,
        }
      : {}),
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
