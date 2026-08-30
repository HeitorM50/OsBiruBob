import { ObserveReport, Finding, HumanIntervention, TaskReport } from "../domain/types";
/**
 * Detector de intervenção humana — mensagem do usuário depois da primeira.
 *
 * Regras:
 * - A primeira mensagem user é o prompt da tarefa, nunca intervenção
 * - Toda mensagem user seguinte conta, inclusive resposta a ask_followup_question
 * - content é redactable: true
 * - Intervenções consecutivas são agrupadas
 */
export function detectHumanIntervention(report: ObserveReport): Finding[] {
  const findings: Finding[] = [];
  
  // Processar cada task separadamente
  for (const task of report.tasks) {
    // Pular subtasks (não agregamos nelas)
    if (task.isSubtask) {
      continue;
    }
    
    // Se não há intervenções humanas, não há nada a fazer
    if (task.humanInterventions.length === 0) {
      continue;
    }
    
    // Agrupar intervenções consecutivas
    const groupedInterventions = groupConsecutiveInterventions(
      task.humanInterventions,
      task.turns.length
    );
    
    // Criar um Finding por grupo de intervenções
    for (const group of groupedInterventions) {
      const finding = createFinding(report, task, group);
      findings.push(finding);
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
  interventions: HumanIntervention[],
  totalTurns: number
): HumanIntervention[][] {
  if (interventions.length === 0) {
    return [];
  }
  
  // Ordenar por afterTurnIndex
  const sorted = [...interventions].sort((a, b) => a.afterTurnIndex - b.afterTurnIndex);
  
  const groups: HumanIntervention[][] = [];
  let currentGroup: HumanIntervention[] = [sorted[0]];
  
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    
    // Intervenções são consecutivas se estão no mesmo turno ou em turnos adjacentes
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
  interventions: HumanIntervention[]
): Finding {
  // Contar número de intervenções no grupo
  const interventionCount = interventions.length;
  
  // Extrair conteúdos (para F4 consumir)
  const contents = interventions.map(i => i.content);
  
  // Estimar tokens desperdiçados: ~100 tokens por intervenção (estimativa conservadora)
  const estimatedWastedTokens = interventionCount * 100;
  
  // Extrair turnos envolvidos
  const turnIndices = interventions.map(i => i.afterTurnIndex);
  const minTurn = Math.min(...turnIndices);
  const maxTurn = Math.max(...turnIndices);
  
  return {
    id: `human-intervention-${task.taskId}-turn-${minTurn}`,
    sessionId: report.sessionId,
    taskId: task.taskId,
    kind: "human-intervention",
    detectedAt: report.exportedAt,
    evidence: {
      type: "message",
      redactable: true,
      messageIds: interventions.map(i => i.messageId),
      turnIndices,
      fieldPath: `tasks[${task.taskId}].humanInterventions`,
    },
    confidence: "high",
    metric: {
      interventionCount,
      firstTurn: minTurn,
      lastTurn: maxTurn,
      estimatedWastedTokens,
    },
    prescriptionHint: "agents-md-section",
    description: interventionCount === 1
      ? `Intervenção humana no turno ${minTurn}. Conteúdo: "${interventions[0].content.slice(0, 100)}..."`
      : `${interventionCount} intervenções humanas entre turnos ${minTurn}-${maxTurn}. Regras faltando no AGENTS.md.`,
    tokenImpact: estimatedWastedTokens,
    // Preservar conteúdo para F4 consumir (mas marcar como redactable)
    prescription: contents.join("\n\n"),
  };
}