import { ObserveReport, Finding, ToolCallRecord, TaskReport } from "../domain/types";

function normalizePath(path: string): string{
    if(!path || path === "."){
        return path
    }

    let normalized = path;

    while (normalized.startsWith("./")){
        normalized = normalized.slice(2);
    }

    if (normalized.endsWith("/") && normalized.length > 1) {
        normalized = normalized.slice(0, -1);
    }

    return normalized;
}

/**
 * Verifica se houve escrita (write_file ou apply_diff) no mesmo path
 * entre os turnos especificados.
 */
function hasWriteBetweenTurns(
  task: TaskReport,
  path: string,
  turnIndices: number[]
): boolean {
  const normalizedPath = normalizePath(path);

  // Filtrar escritas no mesmo path
  const writes = task.toolCalls.filter(call => {
    if (call.name !== "write_file" && call.name !== "apply_diff") {
      return false;
    }

    const callPath = call.arguments.path as string | undefined;
    if (!callPath) {
      return false;
    }

    return normalizePath(callPath) === normalizedPath;
  });

  // Verificar se alguma escrita ocorreu entre os turnos de leitura
  const minTurn = Math.min(...turnIndices);
  const maxTurn = Math.max(...turnIndices);

  for (const write of writes) {
    // Escrita deve estar estritamente entre o primeiro e último turno de leitura
    if (write.turnIndex > minTurn && write.turnIndex < maxTurn) {
      return true;
    }
  }

  return false;
}

/**
 * Detector de releitura redundante — o mesmo arquivo lido em turnos diferentes.
 *
 * Regras:
 * - Considera apenas read_file e list_files
 * - Normaliza path antes de comparar (remove ./, barra final)
 * - Duas chamadas no mesmo turno NÃO são redundância
 * - Releitura após write_file/apply_diff é legítima (conteúdo mudou)
 * - list_files com recursive: true e false são chamadas diferentes
 */

export function detectRedundantReads(report: ObserveReport): Finding[] {
  const findings: Finding[] = [];

  // Processar cada task separadamente
  for (const task of report.tasks) {
    // Pular subtasks (não agregamos nelas)
    if (task.isSubtask) {
      continue;
    }

    // Filtrar apenas read_file e list_files
    const readCalls = task.toolCalls.filter(call =>
      call.name === "read_file" || call.name === "list_files"
    );

    if (readCalls.length === 0) {
      continue;
    }

    // Agrupar por path normalizado
    // Chave: "path|recursive:true/false" (para list_files)
    const groupedByPath = new Map<string, ToolCallRecord[]>();

    for (const call of readCalls) {
      const pathArg = call.arguments.path as string | undefined;
      if (!pathArg) {
        continue;
      }

      const normalizedPath = normalizePath(pathArg);

      // Para list_files, incluir recursive na chave
      let key = normalizedPath;
      if (call.name === "list_files") {
        const recursive = call.arguments.recursive as boolean | undefined;
        key = `${normalizedPath}|recursive:${recursive ?? false}`;
      }

      if (!groupedByPath.has(key)) {
        groupedByPath.set(key, []);
      }
      groupedByPath.get(key)!.push(call);
    }

    // Para cada grupo, verificar se há releitura em turnos distintos
    for (const [pathKey, calls] of groupedByPath.entries()) {
      // Agrupar por turnIndex para identificar chamadas no mesmo turno
      const callsByTurn = new Map<number, ToolCallRecord[]>();

      for (const call of calls) {
        if (!callsByTurn.has(call.turnIndex)) {
          callsByTurn.set(call.turnIndex, []);
        }
        callsByTurn.get(call.turnIndex)!.push(call);
      }

      // Se há apenas um turno com leituras, não há redundância
      if (callsByTurn.size <= 1) {
        continue;
      }

      // Ordenar turnos
      const turnIndices = Array.from(callsByTurn.keys()).sort((a, b) => a - b);

      // Verificar se houve escrita no meio
      const pathWithoutRecursive = pathKey.split("|")[0];
      if (hasWriteBetweenTurns(task, pathWithoutRecursive, turnIndices)) {
        // Releitura após escrita é legítima - não é redundância
        continue;
      }

      // Extrair o path original da primeira chamada
      const originalPath = calls[0].arguments.path as string;
      const pathForDisplay = typeof originalPath === "string" ? originalPath : pathWithoutRecursive;

      // Criar o Finding
      const finding: Finding = createFinding(
        report,
        task,
        pathForDisplay,
        turnIndices,
        calls
      );

      findings.push(finding);
    }
  }

  return findings;
}

/**
 * Cria um Finding para releitura redundante.
 */
function createFinding(
  report: ObserveReport,
  task: TaskReport,
  path: string,
  turnIndices: number[],
  calls: ToolCallRecord[]
): Finding {
  // Estimativa de tokens desperdiçados: assumir ~500 tokens por leitura redundante
  // (isso é uma estimativa conservadora - na F6 podemos refinar)
  const estimatedWastedTokens = (turnIndices.length - 1) * 500;

  return {
    id: `redundant-read-${task.taskId}-${path.replace(/[^a-zA-Z0-9]/g, "-")}`,
    sessionId: report.sessionId,
    taskId: task.taskId,
    kind: "redundant-read",
    detectedAt: report.exportedAt,
    evidence: {
      type: "cross-reference",
      redactable: true,
      turnIndices,
      fieldPath: `tasks[${task.taskId}].toolCalls`,
    },
    confidence: "high",
    metric: {
      path,
      readCount: calls.length,
      distinctTurns: turnIndices.length,
      estimatedWastedTokens,
    },
    prescriptionHint: "agents-md-section",
    description: `File "${path}" was read across ${turnIndices.length} distinct turns (${turnIndices.join(", ")}) with no modification in between.`,
    tokenImpact: estimatedWastedTokens,
  };
}