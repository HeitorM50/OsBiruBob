/**
 * Domain types — Hindsight
 *
 * Source of truth: docs/domain-model.md
 * These types mirror the domain model exactly. Do NOT add fields not used by
 * the pipeline. Do NOT import from parser, observe, diagnose, prescribe,
 * compare, or any UI module.
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** Epoch milliseconds — all timestamps in the export use this format (I-1). */
export type EpochMs = number;

// ---------------------------------------------------------------------------
// Model 4 — ContextBreakdown (declared first; referenced by TaskCosts)
// ---------------------------------------------------------------------------

export interface BreakdownDetail {
  roleDefinition: number;
  staticSections: number;
  skills: number;
  baseRules: number;
  projectRules: number;
  customInstructions: number;
  environment: number;
  toolSystemPrompts: number;
  toolDefinitions: number;
  mcpToolDefinitions: number;
}

export interface ContextBreakdown {
  /** Sum of all breakdown fields — fixed overhead only, no conversation. */
  total: number;
  /** Full context at end of task (overhead + conversation). */
  reportedTotal: number;
  breakdown: BreakdownDetail & Record<string, number>;
  key: string;
  loadedSkills?: string[];
}

// ---------------------------------------------------------------------------
// Model 2 — Turn (TaskMeta, TaskCosts, TaskEnv, ApprovalConfig)
// ---------------------------------------------------------------------------

export interface TaskCosts {
  /** Total cost in USD — preserve full precision (I-3). */
  cost: number;
  /** Context token count at task end — accumulated, not per-turn (I-2). */
  contextTokens: number;
  contextWindowBreakdown: ContextBreakdown;
}

export interface TaskEnv {
  workspace: string;
  workspaceName: string;
  /** Active mode id — changes when a custom mode is used (evidence for F4). */
  modeId: string;
  staticEnvInfo: {
    primaryWorkspace: string;
    systemInfo: {
      platform: string;
      release: string;
      arch: string;
      shell: string;
    };
  };
  task?: Array<{ description: string; state: string }>;
  language?: string;
  isPlayground?: boolean;
  costEffective?: boolean;
  _meta?: { commandSecurityModel: string };
}

export interface ApprovalConfig {
  autoApprovalEnabled: boolean;
  outsideWorkspaceAllowed: boolean;
  allowed_permissions: Array<"read" | "edit" | "execute" | "todo">;
  editApprovalPreviewMode: string;
  allowedExecutors?: Array<{
    toolId: string;
    approvedCommands: string[];
    deniedCommands: string[];
  }>;
  taskCommandApprovals?: Array<{
    toolId: string;
    approvedCommands: string[];
  }>;
  forbiddenApprovalGroups?: string[];
  taskAllowedMcpTools?: string[];
}

export interface TaskMeta {
  id: string;
  workspace: string;
  taskType: string;
  /** The full first-message prompt — truncate before display. */
  title: string;
  /** Always "active" even when done. Use stop:true on last assistant msg. */
  status: string;
  firstMessage: string;
  isPinned: boolean;
  createdAt: EpochMs;
  updatedAt: EpochMs;
  costs: TaskCosts;
  env: TaskEnv;
  approvalConfig: ApprovalConfig;
  /** Non-null = subtask. Exclude from session-level aggregations (I-5). */
  parentId?: string | null;
  version?: null;
  gitSha?: null;
  gitBranch?: null;
  lastError?: string | null;
  messageQueue?: null;
}

// ---------------------------------------------------------------------------
// Model 5 — ToolCall / ToolResult
// ---------------------------------------------------------------------------

/**
 * Known permission values from the export.
 * Open union: unknown future string values are preserved as-is and must not
 * cause the parser or observe module to fail (forward-compatibility policy).
 */
export type ToolPermission =
  | "read"
  | "edit"
  | "execute"
  | "todo"
  | (string & Record<never, never>); // forward-compatible open union

export interface ToolCall {
  /** Prefix "tooluse_…". Correlate with ToolUsage.signature.id (I-4). */
  id: string;
  name: string;
  /** Potentially sensitive — redact path/content before display. */
  arguments: Record<string, unknown>;
}

export interface ToolUsage {
  signature: {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
    /** true = tool failed. Basis for retry detector. */
    isError: boolean;
  };
  permission: ToolPermission;
  isOutsideWorkspace: boolean;
  labels?: {
    displayName: string;
    running: string;
    success: string;
    error: string;
  };
}

// ---------------------------------------------------------------------------
// Model 3 — Message
// ---------------------------------------------------------------------------

