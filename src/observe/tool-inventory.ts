/**
 * Tool-inventory extraction — Hindsight
 *
 * Responsibility: derive ToolInventory from the first user message's
 * availableTools list and the set of tool names actually called. Emits
 * ObserveAnomaly entries for tools called but not listed in availableTools.
 *
 * Allowed imports: src/domain/types.ts only.
 * Forbidden imports: diagnose, prescribe, compare, CLI/UI, parser.
 * Forbidden Node APIs: fs, path, process, os.
 * Forbidden network: fetch, XMLHttpRequest.
 */

import type {
  Message,
  ToolCallRecord,
  ToolInventory,
  ObserveAnomaly,
} from "../domain/types";

// ---------------------------------------------------------------------------
// Public contract
// ---------------------------------------------------------------------------

export interface ToolInventoryExtraction {
  /**
   * null when the first user message does not contain an availableTools field.
   * When null, callers must add the metric path to unavailableMetrics.
   */
  inventory: ToolInventory | null;
  anomalies: ObserveAnomaly[];
}

// ---------------------------------------------------------------------------
// extractToolInventory
// ---------------------------------------------------------------------------

/**
 * Derive ToolInventory for one task.
 *
 * Rules:
 * - Read availableTools from the FIRST user message only.
 * - Field absent  → inventory: null + no used-tool-not-available anomaly.
 * - Field present, possibly empty → inventory with computed fields.
 * - Deduplicate available names, preserving first occurrence.
 * - used = tools called that are also in available (deduplicated).
 * - idle = available − used.
 * - idleRatio = idle.length / available.length; null when available is empty.
 * - estimatedTokensPerTool = toolDefinitionTokens / available.length; null when
 *   available is empty (no division by zero).
 * - Tool called but absent from available → ObserveAnomaly "used-tool-not-available"
 *   (one per distinct tool name, first callId).
 * - Input arrays are not mutated.
 *
 * @param taskId               - For anomaly traceability.
 * @param messages             - All messages for this task.
 * @param toolCallRecords      - Correlated tool-call records for this task.
 * @param toolDefinitionTokens - From contextWindowBreakdown.breakdown.toolDefinitions.
 */
export function extractToolInventory(
  taskId: string,
  messages: readonly Message[],
  toolCallRecords: readonly ToolCallRecord[],
  toolDefinitionTokens: number
): ToolInventoryExtraction {
  const anomalies: ObserveAnomaly[] = [];

  // Step 1 — locate the first user message.
  let availableToolsField: string[] | undefined;
  for (const msg of messages) {
    if (msg.role === "user" && msg.data.role === "user") {
      availableToolsField = msg.data.availableTools;
      break;
    }
  }

  // Field absent → null inventory (absence ≠ zero).
  if (availableToolsField === undefined) {
    return { inventory: null, anomalies };
  }

  // Step 2 — deduplicate available names (first occurrence preserved).
  const seenAvailable = new Set<string>();
  const available: string[] = [];
  for (const name of availableToolsField) {
    if (!seenAvailable.has(name)) {
      seenAvailable.add(name);
      available.push(name);
    }
  }

  // Step 3 — compute used (only tools that are also in available).
  const availableSet = new Set(available);
  const usedSet = new Set<string>();
  // Track first callId per out-of-inventory tool for anomaly reporting.
  const firstCallId = new Map<string, string>();

  for (const rec of toolCallRecords) {
    if (availableSet.has(rec.name)) {
      usedSet.add(rec.name);
    } else {
      // Tool called but not listed — emit anomaly (once per tool name).
      if (!firstCallId.has(rec.name)) {
        firstCallId.set(rec.name, rec.callId);
        anomalies.push({
          kind: "used-tool-not-available",
          taskId,
          callId: rec.callId,
          detail: `tool "${rec.name}" was called but is not listed in availableTools`,
        });
      }
    }
  }

  const used = Array.from(usedSet);
  const idle = available.filter((t) => !usedSet.has(t));

  const idleRatio = available.length > 0 ? idle.length / available.length : null;
  const estimatedTokensPerTool =
    available.length > 0 ? toolDefinitionTokens / available.length : null;

  return {
    inventory: {
      available,
      used,
      idle,
      idleRatio,
      toolDefinitionTokens,
      estimatedTokensPerTool,
    },
    anomalies,
  };
}
