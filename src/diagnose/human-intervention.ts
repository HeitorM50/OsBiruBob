import type {
  ObserveReport,
  Finding,
  HumanIntervention,
  TaskReport,
} from "../domain/types";

const ESTIMATED_TOKENS_PER_INTERVENTION = 100;
const TOKEN_IMPACT_ESTIMATE_BASIS =
  "100 tokens per human intervention (heuristic)";

/**
 * Detector de intervenção humana — mensagem do usuário depois da primeira.
 *
 * Regras:
 * - A primeira mensagem user é o prompt da tarefa, nunca intervenção
 * - Toda mensagem user seguinte conta, inclusive resposta a ask_followup_question
 * - content é redactable: true e nunca aparece em id, description, prescription ou metric
 * - Intervenções consecutivas são agrupadas
 * - Subtasks (isSubtask || parentId !== null) são ignoradas (I-5)
 */
export function detectHumanIntervention(report: ObserveReport): Finding[] {
  const findings: Finding[] = [];

  for (let taskIndex = 0; taskIndex < report.tasks.length; taskIndex++) {
    const task = report.tasks[taskIndex];
    if (task.isSubtask || task.parentId !== null) {
      continue;
    }

    if (task.humanInterventions.length === 0) {
      continue;
    }

    const groupedInterventions = groupConsecutiveInterventions(
      task.humanInterventions
    );

    for (const group of groupedInterventions) {
      findings.push(createFinding(report, task, taskIndex, group));
    }
  }

  return findings;
}

/**
 * Agrupa intervenções consecutivas.
 *
 * Intervenções são consecutivas se ocorrem em turnos adjacentes ou no mesmo turno.
 */
function groupConsecutiveInterventions(
  interventions: HumanIntervention[]
): HumanIntervention[][] {
  if (interventions.length === 0) {
    return [];
  }

  const sorted = [...interventions].sort(
    (a, b) => a.afterTurnIndex - b.afterTurnIndex
  );

  const groups: HumanIntervention[][] = [];
  let currentGroup: HumanIntervention[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];

    if (curr.afterTurnIndex - prev.afterTurnIndex <= 1) {
      currentGroup.push(curr);
    } else {
      groups.push(currentGroup);
      currentGroup = [curr];
    }
  }

  groups.push(currentGroup);

  return groups;
}

/**
 * Cria um Finding para um grupo de intervenções humanas.
 */
function createFinding(
  report: ObserveReport,
  task: TaskReport,
  taskIndex: number,
  interventions: HumanIntervention[]
): Finding {
  const interventionCount = interventions.length;
  const contents = interventions.map((i) => i.content);
  const estimatedWastedTokens =
    interventionCount * ESTIMATED_TOKENS_PER_INTERVENTION;

  const turnIndices = interventions.map((i) => i.afterTurnIndex);
  const minTurn = Math.min(...turnIndices);
  const maxTurn = Math.max(...turnIndices);

  const description =
    interventionCount === 1
      ? `1 human intervention after turn ${minTurn}.`
      : minTurn === maxTurn
        ? `${interventionCount} human interventions after turn ${minTurn}.`
        : `${interventionCount} human interventions between turns ${minTurn}-${maxTurn}.`;

  return {
    id: `human-intervention:${report.sessionId}:${task.taskId}:turn-${minTurn}`,
    sessionId: report.sessionId,
    taskId: task.taskId,
    kind: "human-intervention",
    detectedAt: report.exportedAt,
    evidence: {
      type: "message",
      redactable: true,
      descriptionSafe: true,
      messageIds: interventions.map((i) => i.messageId),
      turnIndices,
      fieldPath: `tasks[${taskIndex}].humanInterventions`,
      rawValue: contents,
    },
    confidence: "high",
    metric: {
      interventionCount,
      firstTurn: minTurn,
      lastTurn: maxTurn,
      estimatedWastedTokens,
      tokenImpactIsEstimate: true,
      tokenImpactEstimateBasis: TOKEN_IMPACT_ESTIMATE_BASIS,
    },
    prescriptionHint: "agents-md-section",
    description,
    tokenImpact: estimatedWastedTokens,
    tokenImpactIsEstimate: true,
    tokenImpactEstimateBasis: TOKEN_IMPACT_ESTIMATE_BASIS,
  };
}
