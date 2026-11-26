import { describe, test, expect } from "vitest";
import { stableHash } from "../domain/hash";
import type { ObserveReport, ToolCallRecord } from "../domain/types";
import { detectRedundantReads } from "./redundant-read";

/**
 * Helper para criar um ObserveReport mínimo para testes.
 */
function createReport(
  toolCalls: ToolCallRecord[],
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
      taskCount: isSubtask ? 0 : 1,
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
    errorMessage: null,
    permission: "read",
    durationMs: 100,
    isOutsideWorkspace: false,
  };
}

type MutatingToolName =
  | "write_file"
  | "write_to_file"
  | "apply_diff"
  | "insert_content"
  | "search_and_replace";

/**
 * Helper para criar uma ToolCallRecord de escrita/mutação.
 */
function createWriteCall(
  name: MutatingToolName,
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
    errorMessage: null,
    permission: "edit",
    durationMs: 100,
    isOutsideWorkspace: false,
  };
}

function createCommandCall(command: string, turnIndex: number): ToolCallRecord {
  return {
    callId: `call-execute_command-${turnIndex}`,
    name: "execute_command",
    arguments: { command },
    turnIndex,
    assistantMessageId: `msg-${turnIndex}`,
    resultMessageId: `result-${turnIndex}`,
    isError: false,
    errorMessage: null,
    permission: "execute",
    durationMs: 100,
    isOutsideWorkspace: false,
  };
}

