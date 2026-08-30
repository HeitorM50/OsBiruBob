/**
 * Detect paid skill context with no declared loaded skill.
 *
 * A missing loadedSkills field is treated as an empty declaration. Observe
 * normally performs this normalization, but keeping the fallback here makes
 * the detector safe for partial or older ObserveReport producers.
 */

import type { Finding, ObserveReport } from "../domain/types";

export function detectSkillOverhead(report: ObserveReport): Finding[] {
  const findings: Finding[] = [];

  for (let taskIndex = 0; taskIndex < report.tasks.length; taskIndex++) {
    const task = report.tasks[taskIndex];
    const skillTokens = task.context.breakdown.skills;
    const loadedSkills = task.context.loadedSkills ?? [];

    if (
      typeof skillTokens !== "number" ||
      skillTokens <= 0 ||
      loadedSkills.length > 0
    ) {
      continue;
    }

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
        percentageOfFixedOverhead: task.context.breakdownPct.skills,
        loadedSkills: [...loadedSkills],
        tokenImpact: {
          tokens: skillTokens,
          estimated: true,
          basis: "breakdown.skills",
        },
      },
      prescriptionHint: "disable-skill",
      description:
        "Skill context consumed tokens, but no skill was declared as used for this task.",
      tokenImpact: skillTokens,
    });
  }

  return findings;
}
