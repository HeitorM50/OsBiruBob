/**
 * F4 — MCP enablement prescriptions.
 *
 * Converts mcp-candidate findings into enable-mcp prescriptions.
 * Pure, browser-safe, deterministic, no I/O.
 */

import type { Finding, Prescription } from "../domain/types";
import { prescriptionId } from "./determinism";

/**
 * Generate deterministic enable-mcp prescriptions from mcp-candidate findings.
 *
 * One prescription per unique (sessionId, taskId, catalogEntryId) tuple.
 * Prescriptions without at least one findingId are never emitted.
 *
 * Catalog fields (replaces, rationale) are trusted input — they are not
 * derived from user-controlled data.
 */
export function prescribeMcpEnablement(findings: readonly Finding[]): Prescription[] {
  type Key = string;

  // Group mcp-candidate findings by (sessionId, taskId, catalogEntryId)
  const groups = new Map<Key, Finding[]>();

  for (const f of findings) {
    if (f.kind !== "mcp-candidate") continue;
    const entryId = f.evidence.catalogEntryId;
    if (typeof entryId !== "string" || entryId.length === 0) continue;
    const key = `${f.sessionId}\u001f${f.taskId}\u001f${entryId}`;
    const group = groups.get(key);
    if (group) group.push(f);
    else groups.set(key, [f]);
  }

  const result: Prescription[] = [];

  for (const [, group] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    // Deduplicate by id within group
    const seen = new Set<string>();
    const unique: Finding[] = [];
    for (const f of group) {
      if (!seen.has(f.id)) {
        seen.add(f.id);
        unique.push(f);
      }
    }

    if (unique.length === 0) continue;

    const first = unique[0];
    const findingIds = unique.map((f) => f.id).sort((a, b) => a.localeCompare(b));
    const serverLabel =
      typeof first.metric.serverLabel === "string"
        ? first.metric.serverLabel
        : "MCP Server";

    result.push({
      id: prescriptionId("enable-mcp", first.sessionId, first.taskId, findingIds),
      sessionId: first.sessionId,
      taskId: first.taskId,
      findingIds,
      kind: "enable-mcp",
      status: "pending",
      createdAt: first.detectedAt,
      content: serverLabel,
      rationale:
        typeof first.evidence.rationale === "string"
          ? first.evidence.rationale
          : "Shell commands return unstructured text that requires in-context interpretation, while MCP tools return structured data.",
    });
  }

  return result;
}
