/**
 * Detect the absence of project-level rules in each observed task.
 *
 * This detector reads only ObserveReport, has no side effects, and preserves
 * the full, unrounded context breakdown for presentation and auditability.
 */

import type {
  BreakdownDetail,
  Finding,
  ObserveReport,
} from "../domain/types";

const PROJECT_RULES_FIELD = "projectRules" satisfies keyof BreakdownDetail;

/**
 * Emit one finding per task whose measured projectRules value is exactly zero.
 * Missing or non-numeric values are unavailable measurements, not zero.
 */
export function detectProjectRulesAbsent(report: ObserveReport): Finding[] {
  const findings: Finding[] = [];

  for (let taskIndex = 0; taskIndex < report.tasks.length; taskIndex++) {
    const task = report.tasks[taskIndex];
    // No breakdown means the signal cannot be observed; absence of data is not
    // evidence of a missing AGENTS.md.
    if (task.context === null) continue;
    const breakdown = task.context.breakdown as Record<string, number | undefined>;
    const hasProjectRules = Object.prototype.hasOwnProperty.call(
      breakdown,
      PROJECT_RULES_FIELD
    );
    const projectRules = breakdown[PROJECT_RULES_FIELD];

    if (!hasProjectRules || typeof projectRules !== "number" || projectRules !== 0) {
      continue;
    }

    const fieldPath =
      `tasks[${taskIndex}].task.costs.contextWindowBreakdown.breakdown.projectRules`;

    findings.push({
      id: `project-rules-absent:${report.sessionId}:${task.taskId}`,
      sessionId: report.sessionId,
      taskId: task.taskId,
      kind: "project-rules-absent",
      detectedAt: report.exportedAt,
      confidence: "high",
      evidence: {
        type: "breakdown",
        redactable: false,
        fieldPath,
        breakdownField: PROJECT_RULES_FIELD,
        breakdownValue: projectRules,
      },
      metric: {
        total: task.context.fixedOverhead,
        breakdown: { ...task.context.breakdown },
        breakdownPct: { ...task.context.breakdownPct },
      },
      prescriptionHint: "agents-md-file",
      description: "No project rules were loaded for this task.",
    });
  }

  return findings;
}
