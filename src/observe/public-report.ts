/**
 * Public report projection — Hindsight
 *
 * Responsibility: produce a safe, serialisable copy of an ObserveReport with
 * all sensitive fields replaced by "[REDACTED]". The original report is never
 * mutated.
 *
 * Sensitive fields covered:
 *   - workspace
 *   - task.title
 *   - toolCalls[].arguments
 *   - externalCommands[].raw
 *   - humanInterventions[].content
 *
 * Allowed imports: src/domain/types.ts only.
 * Forbidden imports: diagnose, prescribe, compare, CLI/UI, parser.
 * Forbidden Node APIs: fs, path, process, os.
 * Forbidden network: fetch, XMLHttpRequest.
 */

import type {
  ObserveReport,
  TaskReport,
  ToolCallRecord,
  ExternalCommandRecord,
  HumanIntervention,
  ToolInventory,
} from "../domain/types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** ExternalCommandRecord with raw replaced by "[REDACTED]". */
export type PublicExternalCommandRecord = Omit<ExternalCommandRecord, "raw"> & {
  raw: "[REDACTED]";
};

/** HumanIntervention with content replaced by "[REDACTED]". */
export type PublicHumanIntervention = Omit<HumanIntervention, "content"> & {
  content: "[REDACTED]";
};

/** ToolCallRecord with arguments replaced by "[REDACTED]". */
export type PublicToolCallRecord = Omit<ToolCallRecord, "arguments"> & {
  arguments: "[REDACTED]";
};

export type PublicTaskReport = Omit<
  TaskReport,
  "title" | "toolCalls" | "externalCommands" | "humanInterventions"
> & {
  title: "[REDACTED]";
  toolCalls: PublicToolCallRecord[];
  externalCommands: PublicExternalCommandRecord[];
  humanInterventions: PublicHumanIntervention[];
};

export type PublicObserveReport = Omit<ObserveReport, "workspace" | "tasks"> & {
  workspace: "[REDACTED]";
  tasks: PublicTaskReport[];
};

// ---------------------------------------------------------------------------
// toPublicReport
// ---------------------------------------------------------------------------

/**
 * Produce a public-safe projection of an ObserveReport.
 *
 * - Does not mutate the input report.
 * - Returns a new object suitable for JSON serialisation in --json mode.
 * - All sensitive fields are replaced with the literal "[REDACTED]".
 */
export function toPublicReport(report: ObserveReport): PublicObserveReport {
  return {
    ...report,
    workspace: "[REDACTED]",
    tasks: report.tasks.map(redactTaskReport),
  };
}

function redactTaskReport(task: TaskReport): PublicTaskReport {
  return {
    ...task,
    title: "[REDACTED]",
    toolCalls: task.toolCalls.map(redactToolCallRecord),
    externalCommands: task.externalCommands.map(redactExternalCommand),
    humanInterventions: task.humanInterventions.map(redactHumanIntervention),
  };
}

function redactToolCallRecord(rec: ToolCallRecord): PublicToolCallRecord {
  return { ...rec, arguments: "[REDACTED]" };
}

function redactExternalCommand(cmd: ExternalCommandRecord): PublicExternalCommandRecord {
  return { ...cmd, raw: "[REDACTED]" };
}

function redactHumanIntervention(hi: HumanIntervention): PublicHumanIntervention {
  return { ...hi, content: "[REDACTED]" };
}

// Re-export ToolInventory for convenience — callers can use it via this module.
export type { ToolInventory };
