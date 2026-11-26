/**
 * F4 — MCP enablement prescriptions.
 *
 * Converts mcp-candidate findings into actionable, honest enable-mcp
 * prescriptions containing documentation links, IBM Bob MCP settings snippets
 * (.bob/mcp.json), installation steps, and the fixed token-overhead trade-off.
 * Pure, browser-safe, deterministic, no I/O, no rounding.
 */

import type { Finding, Prescription } from "../domain/types";
import { prescriptionId } from "./determinism";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

const BOB_MCP_STEPS: readonly string[] = [
  "Open IBM Bob → Settings → MCP → Edit Project MCP (.bob/mcp.json) or Edit Global MCP (~/.bob/settings/mcp.json).",
  "Merge the mcpServers JSON snippet below and replace any <PLACEHOLDER> environment values.",
  "If you use a custom mode in .bob/custom_modes.yaml, make sure '- mcp' is listed under groups: so the mode can invoke MCP tools.",
  "Start a new conversation in Bob and verify breakdown.mcpToolDefinitions in the next session export.",
];

/**
 * Generate deterministic enable-mcp prescriptions from mcp-candidate findings.
 *
 * One prescription per unique (sessionId, taskId, catalogEntryId) tuple.
 * Prescriptions without at least one findingId are never emitted.
 *
 * Catalog fields (replaces, rationale, docsUrl, installSnippet,
 * estimatedToolTokens) are trusted input — never derived from user-controlled
 * command text or arguments.
 */
export function prescribeMcpEnablement(findings: readonly Finding[]): Prescription[] {
  type Key = string;

  // Group mcp-candidate findings by (sessionId, taskId, catalogEntryId)
  const groups = new Map<Key, Finding[]>();

  for (const f of findings) {
    if (f.kind !== "mcp-candidate") continue;
    const entryId = f.evidence.catalogEntryId;
    if (!isNonEmptyString(entryId)) continue;
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

    // Sort deterministically so `first` is order-independent.
    unique.sort((a, b) => a.id.localeCompare(b.id));

    const first = unique[0];
    const findingIds = unique.map((f) => f.id);
    const serverLabel = isNonEmptyString(first.metric.serverLabel)
      ? first.metric.serverLabel
      : "MCP Server";

    const replaces = isNonEmptyString(first.evidence.replaces)
      ? first.evidence.replaces
      : undefined;

    const baseRationale = isNonEmptyString(first.evidence.rationale)
      ? first.evidence.rationale
      : "Shell commands return unstructured text that requires in-context interpretation, while MCP tools return structured data.";

    const rawDocsUrl =
      first.evidence.docsUrl !== undefined
        ? first.evidence.docsUrl
        : first.metric.docsUrl;
    const docsUrl: string | null = isNonEmptyString(rawDocsUrl) ? rawDocsUrl : null;

    const installSnippet = isNonEmptyString(first.evidence.installSnippet)
      ? first.evidence.installSnippet
      : undefined;

    const rawEstimatedTokens =
      first.evidence.estimatedToolTokens !== undefined
        ? first.evidence.estimatedToolTokens
        : first.metric.estimatedToolTokens;
    const estimatedTokenCost = isFinitePositive(rawEstimatedTokens)
      ? rawEstimatedTokens
      : undefined;

    const estimationBasis =
      estimatedTokenCost !== undefined
        ? `Estimated fixed mcpToolDefinitions overhead (~${estimatedTokenCost} tokens/turn) added by ${serverLabel}; actual token cost depends on the installed server version and enabled tools.`
        : undefined;

    const sections: string[] = [serverLabel];
    if (replaces) {
      sections.push(`Replaces: ${replaces}`);
    }
    sections.push(
      docsUrl !== null
        ? `Docs: ${docsUrl}`
        : "Docs: unavailable (no verified documentation URL in catalogue)."
    );
    sections.push(
      estimatedTokenCost !== undefined
        ? `Token overhead trade-off (estimate): adds ~${estimatedTokenCost} tokens/turn to breakdown.mcpToolDefinitions. Enabling an MCP server increases fixed tool-definition overhead and trades off against tool-reduction recommendations — keep it enabled only when repeated shell calls justify the fixed schema cost.`
        : "Token overhead trade-off: enabling an MCP server adds fixed mcpToolDefinitions tokens on every turn (not estimated in catalogue) and trades off against tool-reduction recommendations."
    );
    sections.push(
      "How to enable in IBM Bob (.bob/mcp.json):\n" +
        BOB_MCP_STEPS.map((step, index) => `${index + 1}. ${step}`).join("\n")
    );
    if (installSnippet) {
      sections.push(`Bob MCP settings snippet (.bob/mcp.json):\n${installSnippet}`);
    }

    const tradeoffNote =
      estimatedTokenCost !== undefined
        ? ` Trade-off: adds an estimated ~${estimatedTokenCost} tokens/turn to breakdown.mcpToolDefinitions, offsetting part of any tool-reduction savings.`
        : " Trade-off: adds fixed mcpToolDefinitions overhead on every turn, offsetting part of any tool-reduction savings.";

    result.push({
      id: prescriptionId("enable-mcp", first.sessionId, first.taskId, findingIds),
      sessionId: first.sessionId,
      taskId: first.taskId,
      findingIds,
      kind: "enable-mcp",
      status: "pending",
      createdAt: first.detectedAt,
      targetFile: ".bob/mcp.json",
      content: sections.join("\n\n"),
      docsUrl,
      ...(installSnippet === undefined ? {} : { installSnippet }),
      ...(estimatedTokenCost === undefined
        ? {}
        : {
            estimatedTokenCost,
            isEstimate: true,
            estimationBasis,
          }),
      steps: [...BOB_MCP_STEPS],
      rationale: `${baseRationale}${tradeoffNote}`,
    });
  }

  return result;
}
