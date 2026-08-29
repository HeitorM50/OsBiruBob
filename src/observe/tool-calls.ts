/**
 * Tool-call extraction and correlation — Hindsight
 *
 * Responsibility: extract a flat, ordered sequence of ToolCallRecord entries
 * from a task's messages, correlating each call with its result exclusively
 * by ID (I-4). Anomalies (unmatched calls, orphan results, duplicate IDs) are
 * collected and returned alongside the records.
 *
 * Allowed imports: src/domain/types.ts only.
 * Forbidden imports: diagnose, prescribe, compare, CLI/UI, parser.
 * Forbidden Node APIs: fs, path, process, os.
 * Forbidden network: fetch, XMLHttpRequest.
 */

import type {
  Message,
  ToolCallRecord,
  ObserveAnomaly,
  TurnMetrics,
  ToolPermission,
} from "../domain/types";

// ---------------------------------------------------------------------------
// Public contract
// ---------------------------------------------------------------------------

export interface ToolCallExtraction {
  /** Ordered ToolCallRecord entries — turn order, then original toolCalls[] order. */
  records: ToolCallRecord[];
  /** Structural anomalies: unmatched calls, orphans, duplicates. */
  anomalies: ObserveAnomaly[];
}

/**
 * A ToolCallRecord ready for public output: arguments replaced with
 * [REDACTED] by default to prevent accidental leakage of paths or code.
 */
export type PublicToolCallRecord = Omit<ToolCallRecord, "arguments"> & {
  /** Always "[REDACTED]" unless the caller explicitly opts in via includeRaw. */
  arguments: Record<string, unknown> | "[REDACTED]";
};

// ---------------------------------------------------------------------------
// extractToolCalls — public entry point
// ---------------------------------------------------------------------------

/**
 * Extract and correlate the tool-call sequence from a task's messages.
 *
 * Rules enforced here:
 * - Message ordering by _meta.timestamp (same as extractTurnMetrics).
 * - turnIndex is 0-based over assistant messages that have _meta.spend.
 * - Call ordering within a turn: original toolCalls[] array order preserved.
 * - Correlation is exclusively by callId === toolUsage.signature.id (I-4).
 * - Parallel calls share the same turnIndex; result order does not determine
 *   call order.
 * - Unmatched calls appear in records with all result fields null.
 * - Orphan results produce an ObserveAnomaly; no artificial record is created.
 * - Duplicate callIds: integrity anomaly emitted; no arbitrary correlation.
 *   All calls with the same id are kept in records but result fields are left
 *   null (conservative policy — see comment below).
 * - Duplicate resultIds: integrity anomaly emitted; correlation for that id
 *   is blocked (all calls referring to it get null result fields).
 * - Input arrays are never mutated.
 *
 * @param taskId   - Used in ObserveAnomaly.taskId for traceability.
 * @param messages - All messages for this task (any order; sorted internally).
 * @param turns    - Optional pre-computed TurnMetrics. When provided, their
 *                   ordering is used to assign turnIndex to assistant messages.
 *                   When omitted, the function replicates extractTurnMetrics
 *                   ordering inline.
 */
