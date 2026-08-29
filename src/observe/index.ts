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

import type {
  Session,
  Turn,
  Message,
  AssistantMessageData,
  MessageMeta,
  TurnMetrics,
  ContextBreakdown,
  BreakdownDetail,
  ContextSummary,
  ToolCallRecord,
  ToolInventory,
  ToolPermission,
  ExternalCommandRecord,
  HumanIntervention,
  ApprovalSummary,
  SessionTotals,
  ObserveAnomaly,
  TaskReport,
  ObserveReport,
} from "../domain/types";

// ---------------------------------------------------------------------------
// Tolerance for sum(breakdown) vs total validation
// ---------------------------------------------------------------------------
/**
 * Maximum absolute difference between sum(breakdown fields) and total that is
 * treated as acceptable rounding. The real export rounds individual fields to
 * integers; across 10 fields the accumulated rounding error is at most ±10.
 * We use 10 as the tolerance — it is explicitly documented and never hides a
 * real data anomaly for normal exports.
 */
export const BREAKDOWN_SUM_TOLERANCE = 10;

// ---------------------------------------------------------------------------
// Metrics that v1 exports never provide — declared once, never zero-filled
// ---------------------------------------------------------------------------
const ALWAYS_UNAVAILABLE: string[] = [
  "inputTokens",
  "outputTokens",
  "cacheReadTokens",
  "cacheWriteTokens",
  "buildFailures",
];

// ---------------------------------------------------------------------------
// HTTP binaries — commands using these suggest an MCP API recommendation
// ---------------------------------------------------------------------------
const HTTP_BINARIES = new Set(["curl", "wget", "http", "httpie", "fetch"]);

// ---------------------------------------------------------------------------
// buildContextSummary — public entry point
// ---------------------------------------------------------------------------

/**
 * Derive a `ContextSummary` from the raw `contextWindowBreakdown` stored on a
 * task's costs.
 *
 * @param bd               - The `contextWindowBreakdown` from `task.costs`.
 * @param maxContextWindow - Optional external parameter (e.g. 270000 for the
 *                           Claude model limit displayed in the Bob UI). When
 *                           null (default), `pressure` is null — the module
 *                           never assumes a default window size.
 *
 * @returns ContextSummary — never throws.
 *
 * Domain rules applied here:
 * - fixedOverhead  = bd.total  (fixed overhead; denominator for percentages)
 * - reportedTotal  = bd.reportedTotal  (total context at task end)
 * - conversationTokens = max(reportedTotal − fixedOverhead, 0)
 *   If reportedTotal < fixedOverhead, `reportedTotalInconsistent` is true;
 *   conversationTokens is clamped to 0, never negative.
 * - breakdownPct[field] = breakdown[field] / fixedOverhead * 100
 *   When fixedOverhead === 0 all percentages are 0 (safe division guard).
 * - breakdownSumDelta and breakdownSumConsistent expose sum validation using
 *   BREAKDOWN_SUM_TOLERANCE.
 * - Future numeric fields in breakdown are preserved in both `breakdown` and
 *   `breakdownPct` (forward-compatibility policy).
 * - No rounding anywhere — presentation layer is responsible.
 */
export function buildContextSummary(
  bd: ContextBreakdown,
  maxContextWindow: number | null = null
): ContextSummary {
  const fixedOverhead = bd.total;
  const reportedTotal = bd.reportedTotal;
  const conversationTokens = Math.max(reportedTotal - fixedOverhead, 0);
  const reportedTotalInconsistent = reportedTotal < fixedOverhead;

  // Build breakdown preserving future numeric fields (forward-compatibility).
  // Known fields come from BreakdownDetail; any extra numeric keys are kept.
  const breakdown: BreakdownDetail & Record<string, number> = {
    ...bd.breakdown,
  };

  // Compute percentages.  When fixedOverhead === 0 every field is 0 (safe).
  const breakdownPct: Record<string, number> = {};
  for (const key of Object.keys(breakdown)) {
    const value = breakdown[key];
    breakdownPct[key] = fixedOverhead > 0 ? (value / fixedOverhead) * 100 : 0;
  }

  const breakdownDelta = breakdownSumDelta(bd);
  const validMaxContextWindow =
    maxContextWindow !== null && Number.isFinite(maxContextWindow) && maxContextWindow > 0
      ? maxContextWindow
      : null;
  const pressure =
    validMaxContextWindow !== null ? reportedTotal / validMaxContextWindow : null;

  return {
    fixedOverhead,
    reportedTotal,
    conversationTokens,
    reportedTotalInconsistent,
    breakdown,
    breakdownPct: breakdownPct as Record<keyof BreakdownDetail, number> & Record<string, number>,
    breakdownSumDelta: breakdownDelta,
    breakdownSumConsistent: breakdownDelta <= BREAKDOWN_SUM_TOLERANCE,
    loadedSkills: bd.loadedSkills ?? [],
    maxContextWindow: validMaxContextWindow,
    pressure,
  };
}

