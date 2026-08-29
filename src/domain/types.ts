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
  permission: "read" | "edit" | "execute" | "todo";
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

export interface Message {
  id: string;
  role: MessageRole;
  data: MessageData;
  /** Same value across all messages in the export — do NOT use for ordering. */
  createdAt?: EpochMs;
}

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

// ---------------------------------------------------------------------------
// Model 6 — Finding
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
  type: "message" | "breakdown" | "cross-reference";
  messageIds?: string[];
  toolCallIds?: string[];
  breakdownField?: keyof BreakdownDetail;
  breakdownValue?: number;
  unusedTools?: string[];
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