export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface MessageMeta {
  /** Use this for chronological ordering — createdAt on the envelope is useless. */
  timestamp: EpochMs;
  /** Only present on assistant messages. */
  spend?: {
    cost: number;
    /** Accumulated context at this turn — not an increment (I-2). */
    contextTokens: number;
    reasoningTokens: number;
  };
  /** Only present on tool messages. High value on trivial tool = human wait. */
  durationMs?: number;
}

interface MessageDataBase {
  id: string;
  role: MessageRole;
  content: string;
  _meta: MessageMeta;
}

export interface SystemMessageData extends MessageDataBase {
  role: "system";
}

export interface UserMessageData extends MessageDataBase {
  role: "user";
  /** Only on first user message. */
  envContext?: string;
  /** Only on first user message. Cross with toolCalls to find unused tools. */
  availableTools?: string[];
}

export interface AssistantMessageData extends MessageDataBase {
  role: "assistant";
  /** One assistant turn may contain multiple parallel calls (I-4). */
  toolCalls?: ToolCall[];
  /** true on the last assistant message of a completed task. */
  stop?: true;
}

export interface ToolMessageData extends MessageDataBase {
  role: "tool";
  toolUsage: ToolUsage;
}

export type MessageData =
  | SystemMessageData
  | UserMessageData
  | AssistantMessageData
  | ToolMessageData;

/**
 * Discriminated union — the envelope `role` locks `data` to its matching type.
 * TypeScript will reject `{ role: "assistant", data: { role: "user", ... } }`.
 */
export type Message =
  | { id: string; role: "system"; data: SystemMessageData; createdAt?: EpochMs }
  | { id: string; role: "user"; data: UserMessageData; createdAt?: EpochMs }
  | { id: string; role: "assistant"; data: AssistantMessageData; createdAt?: EpochMs }
  | { id: string; role: "tool"; data: ToolMessageData; createdAt?: EpochMs };

// ---------------------------------------------------------------------------
// Model 2 — Turn (full)
// ---------------------------------------------------------------------------

export interface Turn {
  task: TaskMeta;
  messages: Message[];
}

// ---------------------------------------------------------------------------
// Model 1 — Session
// ---------------------------------------------------------------------------

export interface Session {
  /** Must be 1 for this schema. Different value = unknown format. */
  version: number;
  exportedAt: EpochMs;
  workspace: string;
  tasks: Turn[];
}

// ---------------------------------------------------------------------------
// Model 6 — ObserveReport types
// ---------------------------------------------------------------------------

/**
 * Context window summary derived from `task.costs.contextWindowBreakdown`.
 *
 * - `fixedOverhead`      = contextWindowBreakdown.total   (denominator for %)
 * - `reportedTotal`      = contextWindowBreakdown.reportedTotal
 * - `conversationTokens` = max(reportedTotal − fixedOverhead, 0)
 * - `reportedTotalInconsistent` signals reportedTotal < fixedOverhead
 * - `breakdownPct`       = each breakdown field / fixedOverhead * 100
 *                          (all zeros when fixedOverhead === 0)
 * - `breakdownSumDelta`   = absolute difference between breakdown sum and total
 * - `breakdownSumConsistent` applies the documented Observe tolerance
 * - `maxContextWindow`   is external — never in the export; null when unknown
 * - `pressure`           = reportedTotal / maxContextWindow, or null
 */
export interface ContextSummary {
  fixedOverhead: number;
  reportedTotal: number;
  conversationTokens: number;
  reportedTotalInconsistent: boolean;
  breakdown: BreakdownDetail & Record<string, number>;
  breakdownPct: Record<keyof BreakdownDetail, number> & Record<string, number>;
  breakdownSumDelta: number;
  breakdownSumConsistent: boolean;
  loadedSkills: string[];

  maxContextWindow: number | null;
  pressure: number | null;
}
// Model 6 — ObserveReport (partial — TurnMetrics only; full type added in F2)
// ---------------------------------------------------------------------------

/** Metrics for one assistant turn. Part of ObserveReport.TaskReport.turns. */
export interface TurnMetrics {
  /** 0-based index over assistant messages only (not over messages[]). */
  index: number;
  messageId: string;
  timestamp: EpochMs;
  /** Spend cost for this turn — full precision, never rounded (I-3). */
  cost: number;
  /** Accumulated context tokens at this turn — not an increment (I-2). */
  contextTokens: number;
  /**
   * contextTokens[n] − contextTokens[n-1]. null on the first turn.
   * Do not sum contextTokens across turns (I-2).
   */
  contextDelta: number | null;
  reasoningTokens: number;
  /** IDs of all tool calls in this turn. Empty array when none. */
  toolCallIds: string[];
  /** true only when data.stop === true on the underlying message. */
  stop: boolean;
}

