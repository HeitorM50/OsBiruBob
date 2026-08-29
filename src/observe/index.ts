/**
 * Observe — Hindsight
 *
 * Responsibility: transform a Session into stable, typed metrics (ObserveReport)
 * that detectors can consume.
 *
 * Allowed imports: src/domain/types.ts, src/parser/index.ts.
 * Forbidden imports: diagnose, prescribe, compare, CLI/UI.
 * Forbidden Node APIs: fs, path, process, os.
 * Forbidden network: fetch, XMLHttpRequest.
 */

import type { Message, AssistantMessageData, MessageMeta, TurnMetrics } from "../domain/types";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** AssistantMessageData whose _meta.spend is guaranteed to be present. */
interface AssistantMessageDataWithSpend extends AssistantMessageData {
  _meta: MessageMeta & Required<Pick<MessageMeta, "spend">>;
}

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

/**
 * Returns true only when both the envelope role AND data.role are "assistant"
 * and _meta.spend is present.
 *
 * Checking both roles guards against a malformed export where the envelope role
 * and the data role disagree — treating such a message as an assistant turn
 * would silently produce wrong metrics.
 */
function isAssistantWithSpend(msg: Message): msg is Message & { data: AssistantMessageDataWithSpend } {
  return (
    msg.role === "assistant" &&
    msg.data.role === "assistant" &&
    msg.data._meta.spend !== undefined
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract the chronological series of assistant turns from a task's messages.
 *
 * Rules:
 * - Only messages where both envelope role and data.role are "assistant" with
 *   _meta.spend present are included.
 * - Messages are sorted by `_meta.timestamp` (the only reliable ordering field).
 *   Original array position breaks ties deterministically.
 * - `index` is assigned after filtering and sorting (0-based over assistant turns).
 * - `contextDelta` = contextTokens[n] − contextTokens[n-1]; null on the first turn.
 * - `toolCallIds` = toolCalls[].id; empty array when absent.
 * - `stop` = true only when `data.stop === true`; task.status is never consulted.
 * - The input array is not mutated.
 */
export function extractTurnMetrics(messages: readonly Message[]): TurnMetrics[] {
  // Collect (message, originalIndex) pairs for candidates only.
  type Candidate = { msg: Message & { data: AssistantMessageDataWithSpend }; originalIndex: number };
  const candidates: Candidate[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (isAssistantWithSpend(msg)) {
      candidates.push({ msg, originalIndex: i });
    }
  }

  // Sort by timestamp; use originalIndex as deterministic tiebreaker.
  candidates.sort((a, b) => {
    const tsDiff = a.msg.data._meta.timestamp - b.msg.data._meta.timestamp;
    if (tsDiff !== 0) return tsDiff;
    return a.originalIndex - b.originalIndex;
  });

  const result: TurnMetrics[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const { data } = candidates[i].msg;
    const { spend } = data._meta; // narrowed — no !

    const prevSpend = i > 0 ? candidates[i - 1].msg.data._meta.spend : null;
    const contextDelta = prevSpend !== null ? spend.contextTokens - prevSpend.contextTokens : null;

    const toolCallIds = data.toolCalls?.map((tc) => tc.id) ?? []; // no cast needed
    const stop = data.stop === true;

    result.push({
      index: i,
      messageId: candidates[i].msg.id,
      timestamp: data._meta.timestamp,
      cost: spend.cost,
      contextTokens: spend.contextTokens,
      contextDelta,
      reasoningTokens: spend.reasoningTokens,
      toolCallIds,
      stop,
    });
  }

  return result;
}
