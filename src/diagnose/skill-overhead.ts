/**
 * Detect measured skill context overhead when no loaded skill was declared.
 *
 * Rules:
 * - Subtasks (isSubtask || parentId !== null) are excluded (I-5).
 * - Absence is not zero (I-6): if `loadedSkills` is absent (not an array),
 *   treat the signal as unavailable rather than assuming `[]`.
 * - `breakdown.skills` is a MEASURED fixed-overhead value reported by Bob
 *   (estimated: false); potential savings from disabling unused Skills depend
 *   on which Skills the user disables in Settings -> Skills.
 */

import type { DiagnoseResult, Finding, ObserveReport } from "../domain/types";

export const SKILL_LOADED_SKILLS_UNAVAILABLE_PREFIX =
  "skill-overhead: loadedSkills unavailable for task ";

export function detectSkillOverheadWithStatus(
  report: ObserveReport
): DiagnoseResult {
  const findings: Finding[] = [];
  const unavailableMetrics: string[] = [];

  for (let taskIndex = 0; taskIndex < report.tasks.length; taskIndex++) {
    const task = report.tasks[taskIndex];
    // I-5: subtasks are excluded from session-level diagnostics/prescriptions.
    if (task.isSubtask || task.parentId !== null) continue;
    if (task.context === null) continue;

    const skillTokens = task.context.breakdown.skills;
    const loadedSkills = task.context.loadedSkills;

    // I-6: absent loadedSkills is unavailable, never treated as "none loaded".
    if (!Array.isArray(loadedSkills)) {
      unavailableMetrics.push(
        `${SKILL_LOADED_SKILLS_UNAVAILABLE_PREFIX}${task.taskId}`
      );
      continue;
    }

    if (
      typeof skillTokens !== "number" ||
      skillTokens <= 0 ||
      loadedSkills.length > 0
    ) {
      continue;
    }

    const estimationBasis =
      "Measured directly from contextWindowBreakdown.breakdown.skills; actual savings depend on which unused Skills are disabled in IBM Bob (Settings → Skills).";

    findings.push({
      id: `skill-overhead:${report.sessionId}:${task.taskId}`,
      sessionId: report.sessionId,
      taskId: task.taskId,
      kind: "skill-overhead",
      detectedAt: report.exportedAt,
      evidence: {
        type: "breakdown",
        redactable: false,
        fieldPath:
          `tasks[${taskIndex}].task.costs.contextWindowBreakdown.breakdown.skills`,
        breakdownField: "skills",
        breakdownValue: skillTokens,
      },
      confidence: "high",
      metric: {
        skillTokens,
        measuredSkillTokens: skillTokens,
        percentageOfFixedOverhead: task.context.breakdownPct.skills,
        loadedSkills: [...loadedSkills],
        tokenImpact: {
          tokens: skillTokens,
          estimated: false,
          basis: "measured directly from contextWindowBreakdown.breakdown.skills",
        },
      },
      prescriptionHint: "disable-skill",
      description:
        "Skill context consumed measured tokens in breakdown.skills, while loadedSkills was empty for this task.",
      tokenImpact: skillTokens,
      estimationBasis,
    });
  }

  return { findings, unavailableMetrics };
}

export function detectSkillOverhead(report: ObserveReport): Finding[] {
  return detectSkillOverheadWithStatus(report).findings;
}
