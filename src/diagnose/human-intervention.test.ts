import { describe, test, expect } from "vitest";
import type { ObserveReport, HumanIntervention } from "../domain/types";
import { detectHumanIntervention } from "./human-intervention";

/**
 * Helper para criar um ObserveReport mínimo para testes.
 */
function createReport(
  humanInterventions: HumanIntervention[],
  totalTurns = 5,
  isSubtask = false,
  sessionId = "test-session",
  parentId: string | null = isSubtask ? "parent-1" : null
): ObserveReport {
  return {
    sessionId,
    exportedAt: 1724961600000,
    workspace: "test-workspace",
    tasks: [
      {
        taskId: "task-1",
        parentId,
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
      taskCount: isSubtask ? 0 : 1,
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
    expect(findings[0].evidence.descriptionSafe).toBe(true);
  });

  test("só o prompt inicial — 0 achados", () => {
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

    expect(findings).toHaveLength(1);
    expect(findings[0].metric.interventionCount).toBe(2);
    expect(findings[0].evidence.turnIndices).toEqual([2, 3]);
  });

  test("duas intervenções não consecutivas — separadas", () => {
    const interventions: HumanIntervention[] = [
      createIntervention("msg-user-1", 1, "Use TypeScript"),
      createIntervention("msg-user-2", 4, "Adicione testes"),
    ];

    const report = createReport(interventions, 5);
    const findings = detectHumanIntervention(report);

    expect(findings).toHaveLength(2);
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

  test("evidence.redactable é true e conteúdo sensível nunca vaza em description, prescription, id ou metric", () => {
    const secretA = "Use internal API key SECRET-TOKEN-123";
    const secretB = "Deploy to /private/prod/cluster";
    const interventions: HumanIntervention[] = [
      createIntervention("msg-user-1", 2, secretA),
      createIntervention("msg-user-2", 3, secretB),
    ];

    const singleReport = createReport([interventions[0]], 5);
    const [singleFinding] = detectHumanIntervention(singleReport);

    expect(singleFinding.evidence.redactable).toBe(true);
    expect(singleFinding.description).toContain("1");
    expect(singleFinding.description).toContain("2");
    expect(singleFinding.description).not.toContain(secretA);
    expect(singleFinding.description).not.toContain("SECRET-TOKEN-123");
    expect(singleFinding.prescription).toBeUndefined();
    expect(singleFinding.id).not.toContain("SECRET");
    expect(JSON.stringify(singleFinding.metric)).not.toContain(secretA);
    expect(singleFinding.evidence.rawValue).toEqual([secretA]);

    const groupedReport = createReport(interventions, 5);
    const [groupedFinding] = detectHumanIntervention(groupedReport);

    expect(groupedFinding.description).toContain("2");
    expect(groupedFinding.description).not.toContain(secretA);
    expect(groupedFinding.description).not.toContain(secretB);
    expect(groupedFinding.prescription).toBeUndefined();
    expect(JSON.stringify(groupedFinding.metric)).not.toContain(secretA);
    expect(JSON.stringify(groupedFinding.metric)).not.toContain(secretB);
    expect(groupedFinding.evidence.rawValue).toEqual([secretA, secretB]);
  });

  test("subtask (isSubtask ou parentId !== null) não gera achado", () => {
    const interventions: HumanIntervention[] = [
      createIntervention("msg-user-1", 2, "Use TypeScript"),
    ];

    expect(detectHumanIntervention(createReport(interventions, 5, true))).toHaveLength(0);
    expect(
      detectHumanIntervention(createReport(interventions, 5, false, "test-session", "parent-99"))
    ).toHaveLength(0);
  });

  test("tokenImpact é rotulado como estimativa com base de cálculo (I-6)", () => {
    const interventions: HumanIntervention[] = [
      createIntervention("msg-user-1", 1, "Use TypeScript"),
      createIntervention("msg-user-2", 2, "Adicione testes"),
      createIntervention("msg-user-3", 3, "Use ESLint"),
    ];

    const report = createReport(interventions, 5);
    const [finding] = detectHumanIntervention(report);

    expect(finding.tokenImpact).toBe(300);
    expect(finding.tokenImpactIsEstimate).toBe(true);
    expect(finding.tokenImpactEstimateBasis).toBeTruthy();
    expect(finding.metric.estimatedWastedTokens).toBe(300);
    expect(finding.metric.tokenImpactIsEstimate).toBe(true);
    expect(finding.metric.tokenImpactEstimateBasis).toBe(finding.tokenImpactEstimateBasis);
  });

  test("id inclui sessionId para evitar colisão entre sessões", () => {
    const interventions: HumanIntervention[] = [
      createIntervention("msg-user-1", 2, "Regra 1"),
    ];

    const [findingA] = detectHumanIntervention(createReport(interventions, 5, false, "session-a"));
    const [findingB] = detectHumanIntervention(createReport(interventions, 5, false, "session-b"));

    expect(findingA.id).toContain("session-a");
    expect(findingB.id).toContain("session-b");
    expect(findingA.id).not.toBe(findingB.id);
  });
});