export function extractToolCalls(
  taskId: string,
  messages: readonly Message[],
  turns?: readonly TurnMetrics[]
): ToolCallExtraction {
  const anomalies: ObserveAnomaly[] = [];

  // ------------------------------------------------------------------
  // Step 1 — Sort all messages by _meta.timestamp (same rule as observe).
  //          Use original array index as deterministic tiebreaker.
  // ------------------------------------------------------------------
  const indexed = messages.map((msg, i) => ({ msg, i }));
  indexed.sort((a, b) => {
    const tsDiff = a.msg.data._meta.timestamp - b.msg.data._meta.timestamp;
    return tsDiff !== 0 ? tsDiff : a.i - b.i;
  });

  // ------------------------------------------------------------------
  // Step 2 — Walk sorted messages and assign turnIndex to each assistant
  //          message that has _meta.spend (same filter as extractTurnMetrics).
  //          If caller supplied pre-computed turns, use their messageId → index
  //          mapping instead (they must have been produced with the same rules).
  // ------------------------------------------------------------------
  const assistantTurnIndex = new Map<string, number>();
  if (turns && turns.length > 0) {
    for (const turn of turns) {
      assistantTurnIndex.set(turn.messageId, turn.index);
    }
  } else {
    let idx = 0;
    for (const { msg } of indexed) {
      if (
        msg.role === "assistant" &&
        msg.data.role === "assistant" &&
        msg.data._meta.spend !== undefined
      ) {
        assistantTurnIndex.set(msg.id, idx);
        idx++;
      }
    }
  }

  // ------------------------------------------------------------------
  // Step 3 — Collect all call records from assistant messages in order.
  //          Detect duplicate callIds at this stage.
  // ------------------------------------------------------------------

  // callId → list of occurrences (one per appearance)
  const callOccurrences = new Map<
    string,
    Array<{ turnIndex: number; assistantMessageId: string; callIdx: number }>
  >();

  // Ordered list of (callId, turnIndex, assistantMessageId, arguments, name)
  // in emit order (turn order × toolCalls[] order within each turn).
  type CallEntry = {
    callId: string;
    name: string;
    arguments: Record<string, unknown>;
    turnIndex: number;
    assistantMessageId: string;
  };
  const callEntries: CallEntry[] = [];

  for (const { msg } of indexed) {
    if (
      msg.role !== "assistant" ||
      msg.data.role !== "assistant" ||
      msg.data._meta.spend === undefined
    )
      continue;

    const tIdx = assistantTurnIndex.get(msg.id);
    if (tIdx === undefined) continue; // should not happen with consistent turns

    const toolCalls = msg.data.toolCalls ?? [];
    for (let ci = 0; ci < toolCalls.length; ci++) {
      const tc = toolCalls[ci];
      const existing = callOccurrences.get(tc.id) ?? [];
      existing.push({ turnIndex: tIdx, assistantMessageId: msg.id, callIdx: ci });
      callOccurrences.set(tc.id, existing);

      callEntries.push({
        callId: tc.id,
        name: tc.name,
        arguments: tc.arguments,
        turnIndex: tIdx,
        assistantMessageId: msg.id,
      });
    }
  }

  // Detect duplicate callIds — emit anomaly, mark as ambiguous (result blocked).
  const duplicateCallIds = new Set<string>();
  for (const [id, occurrences] of callOccurrences) {
    if (occurrences.length > 1) {
      duplicateCallIds.add(id);
      anomalies.push({
        kind: "duplicate-tool-call-id",
        taskId,
        callId: id,
        // Include assistantMessageId of first occurrence for traceability.
        messageId: occurrences[0].assistantMessageId,
        detail: `callId "${id}" appears in ${occurrences.length} assistant messages. ` +
          `Correlation blocked to avoid arbitrary association.`,
      });
    }
  }

  // ------------------------------------------------------------------
  // Step 4 — Collect all tool-result messages, detect duplicate resultIds.
  // ------------------------------------------------------------------

  type ResultEntry = {
    messageId: string;
    signatureId: string;
    isError: boolean;
    permission: ToolPermission;
    durationMs: number | null;
    isOutsideWorkspace: boolean;
  };

  // resultId → list of result entries (one per tool message)
  const resultOccurrences = new Map<string, ResultEntry[]>();

  for (const { msg } of indexed) {
    if (msg.role !== "tool" || msg.data.role !== "tool") continue;
    const usage = msg.data.toolUsage;
    const sigId = usage.signature.id;

    const entry: ResultEntry = {
      messageId: msg.id,
      signatureId: sigId,
      isError: usage.signature.isError,
      permission: usage.permission,
      durationMs: msg.data._meta.durationMs ?? null,
      isOutsideWorkspace: usage.isOutsideWorkspace,
    };

    const existing = resultOccurrences.get(sigId) ?? [];
    existing.push(entry);
    resultOccurrences.set(sigId, existing);
  }

  // Detect duplicate resultIds.
  const duplicateResultIds = new Set<string>();
  for (const [id, occurrences] of resultOccurrences) {
    if (occurrences.length > 1) {
      duplicateResultIds.add(id);
      anomalies.push({
        kind: "duplicate-tool-result-id",
        taskId,
        callId: id,
        messageId: occurrences[0].messageId,
        detail: `resultId "${id}" appears in ${occurrences.length} tool messages. ` +
          `Correlation blocked to avoid arbitrary association.`,
      });
    }
  }

  // ------------------------------------------------------------------
  // Step 5 — Build ToolCallRecord[] by correlating calls with results.
  //
  // Duplicate-ID policy (comment for documentation):
  // When a callId appears in more than one assistant message, or a resultId
  // appears in more than one tool message, the correlation is ambiguous.
  // We adopt a conservative policy: keep every call entry in the records
  // (so callers can see all occurrences), but leave all result fields null
  // for the ambiguous id. An ObserveAnomaly is emitted (step 3/4 above).
  // This avoids silently attaching an arbitrary result to the wrong call.
  // ------------------------------------------------------------------
  const records: ToolCallRecord[] = callEntries.map((entry) => {
    // Ambiguous: blocked if either side has a duplicate.
    const callAmbiguous = duplicateCallIds.has(entry.callId);
    const resultAmbiguous = duplicateResultIds.has(entry.callId);
    const blocked = callAmbiguous || resultAmbiguous;

    if (blocked) {
      return {
        callId: entry.callId,
        name: entry.name,
        arguments: entry.arguments,
        turnIndex: entry.turnIndex,
        assistantMessageId: entry.assistantMessageId,
        resultMessageId: null,
        isError: null,
        permission: null,
        durationMs: null,
        isOutsideWorkspace: null,
      };
    }

    const results = resultOccurrences.get(entry.callId);
    if (!results || results.length === 0) {
      // Unmatched call — emit anomaly.
      anomalies.push({
        kind: "unmatched-tool-call",
        taskId,
        callId: entry.callId,
        messageId: entry.assistantMessageId,
        detail: `call "${entry.callId}" (tool: ${entry.name}) has no matching result message.`,
      });
      return {
        callId: entry.callId,
        name: entry.name,
        arguments: entry.arguments,
        turnIndex: entry.turnIndex,
        assistantMessageId: entry.assistantMessageId,
        resultMessageId: null,
        isError: null,
        permission: null,
        durationMs: null,
        isOutsideWorkspace: null,
      };
    }

    // Matched — exactly one result (duplicate case is already handled above).
    const result = results[0];
    return {
      callId: entry.callId,
      name: entry.name,
      arguments: entry.arguments,
      turnIndex: entry.turnIndex,
      assistantMessageId: entry.assistantMessageId,
      resultMessageId: result.messageId,
      isError: result.isError,
      permission: result.permission,
      durationMs: result.durationMs,
      isOutsideWorkspace: result.isOutsideWorkspace,
    };
  });

  // ------------------------------------------------------------------
  // Step 6 — Identify orphan results (resultIds with no matching call).
  // ------------------------------------------------------------------
  const allCallIds = new Set(callEntries.map((e) => e.callId));
  for (const [sigId, results] of resultOccurrences) {
    if (!allCallIds.has(sigId)) {
      // Orphan — one anomaly per tool message
      for (const r of results) {
        anomalies.push({
          kind: "orphan-tool-result",
          taskId,
          callId: sigId,
          messageId: r.messageId,
          detail: `result message "${r.messageId}" references id "${sigId}" which has no matching call.`,
        });
      }
    }
  }

  return { records, anomalies };
}

