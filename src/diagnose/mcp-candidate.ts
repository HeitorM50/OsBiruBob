/** Detect shell commands that a known MCP server could replace. */

import type {
  DiagnoseResult,
  ExternalCommandRecord,
  Finding,
  McpCatalogEntry,
  ObserveReport,
} from "../domain/types";

export const MCP_CATALOG_ABSENT =
  "mcp-candidate: data/mcp-catalog.json absent";
export const MCP_CATALOG_INVALID =
  "mcp-candidate: data/mcp-catalog.json invalid";

/** Default minimum matching commands when an entry omits minHits. */
export const DEFAULT_MCP_MIN_HITS = 2;

/** Trivial shell utilities that never constitute meaningful MCP usage on their own. */
const TRIVIAL_BINARIES: ReadonlySet<string> = new Set([
  "sleep",
  "echo",
  "true",
]);

/**
 * Return true only when every observed binary in the command is a trivial
 * shell utility (`sleep`, `echo`, `true`). Compound commands that include a
 * real tool binary alongside `sleep` (e.g. `docker compose up -d && sleep 5`)
 * represent real tool usage and are counted normally.
 */
export function isTrivialOrNoisyCommand(command: ExternalCommandRecord): boolean {
  return (
    command.binaries.length > 0 &&
    command.binaries.every((binary) => TRIVIAL_BINARIES.has(binary))
  );
}

/**
 * Match observed external commands against a curated MCP catalogue.
 *
 * Rules:
 * - Subtasks (isSubtask || parentId !== null) are excluded (I-5).
 * - Trivial/noisy commands (sleep, echo, true, docker ... sleep N) are not
 *   counted as hits.
 * - The unknown input is intentional: catalogue loading is an external boundary.
 *   Missing or malformed data degrades to an unavailable metric and never throws.
 * - Trusted catalogue metadata (docsUrl, installSnippet, estimatedToolTokens,
 *   replaces, rationale) is forwarded into evidence for prescription rendering.
 */
export function detectMcpCandidates(
  report: ObserveReport,
  catalogInput: unknown
): DiagnoseResult {
  if (catalogInput === undefined || catalogInput === null) {
    return unavailable(MCP_CATALOG_ABSENT);
  }

  if (!isMcpCatalog(catalogInput)) {
    return unavailable(MCP_CATALOG_INVALID);
  }

  const findings: Finding[] = [];

  for (const task of report.tasks) {
    // I-5: subtasks are excluded from session-level diagnostics/prescriptions.
    if (task.isSubtask || task.parentId !== null) {
      continue;
    }

    for (const entry of catalogInput) {
      const commands = matchingCommands(task.externalCommands, entry);
      const minHits = entry.minHits ?? DEFAULT_MCP_MIN_HITS;

      if (commands.length < minHits) {
        continue;
      }

      const docsUrl = entry.docsUrl ?? null;
      const estimatedToolTokens = entry.estimatedToolTokens;
      const estimationBasis =
        estimatedToolTokens !== undefined
          ? `Estimated fixed mcpToolDefinitions overhead (~${estimatedToolTokens} tokens/turn) added when enabling ${entry.label}; actual overhead depends on server version and enabled tools.`
          : undefined;

      findings.push({
        id: `mcp-candidate:${report.sessionId}:${task.taskId}:${entry.id}`,
        sessionId: report.sessionId,
        taskId: task.taskId,
        kind: "mcp-candidate",
        detectedAt: report.exportedAt,
        evidence: {
          type: "command",
          redactable: true,
          // The description is built from the catalogue label and a count only;
          // no command text reaches it. The commands themselves stay redacted.
          descriptionSafe: true,
          toolCallIds: commands.map((command) => command.callId),
          turnIndices: unique(commands.map((command) => command.turnIndex)),
          externalCommands: commands.map((command) => command.raw),
          catalogEntryId: entry.id,
          replaces: entry.replaces,
          rationale: entry.rationale,
          docsUrl,
          ...(entry.installSnippet !== undefined
            ? { installSnippet: entry.installSnippet }
            : {}),
          ...(estimatedToolTokens !== undefined
            ? { estimatedToolTokens }
            : {}),
        },
        confidence: "medium",
        metric: {
          serverId: entry.id,
          serverLabel: entry.label,
          hitCount: commands.length,
          binaries: matchedBinaries(commands, entry),
          httpHitCount: commands.filter(
            (command) => entry.matchesHttp && command.isHttp
          ).length,
          targetHosts: unique(
            commands.flatMap((command) =>
              command.targetHost === null ? [] : [command.targetHost]
            )
          ),
          docsUrl,
          ...(estimatedToolTokens !== undefined
            ? { estimatedToolTokens }
            : {}),
        },
        ...(estimationBasis !== undefined ? { estimationBasis } : {}),
        prescriptionHint: "enable-mcp",
        description: `${entry.label} could replace repeated shell commands in this task.`,
      });
    }
  }

  return { findings, unavailableMetrics: [] };
}

