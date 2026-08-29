/**
 * Observe — Hindsight
 *
 * Responsibility: transform a Session into stable, typed metrics (ObserveReport)
 * that detectors can consume.
 *
 * Allowed imports: src/domain/types.ts, src/parser/index.ts, src/observe/tool-calls.ts,
 *                  src/observe/tool-inventory.ts.
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
  ExternalCommandRecord,
  HumanIntervention,
  ApprovalSummary,
  SessionTotals,
  ObserveAnomaly,
  TaskReport,
  ObserveReport,
} from "../domain/types";
import { extractToolCalls } from "./tool-calls";
import { extractToolInventory } from "./tool-inventory";

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
// extractExternalCommands
// ---------------------------------------------------------------------------

/**
 * Extract ExternalCommandRecord for every execute_command tool call.
 *
 * Binary extraction rules:
 * - Split on shell operators: ; && || | newline.
 * - Honour single and double quotes when tokenising (simple scan).
 * - Skip env-var assignments like NODE_ENV=test at the start of a segment.
 * - Handle `env NAME=value command` — skip `env` and any following NAME=value tokens.
 * - Skip `sudo` and its option arguments (e.g. `sudo -u root`).
 * - Accept absolute paths; return only the basename.
 * - Deduplicate within one command (first occurrence preserved).
 * - isHttp: true when any binary is in HTTP_BINARIES.
 * - targetHost: URL.hostname of the first http(s):// URL; null otherwise.
 * - raw is always marked rawRedactable: true.
 * - Input records are not mutated.
 */
export function extractExternalCommands(toolCallRecords: readonly { name: string; arguments: Record<string, unknown>; callId: string; turnIndex: number }[]): ExternalCommandRecord[] {
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
      rawRedactable: true,
      binaries,
      isHttp,
      targetHost,
    });
  }

  return records;
}

// ---------------------------------------------------------------------------
// Binary parser helpers
// ---------------------------------------------------------------------------

/**
 * Split a shell command string into segments on ; && || | and newlines,
 * respecting quoted strings.
 */
function splitSegments(command: string): string[] {
  const segments: string[] = [];
  let current = "";
  let i = 0;
  while (i < command.length) {
    const ch = command[i];

    // Quoted string — consume until matching close quote (no backslash handling).
    if (ch === "'" || ch === '"') {
      const quote = ch;
      current += ch;
      i++;
      while (i < command.length && command[i] !== quote) {
        current += command[i];
        i++;
      }
      if (i < command.length) {
        current += command[i]; // closing quote
        i++;
      }
      continue;
    }

    // Check for two-char operators first: && ||
    if (i + 1 < command.length) {
      const two = command[i] + command[i + 1];
      if (two === "&&" || two === "||") {
        segments.push(current);
        current = "";
        i += 2;
        continue;
      }
    }

    // Single-char operators: ; | newline
    if (ch === ";" || ch === "|" || ch === "\n" || ch === "\r") {
      segments.push(current);
      current = "";
      i++;
      continue;
    }

    current += ch;
    i++;
  }
  segments.push(current);
  return segments;
}

/**
 * Tokenise a segment string by whitespace, respecting single and double quotes.
 * Returns unquoted token values.
 */
function tokenise(segment: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < segment.length) {
    // Skip whitespace.
    while (i < segment.length && /\s/.test(segment[i])) i++;
    if (i >= segment.length) break;

    const ch = segment[i];
    let token = "";

    if (ch === "'" || ch === '"') {
      const quote = ch;
      i++;
      while (i < segment.length && segment[i] !== quote) {
        token += segment[i];
        i++;
      }
      if (i < segment.length) i++; // skip closing quote
    } else {
      while (i < segment.length && !/\s/.test(segment[i])) {
        token += segment[i];
        i++;
      }
    }

    if (token.length > 0) tokens.push(token);
  }
  return tokens;
}

/** Return true when a token is an env-var assignment (NAME=value). */
function isEnvAssignment(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
}

/** Extract unique binary names from a shell command string. */
function extractBinaries(command: string): string[] {
  const segments = splitSegments(command);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const seg of segments) {
    const tokens = tokenise(seg);
    if (tokens.length === 0) continue;

    let idx = 0;

    // Skip leading env-var assignments (e.g. NODE_ENV=test FOO=bar).
    while (idx < tokens.length && isEnvAssignment(tokens[idx])) {
      idx++;
    }
    if (idx >= tokens.length) continue;

    // Handle `env NAME=value ... command`.
    if (tokens[idx] === "env") {
      idx++;
      while (idx < tokens.length && isEnvAssignment(tokens[idx])) {
        idx++;
      }
      if (idx >= tokens.length) continue;
    }

    // Handle `sudo [-u user] [-g group] [--flag] ... command`.
    if (tokens[idx] === "sudo") {
      idx++;
      while (idx < tokens.length) {
        const t = tokens[idx];
        if (t.startsWith("-")) {
          // Skip the flag.
          idx++;
          // If the flag takes an argument (single dash with one letter, or known
          // flags like -u, -g, -H, -E), skip the next token too.
          const flagArg = /^-[uUgHpCSbEeiklnPsVvw]$/.test(t);
          if (flagArg && idx < tokens.length && !tokens[idx].startsWith("-")) {
            idx++; // skip argument value
          }
        } else {
          break; // found the actual command
        }
      }
      if (idx >= tokens.length) continue;
    }

    const raw = tokens[idx];
    // basename (strip path prefix).
    const bin = raw.replace(/^.*\//, "");
    if (bin.length === 0 || bin.startsWith("-")) continue;

    if (!seen.has(bin)) {
      seen.add(bin);
      result.push(bin);
    }
  }

  return result;
}

/** Extract the first http(s) hostname from the command using URL.hostname. */
function extractTargetHost(command: string): string | null {
  const match = command.match(/https?:\/\/[^\s'"]+/);
  if (!match) return null;
  try {
    return new URL(match[0]).hostname;
  } catch {
    return null;
  }
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
  maxContextWindow: number | null,
  unavailableMetrics: string[]
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

  // 4. Tool call records — delegate to the focused tool-calls module (I-4).
  const { records: toolCallRecords, anomalies: tcAnomalies } = extractToolCalls(taskId, messages, turns);
  for (const a of tcAnomalies) anomalies.push(a);

  // 5. Tool inventory — delegate to focused module.
  const toolDefinitionTokens = task.costs.contextWindowBreakdown.breakdown.toolDefinitions;
  const { inventory: toolInventory, anomalies: invAnomalies } = extractToolInventory(
    taskId,
    messages,
    toolCallRecords,
    toolDefinitionTokens
  );
  for (const a of invAnomalies) anomalies.push(a);

  // When availableTools is absent, register the metric as unavailable.
  if (toolInventory === null) {
    unavailableMetrics.push(`tasks[${taskId}].toolInventory`);
  }

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
      const t = turns.find((t) => t.messageId === msg.id);
      if (t !== undefined) lastAssistantTurnIndex = t.index;
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
    toolInventory,
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
  // Mutable list — observeTask pushes per-task entries when toolInventory is null.
  const unavailableMetrics: string[] = [...ALWAYS_UNAVAILABLE];

  for (const turn of session.tasks) {
    try {
      tasks.push(observeTask(turn, anomalies, maxContextWindow, unavailableMetrics));
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
    unavailableMetrics,
    anomalies,
  };
}