// ---------------------------------------------------------------------------
// Public serialization — safe projection that redacts arguments by default
// ---------------------------------------------------------------------------

export interface ToPublicOptions {
  /**
   * When true, include the raw arguments object in the output.
   * Default: false — arguments are replaced with "[REDACTED]".
   */
  includeRaw?: boolean;
}

/**
 * Produce a public-safe projection of a single ToolCallRecord.
 *
 * - Does not mutate the input record.
 * - Arguments are "[REDACTED]" unless includeRaw === true.
 * - Creates a new object; the caller can safely serialize or log it.
 */
export function toPublicToolCallRecord(
  record: ToolCallRecord,
  options: ToPublicOptions = {}
): PublicToolCallRecord {
  return {
    callId: record.callId,
    name: record.name,
    arguments: options.includeRaw === true ? record.arguments : "[REDACTED]",
    turnIndex: record.turnIndex,
    assistantMessageId: record.assistantMessageId,
    resultMessageId: record.resultMessageId,
    isError: record.isError,
    permission: record.permission,
    durationMs: record.durationMs,
    isOutsideWorkspace: record.isOutsideWorkspace,
  };
}

/**
 * Produce a public-safe projection for an array of ToolCallRecord entries.
 * Arguments are "[REDACTED]" unless includeRaw === true.
 * Input array and its elements are not mutated.
 */
export function toPublicToolCallRecords(
  records: readonly ToolCallRecord[],
  options: ToPublicOptions = {}
): PublicToolCallRecord[] {
  return records.map((r) => toPublicToolCallRecord(r, options));
}