function matchedBinaries(
  commands: readonly ExternalCommandRecord[],
  entry: McpCatalogEntry
): string[] {
  const entryBinaries = new Set(entry.binaries);
  return unique(
    commands.flatMap((command) =>
      command.binaries.filter((binary) => entryBinaries.has(binary))
    )
  );
}

function unavailable(reason: string): DiagnoseResult {
  return { findings: [], unavailableMetrics: [reason] };
}

function matchingCommands(
  commands: readonly ExternalCommandRecord[],
  entry: McpCatalogEntry
): ExternalCommandRecord[] {
  const entryBinaries = new Set(entry.binaries);
  const seenCallIds = new Set<string>();
  const matches: ExternalCommandRecord[] = [];

  for (const command of commands) {
    if (isTrivialOrNoisyCommand(command)) {
      continue;
    }

    const binaryMatch = command.binaries.some((binary) =>
      entryBinaries.has(binary)
    );
    const httpMatch = entry.matchesHttp && command.isHttp;

    if ((binaryMatch || httpMatch) && !seenCallIds.has(command.callId)) {
      seenCallIds.add(command.callId);
      matches.push(command);
    }
  }

  return matches;
}

function isMcpCatalog(input: unknown): input is McpCatalogEntry[] {
  if (!Array.isArray(input)) {
    return false;
  }

  const ids = new Set<string>();
  for (const entry of input) {
    if (!isMcpCatalogEntry(entry) || ids.has(entry.id)) {
      return false;
    }
    ids.add(entry.id);
  }

  return true;
}

function isMcpCatalogEntry(input: unknown): input is McpCatalogEntry {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return false;
  }

  const entry = input as Record<string, unknown>;
  return (
    isNonEmptyString(entry.id) &&
    isNonEmptyString(entry.label) &&
    isStringArray(entry.binaries) &&
    typeof entry.matchesHttp === "boolean" &&
    isNonEmptyString(entry.replaces) &&
    isNonEmptyString(entry.rationale) &&
    (entry.docsUrl === undefined ||
      entry.docsUrl === null ||
      isNonEmptyString(entry.docsUrl)) &&
    (entry.minHits === undefined ||
      (typeof entry.minHits === "number" &&
        Number.isInteger(entry.minHits) &&
        entry.minHits > 0)) &&
    (entry.installSnippet === undefined ||
      isNonEmptyString(entry.installSnippet)) &&
    (entry.estimatedToolTokens === undefined ||
      (typeof entry.estimatedToolTokens === "number" &&
        Number.isFinite(entry.estimatedToolTokens) &&
        entry.estimatedToolTokens > 0))
  );
}

function isNonEmptyString(input: unknown): input is string {
  return typeof input === "string" && input.length > 0;
}

function isStringArray(input: unknown): input is string[] {
  return Array.isArray(input) && input.every(isNonEmptyString);
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
