import { describe, test, expect } from "vitest";
import { ObserveReport, HumanIntervention } from "../domain/types";
import { detectHumanIntervention } from "./human-intervention";

/**
 * Helper para criar um ObserveReport mínimo para testes.
 */
function createReport(
  humanInterventions: HumanIntervention[],
  totalTurns: number = 5,
  isSubtask = false
): ObserveReport {
  return {
    sessionId: "test-session",
    exportedAt: 1724961600000,
    workspace: "test-workspace",
    tasks: [
      {
        taskId: "task-1",
        parentId: isSubtask ? "parent-1" : null,
        isSubtask,
        title: "Test Task",
        modeId: "test-mode",
        createdAt: 1724961600000,
        updatedAt: 1724961600000,
        durationMs: 1000,
        completed: true,
        cost: 0.01,
        contextTokens: 1000,
        context: {
          fixedOverhead: 500,
          reportedTotal: 1000,
          conversationTokens: 500,
          reportedTotalInconsistent: false,
          breakdown: {
            roleDefinition: 0,
            staticSections: 0,
            skills: 0,
            baseRules: 0,
            projectRules: 0,
            customInstructions: 0,
            environment: 0,
            toolSystemPrompts: 0,
            toolDefinitions: 0,
            mcpToolDefinitions: 0,
          },
          breakdownPct: {
            roleDefinition: 0,
            staticSections: 0,
            skills: 0,
            baseRules: 0,
            projectRules: 0,
            customInstructions: 0,
            environment: 0,
            toolSystemPrompts: 0,
            toolDefinitions: 0,
            mcpToolDefinitions: 0,
          },
          breakdownSumDelta: 0,
          breakdownSumConsistent: true,
          loadedSkills: [],
          maxContextWindow: null,
          pressure: null,
        },
        turns: Array.from({ length: totalTurns }, (_, i) => ({
          index: i,
          messageId: `msg-${i}`,
          timestamp: 1724961600000 + i * 1000,
          cost: 0.001,
          contextTokens: 1000 + i * 100,
          contextDelta: i === 0 ? null : 100,
          reasoningTokens: 10,
          toolCallIds: [],
          stop: i === totalTurns - 1,
        })),
        toolCalls: [],
        toolInventory: {
          available: [],
          used: [],
          idle: [],
          idleRatio: 0,
          toolDefinitionTokens: 0,
          estimatedTokensPerTool: null,
        },
        externalCommands: [],
        humanInterventions,
        approval: {
          autoApprovalEnabled: false,
          allowedPermissions: [],
          approvedCommands: [],
        },
      },
    ],
    totals: {
      taskCount: 1,
      subtaskCount: isSubtask ? 1 : 0,
      cost: 0.01,
      assistantTurns: totalTurns,
      toolCalls: 0,
      erroredToolCalls: 0,
      humanInterventions: humanInterventions.length,
    },
    unavailableMetrics: [],
    anomalies: [],
  };
}

/**
 * Helper para criar uma HumanIntervention.
 */
function createIntervention(
  messageId: string,
  afterTurnIndex: number,
  content: string
): HumanIntervention {
  return {
    messageId,
    afterTurnIndex,
    timestamp: 1724961600000 + afterTurnIndex * 1000,
    content,
  };
}

describe("detectHumanIntervention", () => {
  test("baseline real (benchmark/rodada-a.json) — 0 achados", () => {
    // Baseline tem uma única mensagem user (o prompt), que não conta como intervenção
    const report = createReport([], 5);
    const findings = detectHumanIntervention(report);
    
    expect(findings).toHaveLength(0);
  });

  test("uma intervenção no meio — 1 achado", () => {
    const interventions: HumanIntervention[] = [
      createIntervention("msg-user-1", 2, "Use TypeScript ao invés de JavaScript"),
    ];
    
    const report = createReport(interventions, 5);
    const findings = detectHumanIntervention(report);
    
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("human-intervention");
    expect(findings[0].evidence.turnIndices).toEqual([2]);
    expect(findings[0].evidence.redactable).toBe(true);
  });

  test("só o prompt inicial — 0 achados", () => {
    // Prompt inicial não está em humanInterventions, está na primeira mensagem user
    const report = createReport([], 5);
    const findings = detectHumanIntervention(report);
    
    expect(findings).toHaveLength(0);
  });

  test("duas intervenções consecutivas — agrupadas", () => {
    const interventions: HumanIntervention[] = [
      createIntervention("msg-user-1", 2, "Use TypeScript"),
      createIntervention("msg-user-2", 3, "Adicione testes"),
    ];
    
    const report = createReport(interventions, 5);
    const findings = detectHumanIntervention(report);
    
    expect(findings).toHaveLength(1); // Agrupadas em 1 finding
    expect(findings[0].metric.interventionCount).toBe(2);
    expect(findings[0].evidence.turnIndices).toEqual([2, 3]);
  });

  test("duas intervenções não consecutivas — separadas", () => {
    const interventions: HumanIntervention[] = [
      createIntervention("msg-user-1", 1, "Use TypeScript"),
      createIntervention("msg-user-2", 4, "Adicione testes"), // não consecutiva
    ];
    
    const report = createReport(interventions, 5);
    const findings = detectHumanIntervention(report);
    
    expect(findings).toHaveLength(2); // Separadas em 2 findings
  });

  test("resposta a ask_followup_question conta como intervenção", () => {
    const interventions: HumanIntervention[] = [
      createIntervention("msg-user-1", 2, "Sim, use Node 20"),
    ];
    
    const report = createReport(interventions, 5);
    const findings = detectHumanIntervention(report);
    
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("human-intervention");
  });

  test("evidence.redactable é true", () => {
    const interventions: HumanIntervention[] = [
      createIntervention("msg-user-1", 2, "Conteúdo sensível"),
    ];
    
    const report = createReport(interventions, 5);
    const findings = detectHumanIntervention(report);
    
    expect(findings).toHaveLength(1);
    expect(findings[0].evidence.redactable).toBe(true);
  });

  test("subtask não gera achado", () => {
    const interventions: HumanIntervention[] = [
      createIntervention("msg-user-1", 2, "Use TypeScript"),
    ];
    
    const report = createReport(interventions, 5, true); // isSubtask = true
    const findings = detectHumanIntervention(report);
    
    expect(findings).toHaveLength(0);
  });

  test("tokenImpact é estimativa baseada no número de intervenções", () => {
    const interventions: HumanIntervention[] = [
      createIntervention("msg-user-1", 1, "Use TypeScript"),
      createIntervention("msg-user-2", 2, "Adicione testes"),
      createIntervention("msg-user-3", 3, "Use ESLint"),
    ];
    
    const report = createReport(interventions, 5);
    const findings = detectHumanIntervention(report);
    
    expect(findings).toHaveLength(1); // Agrupadas
    // 3 intervenções = 3 * 100 = 300 tokens
    expect(findings[0].metric.estimatedWastedTokens).toBe(300);
  });

  test("prescription contém o conteúdo das intervenções (para F4)", () => {
    const interventions: HumanIntervention[] = [
      createIntervention("msg-user-1", 2, "Regra 1"),
      createIntervention("msg-user-2", 3, "Regra 2"),
    ];
    
    const report = createReport(interventions, 5);
    const findings = detectHumanIntervention(report);
    
    expect(findings).toHaveLength(1);
    expect(findings[0].prescription).toContain("Regra 1");
    expect(findings[0].prescription).toContain("Regra 2");
  });
});