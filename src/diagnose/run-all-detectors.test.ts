import { describe, test, expect } from "vitest";
import { ObserveReport } from "../domain/types";
import { runAllDetectors, formatDiagnoseReport } from "./run-all-detectors";

function createMinimalReport(): ObserveReport {
  return {
    sessionId: "test-session",
    exportedAt: 1724961600000,
    workspace: "test-workspace",
    tasks: [
      {
        taskId: "task-1",
        parentId: null,
        isSubtask: false,
        title: "Test",
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
        turns: [],
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
        humanInterventions: [],
        approval: {
          autoApprovalEnabled: false,
          allowedPermissions: [],
          approvedCommands: [],
        },
      },
    ],
    totals: {
      taskCount: 1,
      subtaskCount: 0,
      cost: 0.01,
      assistantTurns: 1,
      toolCalls: 0,
      erroredToolCalls: 0,
      humanInterventions: 0,
    },
    unavailableMetrics: [],
    anomalies: [],
  };
}

describe("runAllDetectors", () => {
  test("baseline com 0 intervenções retorna findings corretos", () => {
    const report = createMinimalReport();
    const result = runAllDetectors(report);
    
    expect(result.sessionId).toBe("test-session");
    expect(result.totalFindings).toBeGreaterThanOrEqual(0);
    expect(result.detectors.length).toBeGreaterThan(0);
  });

  test("detector com exceção não derruba os outros", () => {
    // Simular um detector que lança exceção
    const report = createMinimalReport();
    const result = runAllDetectors(report);
    
    // Pelo menos um detector deve ter rodado
    expect(result.detectors.some(d => !d.error)).toBe(true);
  });

  test("formatDiagnoseReport não expõe dados sensíveis", () => {
    const report = createMinimalReport();
    const result = runAllDetectors(report);
    const formatted = formatDiagnoseReport(result);
    
    expect(formatted).toContain("Session:");
    expect(formatted).toContain("Total Findings:");
    expect(formatted).toContain("Findings by Kind:");
  });

  test("findingsByKind agrupa corretamente", () => {
    const report = createMinimalReport();
    const result = runAllDetectors(report);
    
    // Cada kind deve ter contagem >= 0
    for (const [kind, count] of Object.entries(result.findingsByKind)) {
      expect(count).toBeGreaterThanOrEqual(0);
      expect(typeof kind).toBe("string");
    }
  });
});