// ---------------------------------------------------------------------------
// Model 6 — ToolCallRecord
// ---------------------------------------------------------------------------

/**
 * A single tool-call invocation correlated with its result (if any).
 * Produced by extractToolCalls in src/observe/tool-calls.ts.
 *
 * - Fields from the result side are null when no matching result was found
 *   (unmatched call). null means "absent", never false or 0 (I-6).
 * - arguments is redactable — always replace with [REDACTED] in public output.
 * - Correlation is exclusively by ID (I-4). Never by position.
 */
export interface ToolCallRecord {
  callId: string;
  name: string;
  /** Potentially sensitive (paths, code, commands) — redact before display. */
  arguments: Record<string, unknown>;
  /** 0-based index over assistant messages (same numbering as TurnMetrics.index). */
  turnIndex: number;
  assistantMessageId: string;

  /** null when there is no matching result for this call. */
  resultMessageId: string | null;
  /** null when no result; never treated as false (absence ≠ success). */
  isError: boolean | null;
  /** Error result content; null for successful or unmatched calls. Redactable. */
  errorMessage: string | null;
  /** null when no result; preserves unknown future string values. */
  permission: ToolPermission | null;
  /** null when no result or result has no durationMs. */
  durationMs: number | null;
  /** null when no result. */
  isOutsideWorkspace: boolean | null;
}

// ---------------------------------------------------------------------------
// Model 6 — ObserveAnomaly
// ---------------------------------------------------------------------------

/**
 * Structural anomaly detected during observation — not a diagnostic finding.
 * Produced in src/observe/tool-calls.ts, collected into ObserveReport.
 *
 * Kinds:
 * - "unmatched-tool-call"    — assistant emitted a call with no matching result
 * - "orphan-tool-result"     — result message has no matching call anywhere
 * - "duplicate-tool-call-id" — same callId appears in >1 assistant toolCalls[]
 * - "duplicate-tool-result-id" — same resultId (signature.id) in >1 tool messages
 * - "unknown-field"          — unexpected field in the export (forward-compat)
 * - "version-mismatch"       — export version ≠ 1
 *
 * Never include arguments, message content, or absolute paths in `detail`.
 */
export interface ObserveAnomaly {
  kind:
    | "unmatched-tool-call"
    | "orphan-tool-result"
    | "duplicate-tool-call-id"
    | "duplicate-tool-result-id"
    | "unknown-field"
    | "version-mismatch"
    | (string & Record<never, never>); // forward-compatible
  taskId?: string;
  messageId?: string;
  callId?: string;
  fieldPath?: string;
  /** Human-readable detail — must NOT contain arguments, content, or paths. */
  detail: string;
}

// ---------------------------------------------------------------------------
// Model 6 — ObserveReport (full contract)
// ---------------------------------------------------------------------------

export interface ToolInventory {
  available: string[];
  used: string[];
  idle: string[];
  /** null when available is empty (no tools to compute a ratio). */
  idleRatio: number | null;
  toolDefinitionTokens: number;
  /** null when available is empty — labelled (estimate) in presentation. */
  estimatedTokensPerTool: number | null;
}

export interface ExternalCommandRecord {
  callId: string;
  turnIndex: number;
  /** Potentially sensitive command text — redact before display. */
  raw: string;
  /** Always true — marks raw as redactable. */
  rawRedactable: true;
  binaries: string[];
  isHttp: boolean;
  targetHost: string | null;
}

export interface HumanIntervention {
  messageId: string;
  afterTurnIndex: number;
  timestamp: EpochMs;
  /** Potentially sensitive message content — redact before display. */
  content: string;
}

export interface ApprovalSummary {
  autoApprovalEnabled: boolean;
  allowedPermissions: Array<"read" | "edit" | "execute" | "todo">;
  approvedCommands: string[];
}

export interface SessionTotals {
  taskCount: number;
  subtaskCount: number;
  cost: number;
  assistantTurns: number;
  toolCalls: number;
  erroredToolCalls: number;
  humanInterventions: number;
}