// ---------------------------------------------------------------------------
// validateBreakdownSum — exported for tests and diagnostics
// ---------------------------------------------------------------------------

/**
 * Returns the absolute difference between sum(breakdown fields) and total.
 * Callers can compare this against BREAKDOWN_SUM_TOLERANCE.
 */
export function breakdownSumDelta(bd: ContextBreakdown): number {
  const sum = Object.values(bd.breakdown).reduce((acc, value) => acc + value, 0);
  return Math.abs(sum - bd.total);
}

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
// extractTurnMetrics — public
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

// ---------------------------------------------------------------------------
// extractToolCallRecords — correlate tool calls with their results
// ---------------------------------------------------------------------------

/**
 * Build a flat list of ToolCallRecord for one task, correlating each call with
 * its result message by ID (never by position — I-4).
 *
 * Orphaned calls (no result) get null result fields. Orphaned results
 * (result without a call) are reported as anomalies.
 */
function extractToolCallRecords(
  messages: readonly Message[],
  turns: TurnMetrics[],
  anomalies: ObserveAnomaly[],
  taskId: string
): ToolCallRecord[] {
  // Map: callId → { turnIndex, assistantMessageId }
  const callOrigin = new Map<string, { turnIndex: number; assistantMessageId: string }>();
  for (const turn of turns) {
    for (const callId of turn.toolCallIds) {
      callOrigin.set(callId, { turnIndex: turn.index, assistantMessageId: turn.messageId });
    }
  }

  // Map: callId → result message (tool message)
  const resultByCallId = new Map<
    string,
    {
      messageId: string;
      isError: boolean;
      permission: ToolPermission;
      durationMs: number | null;
      isOutsideWorkspace: boolean;
    }
  >();
  for (const msg of messages) {
    if (msg.role !== "tool" || msg.data.role !== "tool") continue;
    const tu = msg.data.toolUsage;
    if (!tu) continue;
    const callId = tu.signature.id;
    if (!callOrigin.has(callId)) {
      // Orphan result — result without a matching call
      anomalies.push({
        kind: "orphan-tool-result",
        taskId,
        messageId: msg.id,
        callId,
        detail: `Tool result for callId "${callId}" has no matching tool call`,
      });
      continue;
    }
    resultByCallId.set(callId, {
      messageId: msg.id,
      isError: tu.signature.isError,
      permission: tu.permission,
      durationMs: msg.data._meta.durationMs ?? null,
      isOutsideWorkspace: tu.isOutsideWorkspace,
    });
  }

  // Build records — one per call, in order of turns then call position
  const records: ToolCallRecord[] = [];
  for (const turn of turns) {
    // Get the assistant message to retrieve the call definitions
    const assistantMsg = messages.find((m) => m.id === turn.messageId);
    if (!assistantMsg || assistantMsg.role !== "assistant" || assistantMsg.data.role !== "assistant") continue;

    const toolCalls = assistantMsg.data.toolCalls ?? [];
    for (const tc of toolCalls) {
      const result = resultByCallId.get(tc.id);
      if (!result) {
        // Unmatched call — call without a result
        anomalies.push({
          kind: "unmatched-tool-call",
          taskId,
          messageId: turn.messageId,
          callId: tc.id,
          detail: `Tool call "${tc.name}" (id: ${tc.id}) has no matching result`,
        });
      }
      records.push({
        callId: tc.id,
        name: tc.name,
        arguments: tc.arguments,
        turnIndex: turn.index,
        assistantMessageId: turn.messageId,
        resultMessageId: result?.messageId ?? null,
        isError: result?.isError ?? null,
        permission: result?.permission ?? null,
        durationMs: result?.durationMs ?? null,
        isOutsideWorkspace: result?.isOutsideWorkspace ?? null,
      });
    }
  }

  return records;
}

// ---------------------------------------------------------------------------
// extractToolInventory
// ---------------------------------------------------------------------------

/**
 * Build ToolInventory from the first user message's `availableTools` list and
 * the set of tool names actually called in this task.
 */