describe("detectRedundantReads", () => {
  test("baseline real (benchmark/rodada-a.json) — 0 achados", () => {
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
      createReadCall("read_file", "src/index.ts", 2),
    ];

    const report = createReport(toolCalls);
    const findings = detectRedundantReads(report);

    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("redundant-read");
    expect(findings[0].evidence.turnIndices).toEqual([0, 2]);
    expect(findings[0].tokenImpact).toBeGreaterThan(0);
  });

  test("duas leituras no mesmo turno — 0 achados", () => {
    const toolCalls: ToolCallRecord[] = [
      createReadCall("read_file", "src/index.ts", 0),
      createReadCall("read_file", "src/index.ts", 0),
    ];

    const report = createReport(toolCalls);
    const findings = detectRedundantReads(report);

    expect(findings).toHaveLength(0);
  });

  test("releitura após write_file — 0 achados", () => {
    const toolCalls: ToolCallRecord[] = [
      createReadCall("read_file", "src/index.ts", 0),
      createWriteCall("write_file", "src/index.ts", 1),
      createReadCall("read_file", "src/index.ts", 2),
    ];

    const report = createReport(toolCalls);
    const findings = detectRedundantReads(report);

    expect(findings).toHaveLength(0);
  });

  test("escrita em paralelo no mesmo turno da leitura reinicia o segmento conservadoramente", () => {
    // Turno 1: read_file a; Turno 3: read_file a + apply_diff a em paralelo; Turno 5: read_file a
    const parallelMidWrite: ToolCallRecord[] = [
      createReadCall("read_file", "src/index.ts", 1),
      createReadCall("read_file", "src/index.ts", 3),
      createWriteCall("apply_diff", "src/index.ts", 3),
      createReadCall("read_file", "src/index.ts", 5),
    ];
    expect(detectRedundantReads(createReport(parallelMidWrite))).toHaveLength(0);

    // Leitura anterior [1, 2] continua redundante, mas escrita paralela no 3 corta [2, 3] e [3, 5]
    const priorRedundantThenParallelWrite: ToolCallRecord[] = [
      createReadCall("read_file", "src/index.ts", 1),
      createReadCall("read_file", "src/index.ts", 2),
      createReadCall("read_file", "src/index.ts", 3),
      createWriteCall("apply_diff", "src/index.ts", 3),
      createReadCall("read_file", "src/index.ts", 5),
    ];
    const findings = detectRedundantReads(
      createReport(priorRedundantThenParallelWrite)
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].evidence.turnIndices).toEqual([1, 2]);

    // Escrita paralela no turno 1 corta [1, 5], mas preserva redundância posterior [5, 9]
    const parallelFirstWrite: ToolCallRecord[] = [
      createReadCall("read_file", "src/index.ts", 1),
      createWriteCall("write_file", "src/index.ts", 1),
      createReadCall("read_file", "src/index.ts", 5),
      createReadCall("read_file", "src/index.ts", 9),
    ];
    const afterFindings = detectRedundantReads(createReport(parallelFirstWrite));
    expect(afterFindings).toHaveLength(1);
    expect(afterFindings[0].evidence.turnIndices).toEqual([5, 9]);
  });

  test("todas as tools mutadoras de arquivo reiniciam o segmento", () => {
    const mutators: MutatingToolName[] = [
      "write_file",
      "write_to_file",
      "apply_diff",
      "insert_content",
      "search_and_replace",
    ];

    for (const toolName of mutators) {
      const toolCalls: ToolCallRecord[] = [
        createReadCall("read_file", "src/app.ts", 0),
        createWriteCall(toolName, "src/app.ts", 1),
        createReadCall("read_file", "src/app.ts", 2),
      ];
      expect(
        detectRedundantReads(createReport(toolCalls)),
        `expected ${toolName} to reset redundant-read segment`
      ).toHaveLength(0);
    }
  });

  test("limitação documentada: execute_command entre leituras não reinicia o segmento", () => {
    // execute_command fica fora da lista de mutadores porque não dá para inferir
    // com segurança quais arquivos um comando arbitrário de shell altera.
    const toolCalls: ToolCallRecord[] = [
      createReadCall("read_file", "src/generated.ts", 0),
      createCommandCall("npm run codegen", 1),
      createReadCall("read_file", "src/generated.ts", 2),
    ];

    const findings = detectRedundantReads(createReport(toolCalls));
    expect(findings).toHaveLength(1);
    expect(findings[0].evidence.turnIndices).toEqual([0, 2]);
  });

  test("list_files reinicia o segmento quando um arquivo é escrito dentro do diretório", () => {
    // Escrita em filho direto reinicia list_files não recursivo
    const nonRecursiveDirectChild: ToolCallRecord[] = [
      createReadCall("list_files", "src", 0, false),
      createWriteCall("write_file", "src/new-file.ts", 1),
      createReadCall("list_files", "src", 2, false),
    ];
    expect(
      detectRedundantReads(createReport(nonRecursiveDirectChild))
    ).toHaveLength(0);

    // Escrita em descendente profundo reinicia list_files recursivo
    const recursiveDescendant: ToolCallRecord[] = [
      createReadCall("list_files", "src", 0, true),
      createWriteCall("write_file", "src/nested/deep/file.ts", 1),
      createReadCall("list_files", "src", 2, true),
    ];
    expect(
      detectRedundantReads(createReport(recursiveDescendant))
    ).toHaveLength(0);

    // Escrita em descendente profundo NÃO afeta list_files não recursivo
    const nonRecursiveDeepDescendant: ToolCallRecord[] = [
      createReadCall("list_files", "src", 0, false),
      createWriteCall("apply_diff", "src/nested/deep/file.ts", 1),
      createReadCall("list_files", "src", 2, false),
    ];
    expect(
      detectRedundantReads(createReport(nonRecursiveDeepDescendant))
    ).toHaveLength(1);

    // Escrita em diretório irmão com mesmo prefixo textual (src-other/) NÃO afeta list_files src
    const siblingPrefix: ToolCallRecord[] = [
      createReadCall("list_files", "src", 0, true),
      createWriteCall("write_file", "src-other/file.ts", 1),
      createReadCall("list_files", "src", 2, true),
    ];
    expect(detectRedundantReads(createReport(siblingPrefix))).toHaveLength(1);

    // list_files "." reinicia quando um arquivo relativo é criado na raiz
    const dotDir: ToolCallRecord[] = [
      createReadCall("list_files", ".", 0, false),
      createWriteCall("write_file", "./Dockerfile", 1),
      createReadCall("list_files", ".", 2, false),
    ];
    expect(detectRedundantReads(createReport(dotDir))).toHaveLength(0);
  });

  test("paths contendo '|' são agrupados e comparados com escritas corretamente", () => {
    const pipedFile = "src/a|b.ts";
    const redundantPiped: ToolCallRecord[] = [
      createReadCall("read_file", pipedFile, 0),
      createReadCall("read_file", pipedFile, 2),
    ];
    const findings = detectRedundantReads(createReport(redundantPiped));
    expect(findings).toHaveLength(1);
    expect(findings[0].evidence.rawValue).toBe(pipedFile);

    const writtenPiped: ToolCallRecord[] = [
      createReadCall("read_file", pipedFile, 0),
      createWriteCall("write_file", pipedFile, 1),
      createReadCall("read_file", pipedFile, 2),
    ];
    expect(detectRedundantReads(createReport(writtenPiped))).toHaveLength(0);

    const pipedDir = "dir|pipe";
    const writtenInsidePipedDir: ToolCallRecord[] = [
      createReadCall("list_files", pipedDir, 0, true),
      createWriteCall("write_file", `${pipedDir}/child.ts`, 1),
      createReadCall("list_files", pipedDir, 2, true),
    ];
    expect(
      detectRedundantReads(createReport(writtenInsidePipedDir))
    ).toHaveLength(0);
  });

  test("escrita entre leituras anteriores não descarta releitura redundante posterior (1, 5, 9 com escrita no 3)", () => {
    const toolCalls: ToolCallRecord[] = [
      createReadCall("read_file", "src/index.ts", 1),
      createWriteCall("write_file", "src/index.ts", 3),
      createReadCall("read_file", "src/index.ts", 5),
      createReadCall("read_file", "src/index.ts", 9),
    ];

    const findings = detectRedundantReads(createReport(toolCalls));

    expect(findings).toHaveLength(1);
    expect(findings[0].evidence.turnIndices).toEqual([5, 9]);
    expect(findings[0].metric.distinctTurns).toBe(2);
    expect(findings[0].metric.redundantReadTurns).toBe(1);
    expect(findings[0].tokenImpact).toBe(500);
  });

  test("avalia cada par consecutivo e emite achados distintos para segmentos separados por apply_diff", () => {
    const toolCalls: ToolCallRecord[] = [
      createReadCall("read_file", "src/index.ts", 1),
      createReadCall("read_file", "src/index.ts", 2),
      createWriteCall("apply_diff", "src/index.ts", 3),
      createReadCall("read_file", "src/index.ts", 5),
      createReadCall("read_file", "src/index.ts", 9),
    ];

    const findings = detectRedundantReads(createReport(toolCalls));

    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.evidence.turnIndices)).toEqual([
      [1, 2],
      [5, 9],
    ]);
    expect(new Set(findings.map((f) => f.id)).size).toBe(2);
  });

  test("escritas entre todos os pares consecutivos — 0 achados", () => {
    const toolCalls: ToolCallRecord[] = [
      createReadCall("read_file", "src/index.ts", 1),
      createWriteCall("write_file", "src/index.ts", 3),
      createReadCall("read_file", "src/index.ts", 5),
      createWriteCall("apply_diff", "src/index.ts", 7),
      createReadCall("read_file", "src/index.ts", 9),
    ];

    expect(detectRedundantReads(createReport(toolCalls))).toHaveLength(0);
  });

  test("paths equivalentes (./a e a) — 1 achado", () => {
    const toolCalls: ToolCallRecord[] = [
      createReadCall("read_file", "./src/index.ts", 0),
      createReadCall("read_file", "src/index.ts", 2),
    ];

    const report = createReport(toolCalls);
    const findings = detectRedundantReads(report);

    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("redundant-read");
  });

  test("list_files recursivo vs. não — 0 achados", () => {
    const toolCalls: ToolCallRecord[] = [
      createReadCall("list_files", "src", 0, true),
      createReadCall("list_files", "src", 2, false),
    ];

    const report = createReport(toolCalls);
    const findings = detectRedundantReads(report);

    expect(findings).toHaveLength(0);
  });

  test("subtask (isSubtask ou parentId !== null) não gera achado", () => {
    const toolCalls: ToolCallRecord[] = [
      createReadCall("read_file", "src/index.ts", 0),
      createReadCall("read_file", "src/index.ts", 2),
    ];

    expect(detectRedundantReads(createReport(toolCalls, true))).toHaveLength(0);
    expect(
      detectRedundantReads(
        createReport(toolCalls, false, "test-session", "parent-99")
      )
    ).toHaveLength(0);
  });

  test("path cru fica somente em evidence.rawValue (redactable) e ID usa ordinal opaco não-reversível", () => {
    const secretPath = "/home/alice/private-repo/src/secrets.ts";
    const toolCalls: ToolCallRecord[] = [
      createReadCall("read_file", secretPath, 0),
      createReadCall("read_file", secretPath, 2),
    ];

    const [finding] = detectRedundantReads(createReport(toolCalls));

    expect(finding.evidence.redactable).toBe(true);
    expect(finding.evidence.descriptionSafe).toBe(true);
    expect(finding.evidence.rawValue).toBe(secretPath);

    // ID usa ordinal opaco (file-1) em vez do path ou de hash reversível do path
    expect(finding.id).toBe("redundant-read:test-session:task-1:file-1:turn-0");
    expect(finding.id).not.toContain(stableHash(secretPath));
    expect(finding.id).not.toContain("alice");
    expect(finding.id).not.toContain("secrets");
    expect(finding.id).not.toContain("/");

    expect(finding.description).not.toContain("alice");
    expect(finding.description).not.toContain("secrets");
    expect(finding.description).not.toContain("/");

    expect(finding.prescription).toBeUndefined();
    expect(finding.metric.path).toBeUndefined();
    expect(JSON.stringify(finding.metric)).not.toContain("alice");
    expect(JSON.stringify(finding.metric)).not.toContain("secrets");
    expect(JSON.stringify(finding.metric)).not.toContain("/");
  });

  test("ordinais file-<n> são determinísticos por turno de primeira leitura com desempate lexical", () => {
    // Dois arquivos lidos pela primeira vez no turno 0 (ordem de inserção invertida)
    // e um terceiro arquivo lido pela primeira vez no turno 1.
    const callsOrderA: ToolCallRecord[] = [
      createReadCall("read_file", "src/zeta.ts", 0),
      createReadCall("read_file", "src/alpha.ts", 0),
      createReadCall("read_file", "src/middle.ts", 1),
      createReadCall("read_file", "src/zeta.ts", 2),
      createReadCall("read_file", "src/alpha.ts", 3),
      createReadCall("read_file", "src/middle.ts", 4),
    ];
    const callsOrderB: ToolCallRecord[] = [
      createReadCall("read_file", "src/alpha.ts", 0),
      createReadCall("read_file", "src/zeta.ts", 0),
      createReadCall("read_file", "src/middle.ts", 1),
      createReadCall("read_file", "src/alpha.ts", 3),
      createReadCall("read_file", "src/zeta.ts", 2),
      createReadCall("read_file", "src/middle.ts", 4),
    ];

    const findingsA = detectRedundantReads(createReport(callsOrderA));
    const findingsB = detectRedundantReads(createReport(callsOrderB));

    expect(findingsA.map((f) => [f.id, f.evidence.rawValue])).toEqual([
      ["redundant-read:test-session:task-1:file-1:turn-0", "src/alpha.ts"],
      ["redundant-read:test-session:task-1:file-2:turn-0", "src/zeta.ts"],
      ["redundant-read:test-session:task-1:file-3:turn-1", "src/middle.ts"],
    ]);
    expect(findingsB.map((f) => [f.id, f.evidence.rawValue])).toEqual(
      findingsA.map((f) => [f.id, f.evidence.rawValue])
    );
  });

  test("id inclui sessionId para evitar colisão entre sessões", () => {
    const toolCalls: ToolCallRecord[] = [
      createReadCall("read_file", "src/index.ts", 0),
      createReadCall("read_file", "src/index.ts", 2),
    ];

    const [findingA] = detectRedundantReads(
      createReport(toolCalls, false, "session-a")
    );
    const [findingB] = detectRedundantReads(
      createReport(toolCalls, false, "session-b")
    );

    expect(findingA.id).toContain("session-a");
    expect(findingB.id).toContain("session-b");
    expect(findingA.id).not.toBe(findingB.id);
  });

  test("tokenImpact é rotulado como estimativa com base de cálculo (I-6)", () => {
    const toolCalls: ToolCallRecord[] = [
      createReadCall("read_file", "src/index.ts", 0),
      createReadCall("read_file", "src/index.ts", 2),
      createReadCall("read_file", "src/index.ts", 4),
    ];

    const [finding] = detectRedundantReads(createReport(toolCalls));

    expect(finding.tokenImpact).toBe(1000);
    expect(finding.tokenImpactIsEstimate).toBe(true);
    expect(finding.tokenImpactEstimateBasis).toBeTruthy();
    expect(finding.metric.tokenImpactIsEstimate).toBe(true);
    expect(finding.metric.tokenImpactEstimateBasis).toBe(
      finding.tokenImpactEstimateBasis
    );
  });
});
