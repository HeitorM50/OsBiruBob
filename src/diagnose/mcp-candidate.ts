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

/**
 * Match observed external commands against a curated MCP catalogue.
 *
 * The unknown input is intentional: catalogue loading is an external boundary.
 * Missing or malformed data degrades to an unavailable metric and never throws.
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
    for (const entry of catalogInput) {
      const commands = matchingCommands(task.externalCommands, entry);
      const minHits = entry.minHits ?? 1;

      if (commands.length < minHits) {
        continue;
      }

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
        },
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
    (entry.docsUrl === undefined || isNonEmptyString(entry.docsUrl)) &&
    (entry.minHits === undefined ||
      (typeof entry.minHits === "number" &&
        Number.isInteger(entry.minHits) &&
        entry.minHits > 0))
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