export interface TaskReport {
  taskId: string;
  parentId: string | null;
  isSubtask: boolean;
  title: string;
  modeId: string;
  createdAt: EpochMs;
  updatedAt: EpochMs;
  durationMs: number;
  completed: boolean;
  cost: number;
  contextTokens: number;
  context: ContextSummary;
  turns: TurnMetrics[];
  toolCalls: ToolCallRecord[];
  /** null when availableTools is absent from the first user message. */
  toolInventory: ToolInventory | null;
  externalCommands: ExternalCommandRecord[];
  humanInterventions: HumanIntervention[];
  approval: ApprovalSummary;
}

export interface ObserveReport {
  sessionId: string;
  exportedAt: EpochMs;
  workspace: string;
  tasks: TaskReport[];
  totals: SessionTotals;
  unavailableMetrics: string[];
  anomalies: ObserveAnomaly[];
}

// ---------------------------------------------------------------------------
// Model 7 — Finding
// ---------------------------------------------------------------------------

export type FindingKind =
  | "redundant-read"
  | "retry-after-error"
  | "human-intervention"
  | "project-rules-absent"
  | "unused-tool"
  | "skill-overhead"
  | "unmatched-tool-call"
  | "orphan-tool-result"
  | (string & Record<never, never>); // open for extension

export type ConfidenceLevel = "high" | "medium" | "low";

export interface FindingEvidence {
  type: "message" | "breakdown" | "cross-reference" | "command";
  /** Whether this evidence can expose user-controlled or private data. */
  redactable: boolean;
  messageIds?: string[];
  toolCallIds?: string[];
  turnIndices?: number[];
  fieldPath?: string;
  breakdownField?: keyof BreakdownDetail;
  breakdownValue?: number;
  unusedTools?: string[];
  externalCommands?: string[];
  rawValue?: unknown;
}

export interface Finding {
  id: string;
  sessionId: string;
  taskId: string;
  kind: FindingKind;
  detectedAt: EpochMs;
  evidence: FindingEvidence;
  confidence: ConfidenceLevel;
  /** Detector-specific measured values. Never rounded in the domain. */
  metric: Record<string, unknown>;
  /** Prescription kind that can address this finding; no prescription is created here. */
  prescriptionHint: PrescriptionKind;
  prescription?: string;
  description?: string;
  /** Estimated token impact — no rounding (I-3). */
  tokenImpact?: number;
  /** Estimated cost impact — no rounding (I-3). */
  costImpact?: number;
}

// ---------------------------------------------------------------------------
// Model 7 — Prescription
// ---------------------------------------------------------------------------

export type PrescriptionKind =
  | "agents-md-section"
  | "agents-md-file"
  | "disable-tool"
  | "disable-skill"
  | "custom-mode"
  | (string & Record<never, never>);

export type PrescriptionStatus = "pending" | "applied" | "rejected" | "superseded";

export interface Prescription {
  id: string;
  sessionId: string;
  taskId: string;
  /** At least one Finding.id required — a Prescription without origin is not traceable. */
  findingIds: string[];
  kind: PrescriptionKind;
  status: PrescriptionStatus;
  createdAt: EpochMs;
  content?: string;
  targetFile?: string;
  appliedAt?: EpochMs;
  /** Estimate only — no rounding (I-3). */
  estimatedTokenSaving?: number;
  estimatedCostSaving?: number;
  rationale?: string;
}

// ---------------------------------------------------------------------------
// Model 8 — Comparison
// ---------------------------------------------------------------------------

export interface ComparisonMetrics {
  costA: number;
  costB: number;
  /** Negative = improvement. */
  costDelta: number;

  contextTokensA: number;
  contextTokensB: number;
  contextTokensDelta: number;

  fixedOverheadA: number;
  fixedOverheadB: number;
  fixedOverheadDelta: number;

  assistantTurnsA: number;
  assistantTurnsB: number;
  assistantTurnsDelta: number;

  humanInterventionsA: number;
  humanInterventionsB: number;
  humanInterventionsDelta: number;

  buildFailuresA: number;
  buildFailuresB: number;
  buildFailuresDelta: number;

  durationMsA?: number;
  durationMsB?: number;
  durationMsDelta?: number;

  projectRulesTokensA?: number;
  projectRulesTokensB?: number;

  breakdownA?: BreakdownDetail;
  breakdownB?: BreakdownDetail;
}

export interface Comparison {
  id: string;
  sessionIdA: string;
  sessionIdB: string;
  taskIdA: string;
  taskIdB: string;
  createdAt: EpochMs;
  metrics: ComparisonMetrics;
  /** Only true when all benchmark/METRICS.md protocol rules are satisfied. */
  valid: boolean;
  prescriptionIds?: string[];
  notes?: string;
  invalidReason?: string;
}