function extractToolInventory(messages: readonly Message[], toolCallRecords: ToolCallRecord[]): ToolInventory {
  // available comes from the first user message
  let available: string[] = [];
  let toolDefinitionTokens = 0;
  for (const msg of messages) {
    if (msg.role === "user" && msg.data.role === "user") {
      available = msg.data.availableTools ?? [];
      break;
    }
  }

  // toolDefinitions token count from the contextWindowBreakdown is carried at
  // task level; here we look for it from the first tool message's breakdown.
  // Per domain-model: toolDefinitionTokens comes from breakdown.toolDefinitions.
  // We don't have access to breakdown here; pass 0 and let the caller fill it.
  // (filled by observeTask which has the task costs)

  const usedSet = new Set<string>(toolCallRecords.map((r) => r.name));
  const used = Array.from(usedSet);
  const idleSet = new Set(available.filter((t) => !usedSet.has(t)));
  const idle = Array.from(idleSet);

  const idleRatio = available.length > 0 ? idle.length / available.length : 0;
  const estimatedTokensPerTool =
    available.length > 0 ? toolDefinitionTokens / available.length : null;

  return {
    available,
    used,
    idle,
    idleRatio,
    toolDefinitionTokens,
    estimatedTokensPerTool,
  };
}

// ---------------------------------------------------------------------------
// extractExternalCommands
// ---------------------------------------------------------------------------

/**
 * Extract ExternalCommandRecord for every execute_command tool call.
 *
 * Binary extraction:
 * - Split the command string on shell operators (`;`, `&&`, `||`, `|`, `\n`)
 *   then take the first token of each segment as the binary name.
 * - Deduplicate binaries within the same command.
 * - isHttp: true when any binary is in HTTP_BINARIES.
 * - targetHost: extracted from the first http(s):// URL found, or null.
 */
function extractExternalCommands(toolCallRecords: ToolCallRecord[]): ExternalCommandRecord[] {
  const records: ExternalCommandRecord[] = [];

  for (const record of toolCallRecords) {
    if (record.name !== "execute_command") continue;
    const raw = typeof record.arguments["command"] === "string" ? record.arguments["command"] : "";

    const binaries = extractBinaries(raw);
    const isHttp = binaries.some((b) => HTTP_BINARIES.has(b));
    const targetHost = extractTargetHost(raw);

    records.push({
      callId: record.callId,
      turnIndex: record.turnIndex,
      raw,
      binaries,
      isHttp,
      targetHost,
    });
  }

  return records;
}

/** Extract unique binary names from a shell command string. */
function extractBinaries(command: string): string[] {
  // Split on common shell separators: ; && || | newlines (but not | inside strings)
  const segments = command.split(/;|&&|\|\||[\n\r]|\|/);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const seg of segments) {
    const trimmed = seg.trim();
    if (!trimmed) continue;
    // The binary is the first token — skip option flags (e.g. -H, --flag)
    const match = trimmed.match(/^([a-zA-Z0-9_./][a-zA-Z0-9_\-./]*)/);
    if (!match) continue;
    const raw = match[1];
    if (raw.startsWith("-")) continue;
    const bin = raw.replace(/^.*\//, ""); // strip path prefix (e.g. /usr/bin/docker → docker)
    if (bin && !seen.has(bin)) {
      seen.add(bin);
      result.push(bin);
    }
  }
  return result;
}

