import { describe, test, expect } from "vitest";
import { ObserveReport, ToolCallRecord } from "../domain/types";
import { detectRedundantReads } from "./redundant-read";

/**
 * Helper para criar um ObserveReport mínimo para testes.
 */
function createReport(
  toolCalls: ToolCallRecord[],
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
        turns: [],
        toolCalls,
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
      subtaskCount: isSubtask ? 1 : 0,
      cost: 0.01,
      assistantTurns: 1,
      toolCalls: toolCalls.length,
      erroredToolCalls: 0,
      humanInterventions: 0,
    },
    unavailableMetrics: [],
    anomalies: [],
  };
}

/**
 * Helper para criar uma ToolCallRecord de leitura.
 */
function createReadCall(
  name: "read_file" | "list_files",
  path: string,
  turnIndex: number,
  recursive?: boolean
): ToolCallRecord {
  return {
    callId: `call-${name}-${path}-${turnIndex}`,
    name,
    arguments: {
      path,
      ...(recursive !== undefined && { recursive }),
    },
    turnIndex,
    assistantMessageId: `msg-${turnIndex}`,
    resultMessageId: `result-${turnIndex}`,
    isError: false,
    permission: "read",
    durationMs: 100,
    isOutsideWorkspace: false,
  };
}

/**
 * Helper para criar uma ToolCallRecord de escrita.
 */
function createWriteCall(
  name: "write_file" | "apply_diff",
  path: string,
  turnIndex: number
): ToolCallRecord {
  return {
    callId: `call-${name}-${path}-${turnIndex}`,
    name,
    arguments: { path },
    turnIndex,
    assistantMessageId: `msg-${turnIndex}`,
    resultMessageId: `result-${turnIndex}`,
    isError: false,
    permission: "edit",
    durationMs: 100,
    isOutsideWorkspace: false,
  };
}

describe("detectRedundantReads", () => {
  test("baseline real (benchmark/rodada-a.json) — 0 achados", () => {
    // Simula o baseline onde não há releituras
    const toolCalls: ToolCallRecord[] = [
      createReadCall("read_file", "src/index.ts", 0),
      createReadCall("read_file", "src/utils.ts", 1),
      createReadCall("read_file", "package.json", 2),
    ];
    
    const report = createReport(toolCalls);
    const findings = detectRedundantReads(report);
    
    expect(findings).toHaveLength(0);
  });

  test("releitura em turnos distintos — 1 achado", () => {
    const toolCalls: ToolCallRecord[] = [
      createReadCall("read_file", "src/index.ts", 0),
      createReadCall("read_file", "src/index.ts", 2), // releitura no turno 2
    ];
    
    const report = createReport(toolCalls);
    const findings = detectRedundantReads(report);
    
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("redundant-read");
    expect(findings[0].evidence.turnIndices).toEqual([0, 2]);
    expect(findings[0].tokenImpact).toBeGreaterThan(0);
  });

  test("duas leituras no mesmo turno — 0 achados", () => {
    // Duas chamadas no mesmo turno NÃO são redundância
    const toolCalls: ToolCallRecord[] = [
      createReadCall("read_file", "src/index.ts", 0),
      createReadCall("read_file", "src/index.ts", 0), // mesmo turno
    ];
    
    const report = createReport(toolCalls);
    const findings = detectRedundantReads(report);
    
    expect(findings).toHaveLength(0);
  });

  test("releitura após write_file — 0 achados", () => {
    const toolCalls: ToolCallRecord[] = [
      createReadCall("read_file", "src/index.ts", 0),
      createWriteCall("write_file", "src/index.ts", 1), // escrita no meio
      createReadCall("read_file", "src/index.ts", 2), // releitura após escrita
    ];
    
    const report = createReport(toolCalls);
    const findings = detectRedundantReads(report);
    
    expect(findings).toHaveLength(0);
  });

  test("paths equivalentes (./a e a) — 1 achado", () => {
    const toolCalls: ToolCallRecord[] = [
      createReadCall("read_file", "./src/index.ts", 0),
      createReadCall("read_file", "src/index.ts", 2), // mesmo path normalizado
    ];
    
    const report = createReport(toolCalls);
    const findings = detectRedundantReads(report);
    
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("redundant-read");
  });

  test("list_files recursivo vs. não — 0 achados", () => {
    const toolCalls: ToolCallRecord[] = [
      createReadCall("list_files", "src", 0, true), // recursivo
      createReadCall("list_files", "src", 2, false), // não recursivo
    ];
    
    const report = createReport(toolCalls);
    const findings = detectRedundantReads(report);
    
    expect(findings).toHaveLength(0);
  });

  test("subtask não gera achado", () => {
    const toolCalls: ToolCallRecord[] = [
      createReadCall("read_file", "src/index.ts", 0),
      createReadCall("read_file", "src/index.ts", 2),
    ];
    
    const report = createReport(toolCalls, true); // isSubtask = true
    const findings = detectRedundantReads(report);
    
    expect(findings).toHaveLength(0);
  });

  test("evidence.redactable é true", () => {
    const toolCalls: ToolCallRecord[] = [
      createReadCall("read_file", "src/index.ts", 0),
      createReadCall("read_file", "src/index.ts", 2),
    ];
    
    const report = createReport(toolCalls);
    const findings = detectRedundantReads(report);
    
    expect(findings).toHaveLength(1);
    expect(findings[0].evidence.redactable).toBe(true);
  });

  test("tokenImpact é estimativa baseada no número de turnos", () => {
    const toolCalls: ToolCallRecord[] = [
      createReadCall("read_file", "src/index.ts", 0),
      createReadCall("read_file", "src/index.ts", 2),
      createReadCall("read_file", "src/index.ts", 4), // 3 turnos
    ];
    
    const report = createReport(toolCalls);
    const findings = detectRedundantReads(report);
    
    expect(findings).toHaveLength(1);
    // 3 turnos = 2 releituras redundantes = 2 * 500 = 1000 tokens
    expect(findings[0].tokenImpact).toBe(1000);
  });
});