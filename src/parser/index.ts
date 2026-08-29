/**
 * Parser — Hindsight
 *
 * Responsibility: receive raw export content (string) and return a validated
 * Session or a ParseError. Treats input as untrusted.
 *
 * Allowed imports: src/domain/types.ts and zod only.
 * Forbidden imports: observe, diagnose, prescribe, compare, CLI/UI.
 * Forbidden Node APIs: fs, path, process, os.
 * Forbidden network: fetch, XMLHttpRequest.
 */

import { z } from "zod";
import type { Session, Turn } from "../domain/types";

// ---------------------------------------------------------------------------
// ParseResult / ParseError (public contract)
// ---------------------------------------------------------------------------

export interface ParseError {
  message: string;
  path?: string;
  received?: unknown;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: ParseError };

// ---------------------------------------------------------------------------
// Zod schemas — validated fields only; extra fields tolerated via .passthrough()
// ---------------------------------------------------------------------------

/**
 * MessageMeta — requires timestamp (the only reliable ordering field).
 * spend is optional and only present on assistant messages.
 * durationMs is optional and only present on tool messages.
 * Extra fields (e.g. _meta.mode) are passed through unchanged.
 */
const MessageMetaSchema = z
  .object({
    timestamp: z.number(),
    spend: z
      .object({
        cost: z.number(),
        contextTokens: z.number(),
        reasoningTokens: z.number(),
      })
      .optional(),
    durationMs: z.number().optional(),
  })
  .passthrough();

// We use a single schema for all roles and let the discriminated union fall
// out naturally from the role field. Role-specific optional fields are not
// required for parser correctness — the downstream observe module reads them.
const MessageDataSchema = z
  .object({
    role: z.enum(["system", "user", "assistant", "tool"]),
    content: z.string(),
    _meta: MessageMetaSchema,
    // user
    envContext: z.string().optional(),
    availableTools: z.array(z.string()).optional(),
    // assistant
    toolCalls: z
      .array(
        z
          .object({
            id: z.string(),
            name: z.string(),
            arguments: z.record(z.unknown()),
          })
          .passthrough()
      )
      .optional(),
    stop: z.literal(true).optional(),
    // tool
    toolUsage: z
      .object({
        signature: z
          .object({
            id: z.string(),
            name: z.string(),
            arguments: z.record(z.unknown()),
            isError: z.boolean(),
          })
          .passthrough(),
        permission: z.enum(["read", "edit", "execute", "todo"]),
        isOutsideWorkspace: z.boolean(),
        labels: z
          .object({
            displayName: z.string(),
            running: z.string(),
            success: z.string(),
            error: z.string(),
          })
          .optional(),
      })
      .optional(),
  })
  .passthrough();

const MessageSchema = z
  .object({
    id: z.string(),
    role: z.enum(["system", "user", "assistant", "tool"]),
    data: MessageDataSchema,
    createdAt: z.number().optional(),
  })
  .passthrough();

const BreakdownDetailSchema = z
  .object({
    roleDefinition: z.number(),
    staticSections: z.number(),
    skills: z.number(),
    baseRules: z.number(),
    projectRules: z.number(),
    customInstructions: z.number(),
    environment: z.number(),
    toolSystemPrompts: z.number(),
    toolDefinitions: z.number(),
    mcpToolDefinitions: z.number(),
  })
  .catchall(z.number());

const ContextBreakdownSchema = z
  .object({
    total: z.number(),
    reportedTotal: z.number(),
    breakdown: BreakdownDetailSchema,
    key: z.string(),
    loadedSkills: z.array(z.string()).optional(),
  })
  .passthrough();

const TaskCostsSchema = z.object({
  cost: z.number(),
  contextTokens: z.number(),
  contextWindowBreakdown: ContextBreakdownSchema,
});

const TaskEnvSchema = z
  .object({
    workspace: z.string(),
    workspaceName: z.string(),
    modeId: z.string(),
    staticEnvInfo: z
      .object({
        primaryWorkspace: z.string(),
        systemInfo: z
          .object({
            platform: z.string(),
            release: z.string(),
            arch: z.string(),
            shell: z.string(),
          })
          .passthrough(),
      })
      .passthrough(),
    task: z
      .array(z.object({ description: z.string(), state: z.string() }).passthrough())
      .optional(),
    language: z.string().optional(),
    isPlayground: z.boolean().optional(),
    costEffective: z.boolean().optional(),
    _meta: z.object({ commandSecurityModel: z.string() }).passthrough().optional(),
  })
  .passthrough();