/** Extract the first http(s) host from a URL in the command, or null. */
function extractTargetHost(command: string): string | null {
  const match = command.match(/https?:\/\/([^/\s'"]+)/);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// extractApprovalSummary
// ---------------------------------------------------------------------------

function extractApprovalSummary(turn: Turn): ApprovalSummary {
  const ac = turn.task.approvalConfig;
  const allowedPermissions = ac.allowed_permissions;

  // Collect all approvedCommands from allowedExecutors and taskCommandApprovals
  const approvedCommands: string[] = [];
  for (const exec of ac.allowedExecutors ?? []) {
    approvedCommands.push(...exec.approvedCommands);
  }
  for (const tca of ac.taskCommandApprovals ?? []) {
    approvedCommands.push(...tca.approvedCommands);
  }

  return {
    autoApprovalEnabled: ac.autoApprovalEnabled,
    allowedPermissions,
    approvedCommands,
  };
}

// ---------------------------------------------------------------------------
// observeTask — produce a TaskReport for one Turn
// ---------------------------------------------------------------------------

/**
 * Observe a single Turn (task + messages) and produce a TaskReport.
 * Wrapped in try/catch so that a failure in one task does not crash the report.
 */
function observeTask(
  turn: Turn,
  anomalies: ObserveAnomaly[],
  maxContextWindow: number | null
): TaskReport {
  const task = turn.task;
  const messages = turn.messages;
  const taskId = task.id;

  // 1. Context summary
  const context = buildContextSummary(task.costs.contextWindowBreakdown, maxContextWindow);

  // 2. Turn metrics (assistant turns)
  const turns = extractTurnMetrics(messages);

  // 3. completed = stop:true on last assistant turn, never from task.status
  const completed = turns.length > 0 && turns[turns.length - 1].stop === true;

  // 4. Tool call records (with anomaly detection)
  const toolCallRecords = extractToolCallRecords(messages, turns, anomalies, taskId);

  // 5. Tool inventory (patch in toolDefinitionTokens from breakdown)
  const inventory = extractToolInventory(messages, toolCallRecords);
  const toolDefinitionTokens = task.costs.contextWindowBreakdown.breakdown.toolDefinitions;
  const patchedInventory: ToolInventory = {
    ...inventory,
    toolDefinitionTokens,
    estimatedTokensPerTool:
      inventory.available.length > 0 ? toolDefinitionTokens / inventory.available.length : null,
  };

  // 6. External commands
  const externalCommands = extractExternalCommands(toolCallRecords);

  // 7. Human interventions — every user message after the first
  const humanInterventions: HumanIntervention[] = [];
  let userMessagesSeen = 0;
  let lastAssistantTurnIndex = -1;
  for (const msg of messages.slice().sort((a, b) => {
    const ta = a.data._meta.timestamp;
    const tb = b.data._meta.timestamp;
    return ta - tb;
  })) {
    if (msg.role === "assistant" && msg.data.role === "assistant") {
      const turn = turns.find((t) => t.messageId === msg.id);
      if (turn !== undefined) lastAssistantTurnIndex = turn.index;
    } else if (msg.role === "user" && msg.data.role === "user") {
      userMessagesSeen++;
      if (userMessagesSeen > 1) {
        humanInterventions.push({
          messageId: msg.id,
          afterTurnIndex: lastAssistantTurnIndex,
          timestamp: msg.data._meta.timestamp,
          content: msg.data.content,
        });
      }
    }
  }

  // 8. Approval summary
  const approval = extractApprovalSummary(turn);

  return {
    taskId,
    parentId: task.parentId ?? null,
    isSubtask: task.parentId != null,
    title: task.title,
    modeId: task.env.modeId,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    durationMs: task.updatedAt - task.createdAt,
    completed,
    cost: task.costs.cost,
    contextTokens: task.costs.contextTokens,
    context,
    turns,
    toolCalls: toolCallRecords,
    toolInventory: patchedInventory,
    externalCommands,
    humanInterventions,
    approval,
  };
}

// ---------------------------------------------------------------------------
// observe — the main public entry point
// ---------------------------------------------------------------------------

/**
 * Transform a parsed Session into an ObserveReport.
 *
 * @param session          - Validated Session from parseSession().
 * @param maxContextWindow - Optional external context window size. When null,
 *                           pressure is null for all tasks.
 * @returns ObserveReport — never throws. Detector errors are isolated.
 *
 * Domain rules enforced:
 * - Subtasks (parentId !== null) appear in tasks[] but are excluded from totals (I-5).
 * - completed derived from stop:true only (never from task.status).
 * - unavailableMetrics always contains the v1 baseline list.
 * - No rounding anywhere.
 */
export function observe(
  session: Session,
  maxContextWindow: number | null = null
): ObserveReport {
  const anomalies: ObserveAnomaly[] = [];
  const tasks: TaskReport[] = [];

  for (const turn of session.tasks) {
    try {
      tasks.push(observeTask(turn, anomalies, maxContextWindow));
    } catch (err) {
      // Isolate detector failures — one broken task must not crash the report
      anomalies.push({
        kind: "unknown-field",
        taskId: turn.task.id,
        detail: `observeTask threw: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // SessionTotals — only root tasks (I-5)
  const rootTasks = tasks.filter((t) => !t.isSubtask);
  const subtaskCount = tasks.length - rootTasks.length;

  const totals: SessionTotals = {
    taskCount: rootTasks.length,
    subtaskCount,
    cost: rootTasks.reduce((acc, t) => acc + t.cost, 0),
    assistantTurns: rootTasks.reduce((acc, t) => acc + t.turns.length, 0),
    toolCalls: rootTasks.reduce((acc, t) => acc + t.toolCalls.length, 0),
    erroredToolCalls: rootTasks.reduce(
      (acc, t) => acc + t.toolCalls.filter((tc) => tc.isError === true).length,
      0
    ),
    humanInterventions: rootTasks.reduce(
      (acc, t) => acc + t.humanInterventions.length,
      0
    ),
  };

  return {
    sessionId: session.tasks[0]?.task.id ?? "unknown",
    exportedAt: session.exportedAt,
    workspace: session.workspace,
    tasks,
    totals,
    unavailableMetrics: [...ALWAYS_UNAVAILABLE],
    anomalies,
  };
}
