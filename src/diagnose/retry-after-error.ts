/**
 * Detect trial-and-error behaviour: a failed tool call followed in a later
 * turn by another call to the same tool (regardless of arguments).
 *
 * This detector reads only ObserveReport, has no side effects, and is
 * deterministic over the same input.
 */

import type { Finding, ObserveReport, ToolCallRecord } from "../domain/types";

/**
 * Group tool calls per task by tool name and look for retry chains:
 *   - At least one call where isError === true (exact boolean, NOT null)
 *   - Followed at a higher turnIndex by another call to the same tool
 *
 * One Finding is emitted per independent retry chain.
 * Failures without a later retry are silently omitted — unrecovered
 * errors are out of scope for this detector.
 */
export function detectRetryAfterError(report: ObserveReport): Finding[] {
  const findings: Finding[] = [];

  for (const task of report.tasks) {
    // Sort by turnIndex ascending (ObserveReport toolCalls are already ordered,
    // but we sort defensively to guarantee determinism).
    const sorted = [...task.toolCalls].sort((a, b) => a.turnIndex - b.turnIndex);

    // Group by tool name.
    const byName = new Map<string, ToolCallRecord[]>();
    for (const rec of sorted) {
      const list = byName.get(rec.name) ?? [];
      list.push(rec);
      byName.set(rec.name, list);
    }

    const taskFindings: Finding[] = [];
    for (const [toolName, calls] of byName) {
      taskFindings.push(...buildFindings(report, task.taskId, toolName, calls));
    }
    taskFindings.sort(
      (a, b) =>
        (a.evidence.turnIndices?.[0] ?? Number.POSITIVE_INFINITY) -
        (b.evidence.turnIndices?.[0] ?? Number.POSITIVE_INFINITY)
    );
    findings.push(...taskFindings);
  }

  return findings;
}

/**
 * Inspect a single tool's call sequence (ascending turnIndex) for a retry chain.
 *
 * A retry chain starts at a call where isError === true and ends at the first
 * subsequent successful call to the same tool, or at the end of the sequence
 * when every retry also fails. Calls without a result and calls in the same
 * turn are excluded from retry sequences.
 *
 * Failures without a later eligible retry are omitted.
 */
function buildFindings(
  report: ObserveReport,
  taskId: string,
  toolName: string,
  calls: ToolCallRecord[] // ascending turnIndex
): Finding[] {
  const findings: Finding[] = [];
  let cursor = 0;

  while (cursor < calls.length) {
    const firstErrorIdx = calls.findIndex(
      (call, index) => index >= cursor && call.isError === true
    );
    if (firstErrorIdx === -1) break;

    const errorCall = calls[firstErrorIdx];
    const chainCalls = [errorCall];
    let retryCall: ToolCallRecord | null = null;
    let lastAttemptTurn = errorCall.turnIndex;
    let nextCursor = calls.length;
    let successObserved = false;

    for (let index = firstErrorIdx + 1; index < calls.length; index++) {
      const call = calls[index];
      if (call.isError === null || call.turnIndex <= lastAttemptTurn) continue;

      retryCall ??= call;
      chainCalls.push(call);
      lastAttemptTurn = call.turnIndex;

      if (call.isError === false) {
        successObserved = true;
        nextCursor = index + 1;
        break;
      }
    }

    if (retryCall === null) break;

    findings.push(
      createFinding(
        report,
        taskId,
        toolName,
        errorCall,
        retryCall,
        chainCalls,
        successObserved
      )
    );
    cursor = nextCursor;
  }

  return findings;
}

function createFinding(
  report: ObserveReport,
  taskId: string,
  toolName: string,
  errorCall: ToolCallRecord,
  retryCall: ToolCallRecord,
  chainCalls: ToolCallRecord[],
  successObserved: boolean
): Finding {
  const attemptCount = chainCalls.length;

  // Collect call IDs and message IDs for the full chain evidence.
  const toolCallIds = chainCalls.map((c) => c.callId);
  const messageIds: string[] = [];
  for (const c of chainCalls) {
    messageIds.push(c.assistantMessageId);
    if (c.resultMessageId !== null) messageIds.push(c.resultMessageId);
  }

  // Deduplicate while preserving order (multiple parallel calls share messageId).
  const uniqueMessageIds = [...new Set(messageIds)];

  const id =
    `retry-after-error:${report.sessionId}:${taskId}:` +
    `${errorCall.callId}:${retryCall.callId}`;

  return {
    id,
    sessionId: report.sessionId,
    taskId,
    kind: "retry-after-error",
    detectedAt: report.exportedAt,
    confidence: "high",
    evidence: {
      type: "cross-reference",
      redactable: true,
      toolCallIds,
      messageIds: uniqueMessageIds,
      turnIndices: [errorCall.turnIndex, retryCall.turnIndex],
      rawValue: errorCall.errorMessage,
    },
    metric: {
      toolName,
      firstErrorTurn: errorCall.turnIndex,
      retryTurn: retryCall.turnIndex,
      attemptCount,
      successObserved,
    },
    prescriptionHint: "agents-md-section",
    description: `Tool "${toolName}" failed on turn ${errorCall.turnIndex} and was retried on turn ${retryCall.turnIndex} (${attemptCount} attempt${attemptCount === 1 ? "" : "s"} total).`,
  };
}