const ApprovalConfigSchema = z
  .object({
    autoApprovalEnabled: z.boolean(),
    outsideWorkspaceAllowed: z.boolean(),
    allowed_permissions: z.array(z.enum(["read", "edit", "execute", "todo"])),
    editApprovalPreviewMode: z.string(),
    allowedExecutors: z
      .array(
        z
          .object({
            toolId: z.string(),
            approvedCommands: z.array(z.string()),
            deniedCommands: z.array(z.string()),
          })
          .passthrough()
      )
      .optional(),
    taskCommandApprovals: z
      .array(
        z
          .object({
            toolId: z.string(),
            approvedCommands: z.array(z.string()),
          })
          .passthrough()
      )
      .optional(),
    forbiddenApprovalGroups: z.array(z.string()).optional(),
    taskAllowedMcpTools: z.array(z.string()).optional(),
  })
  .passthrough();

const TaskMetaSchema = z
  .object({
    id: z.string(),
    workspace: z.string(),
    taskType: z.string(),
    title: z.string(),
    status: z.string(),
    firstMessage: z.string(),
    isPinned: z.boolean(),
    createdAt: z.number(),
    updatedAt: z.number(),
    costs: TaskCostsSchema,
    env: TaskEnvSchema,
    approvalConfig: ApprovalConfigSchema,
    parentId: z.string().nullable().optional(),
    version: z.null().optional(),
    gitSha: z.null().optional(),
    gitBranch: z.null().optional(),
    lastError: z.string().nullable().optional(),
    messageQueue: z.null().optional(),
  })
  .passthrough();

const TurnSchema = z.object({
  task: TaskMetaSchema,
  messages: z.array(MessageSchema),
});

/**
 * Root export schema.
 * .passthrough() on the root allows extra fields (e.g., "_metadata") without error.
 * Internal fields like messages[].data._meta are NOT removed — they live inside
 * nested objects that also use .passthrough().
 */
const SessionEnvelopeSchema = z
  .object({
    version: z.number(),
    exportedAt: z.number(),
    workspace: z.string(),
    tasks: z.array(TurnSchema),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// parseSession — public entry point
// ---------------------------------------------------------------------------

/**
 * Parse a Bob session export from its raw JSON string.
 *
 * @param content - Raw JSON string (not yet parsed). Caller is responsible for
 *   reading the file (fs in CLI, FileReader in the browser).
 * @returns ParseResult<Session> — ok:true with Session, or ok:false with a
 *   descriptive ParseError. Never throws.
 */
export function parseSession(content: string): ParseResult<Session> {
  // Step 1 — parse JSON (untrusted input: never eval, never inject)
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch (e) {
    return {
      ok: false,
      error: {
        message: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
        path: "<root>",
      },
    };
  }

  // Step 2 — validate envelope and required fields with Zod
  const result = SessionEnvelopeSchema.safeParse(raw);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const path = firstIssue?.path.join(".") ?? "<unknown>";
    // `received` exists only on invalid_type issues; use a type assertion to
    // extract it safely without crashing on other issue kinds.
    const received =
      firstIssue && "received" in firstIssue
        ? (firstIssue as { received?: unknown }).received
        : undefined;
    return {
      ok: false,
      error: {
        message: `Export validation failed at "${path}": ${firstIssue?.message ?? result.error.message}`,
        path,
        received,
      },
    };
  }

  const parsed = result.data;

  // Step 3 — cast to domain Session type (Zod output is structurally compatible)
  const session: Session = {
    version: parsed.version,
    exportedAt: parsed.exportedAt,
    workspace: parsed.workspace,
    tasks: parsed.tasks as unknown as Turn[],
  };

  return { ok: true, value: session };
}

// ---------------------------------------------------------------------------
// Helpers — exported for tests
// ---------------------------------------------------------------------------

/**
 * Summarise a parsed session without printing sensitive fields.
 * Used by the CLI and tests to validate parse results.
 */
export function summariseSession(session: Session): Array<{
  id: string;
  titlePreview: string;
  status: string;
  messageCount: number;
  isSubtask: boolean;
}> {
  return session.tasks.map((turn) => ({
    id: turn.task.id,
    // Truncate title — full title is the prompt (potentially sensitive)
    titlePreview: turn.task.title.slice(0, 60).replace(/\n/g, " "),
    status: turn.task.status,
    messageCount: turn.messages.length,
    isSubtask: turn.task.parentId != null,
  }));
}
