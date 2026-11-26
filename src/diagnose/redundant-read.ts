import type {
  ObserveReport,
  Finding,
  ToolCallRecord,
  TaskReport,
} from "../domain/types";

const ESTIMATED_TOKENS_PER_REDUNDANT_READ = 500;
const TOKEN_IMPACT_ESTIMATE_BASIS =
  "500 tokens per redundant read turn (heuristic)";

/**
 * Tools known to create or modify files in the workspace.
 *
 * Limitation: `execute_command` is intentionally excluded because arbitrary
 * shell commands cannot be reliably mapped to affected file paths (e.g. `rm`,
 * `sed -i`, code generators, or build scripts). A file modified solely via
 * `execute_command` between two reads will therefore still be flagged.
 */
const FILE_MUTATING_TOOLS: ReadonlySet<string> = new Set([
  "write_file",
  "write_to_file",
  "apply_diff",
  "insert_content",
  "search_and_replace",
]);

interface ReadGroup {
  tool: "read_file" | "list_files";
  normalizedPath: string;
  recursive: boolean;
  calls: ToolCallRecord[];
}

function normalizePath(path: string): string {
  if (!path || path === ".") {
    return path;
  }

  let normalized = path;

  while (normalized.startsWith("./")) {
    normalized = normalized.slice(2);
  }

  if (normalized.endsWith("/") && normalized.length > 1) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

/**
 * Returns true when a write to `writePath` can change the result of
 * `list_files` on `dir`.
 *
 * - Non-recursive `list_files dir`: matches `dir` itself or any direct child
 *   under `dir/` (no deeper `/`).
 * - Recursive `list_files dir`: matches `dir` itself or any descendant under
 *   `dir/`.
 */
function isWriteInDirectory(
  dir: string,
  writePath: string,
  recursive: boolean
): boolean {
  if (writePath === dir) {
    return true;
  }

  let remainder: string | null = null;
  if (dir === ".") {
    if (
      writePath.length > 0 &&
      !writePath.startsWith("/") &&
      writePath !== ".." &&
      !writePath.startsWith("../")
    ) {
      remainder = writePath;
    }
  } else if (dir === "/") {
    if (writePath.startsWith("/") && writePath.length > 1) {
      remainder = writePath.slice(1);
    }
  } else {
    const prefix = `${dir}/`;
    if (writePath.startsWith(prefix)) {
      remainder = writePath.slice(prefix.length);
    }
  }

  if (remainder === null || remainder.length === 0) {
    return false;
  }

  return recursive ? true : !remainder.includes("/");
}

function writeAffectsGroup(group: ReadGroup, normalizedWritePath: string): boolean {
  if (group.tool === "list_files") {
    return isWriteInDirectory(
      group.normalizedPath,
      normalizedWritePath,
      group.recursive
    );
  }
  return normalizedWritePath === group.normalizedPath;
}

/**
 * Splits sorted read turn indices into contiguous write-free segments.
 *
 * Each consecutive pair of reads (prevTurn, currTurn) is checked independently
 * against file-mutating calls affecting the read target. Because ToolCallRecord
 * does not encode execution order among parallel calls in the same turn, any
 * matching write in the closed interval `prevTurn <= writeTurn <= currTurn`
 * conservatively resets the segment.
 */
function findRedundantTurnSegments(
  task: TaskReport,
  group: ReadGroup,
  turnIndices: number[]
): number[][] {
  const writeTurns: number[] = [];

  for (const call of task.toolCalls) {
    if (!FILE_MUTATING_TOOLS.has(call.name)) {
      continue;
    }

    const callPath = call.arguments.path;
    if (typeof callPath !== "string" || !callPath) {
      continue;
    }

    if (writeAffectsGroup(group, normalizePath(callPath))) {
      writeTurns.push(call.turnIndex);
    }
  }

  const segments: number[][] = [];
  let currentSegment: number[] = [turnIndices[0]];

  for (let i = 1; i < turnIndices.length; i++) {
    const prevTurn = turnIndices[i - 1];
    const currTurn = turnIndices[i];
    const hasWriteInRange = writeTurns.some(
      (writeTurn) => writeTurn >= prevTurn && writeTurn <= currTurn
    );

    if (hasWriteInRange) {
      if (currentSegment.length > 1) {
        segments.push(currentSegment);
      }
      currentSegment = [currTurn];
    } else {
      currentSegment.push(currTurn);
    }
  }

  if (currentSegment.length > 1) {
    segments.push(currentSegment);
  }

  return segments;
}

function compareStringsLexical(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function firstTurnOf(group: ReadGroup): number {
  let min = group.calls[0].turnIndex;
  for (let i = 1; i < group.calls.length; i++) {
    if (group.calls[i].turnIndex < min) {
      min = group.calls[i].turnIndex;
    }
  }
  return min;
}

/**
 * Detector de releitura redundante — o mesmo arquivo ou diretório lido em
 * turnos diferentes sem modificação no intervalo.
 *
 * Regras:
 * - Considera apenas read_file e list_files
 * - Normaliza path antes de comparar (remove ./, barra final)
 * - Duas chamadas no mesmo turno NÃO são redundância
 * - Releitura após mutação de arquivo (FILE_MUTATING_TOOLS) no intervalo
 *   fechado [prevTurn, currTurn] reinicia o segmento; para list_files, escritas
 *   em arquivos dentro do diretório também reiniciam o segmento
 * - list_files com recursive: true e false são grupos separados
 * - O path cru fica somente em evidence.rawValue (redactable: true), nunca em
 *   id, description, prescription ou metric; o ID usa ordinal opaco (file-<n>)
 * - Subtasks (isSubtask || parentId !== null) são ignoradas (I-5)
 */
export function detectRedundantReads(report: ObserveReport): Finding[] {
  const findings: Finding[] = [];

  for (let taskIndex = 0; taskIndex < report.tasks.length; taskIndex++) {
    const task = report.tasks[taskIndex];
    if (task.isSubtask || task.parentId !== null) {
      continue;
    }

    const readFileGroups = new Map<string, ReadGroup>();
    const listFilesNonRecursiveGroups = new Map<string, ReadGroup>();
    const listFilesRecursiveGroups = new Map<string, ReadGroup>();

    for (const call of task.toolCalls) {
      if (call.name !== "read_file" && call.name !== "list_files") {
        continue;
      }

      const pathArg = call.arguments.path;
      if (typeof pathArg !== "string" || !pathArg) {
        continue;
      }

      const normalizedPath = normalizePath(pathArg);
      const isList = call.name === "list_files";
      const recursive = isList ? Boolean(call.arguments.recursive) : false;
      const targetMap = isList
        ? recursive
          ? listFilesRecursiveGroups
          : listFilesNonRecursiveGroups
        : readFileGroups;

      const existing = targetMap.get(normalizedPath);
      if (existing) {
        existing.calls.push(call);
      } else {
        targetMap.set(normalizedPath, {
          tool: call.name,
          normalizedPath,
          recursive,
          calls: [call],
        });
      }
    }

    const allGroups: ReadGroup[] = [
      ...readFileGroups.values(),
      ...listFilesNonRecursiveGroups.values(),
      ...listFilesRecursiveGroups.values(),
    ];

    if (allGroups.length === 0) {
      continue;
    }

    // Assign deterministic, opaque ordinals (file-1, file-2, ...) ordered by
    // first read turn, breaking ties lexically by normalizedPath (then tool /
    // recursive) so IDs never depend on or expose the path or a reversible hash.
    allGroups.sort(
      (a, b) =>
        firstTurnOf(a) - firstTurnOf(b) ||
        compareStringsLexical(a.normalizedPath, b.normalizedPath) ||
        compareStringsLexical(a.tool, b.tool) ||
        Number(a.recursive) - Number(b.recursive)
    );

    for (let groupIndex = 0; groupIndex < allGroups.length; groupIndex++) {
      const group = allGroups[groupIndex];
      const fileOrdinal = groupIndex + 1;

      const callsByTurn = new Map<number, ToolCallRecord[]>();
      for (const call of group.calls) {
        const turnCalls = callsByTurn.get(call.turnIndex);
        if (turnCalls) {
          turnCalls.push(call);
        } else {
          callsByTurn.set(call.turnIndex, [call]);
        }
      }

      if (callsByTurn.size <= 1) {
        continue;
      }

      const turnIndices = Array.from(callsByTurn.keys()).sort((a, b) => a - b);
      const redundantSegments = findRedundantTurnSegments(
        task,
        group,
        turnIndices
      );

      for (const segmentTurns of redundantSegments) {
        const segmentCalls = segmentTurns.flatMap(
          (turn) => callsByTurn.get(turn) ?? []
        );
        const originalPath = segmentCalls[0]?.arguments.path;
        const rawPath =
          typeof originalPath === "string"
            ? originalPath
            : group.normalizedPath;

        findings.push(
          createFinding(
            report,
            task,
            taskIndex,
            group,
            fileOrdinal,
            rawPath,
            segmentTurns,
            segmentCalls
          )
        );
      }
    }
  }

  return findings;
}

/**
 * Cria um Finding para um segmento de releituras redundantes.
 */
function createFinding(
  report: ObserveReport,
  task: TaskReport,
  taskIndex: number,
  group: ReadGroup,
  fileOrdinal: number,
  rawPath: string,
  turnIndices: number[],
  calls: ToolCallRecord[]
): Finding {
  const redundantReadTurns = turnIndices.length - 1;
  const estimatedWastedTokens =
    redundantReadTurns * ESTIMATED_TOKENS_PER_REDUNDANT_READ;
  const firstTurn = turnIndices[0];

  const toolCallIds = calls.map((call) => call.callId);
  const messageIds: string[] = [];
  for (const call of calls) {
    messageIds.push(call.assistantMessageId);
    if (call.resultMessageId !== null) {
      messageIds.push(call.resultMessageId);
    }
  }
  const uniqueMessageIds = [...new Set(messageIds)];

  const description =
    group.tool === "list_files"
      ? `A directory was listed redundantly across ${turnIndices.length} distinct turns (${turnIndices.join(", ")}) with no modification in between.`
      : `A file was read redundantly across ${turnIndices.length} distinct turns (${turnIndices.join(", ")}) with no modification in between.`;

  return {
    id: `redundant-read:${report.sessionId}:${task.taskId}:file-${fileOrdinal}:turn-${firstTurn}`,
    sessionId: report.sessionId,
    taskId: task.taskId,
    kind: "redundant-read",
    detectedAt: report.exportedAt,
    evidence: {
      type: "cross-reference",
      redactable: true,
      descriptionSafe: true,
      toolCallIds,
      messageIds: uniqueMessageIds,
      turnIndices,
      fieldPath: `tasks[${taskIndex}].toolCalls`,
      rawValue: rawPath,
    },
    confidence: "high",
    metric: {
      readCount: calls.length,
      distinctTurns: turnIndices.length,
      redundantReadTurns,
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
