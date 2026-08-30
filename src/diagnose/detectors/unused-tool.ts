/**
 * Detector: unused-tool
 *
 * Identifies tools that were loaded into the context window but never invoked
 * by the assistant. Operates purely over ObserveReport — no I/O, no side effects.
 *
 * Produces one Finding per task where idle.length > 0.
 * tokenImpact is an ESTIMATE (I-6): per-tool tokens are not individually measured.
 */

import type {
  Finding,
  ObserveReport,
  ToolCatalogEntry,
} from "../../domain/types";

/** Stable prefix for finding ids produced by this detector. */
const DETECTOR_ID_PREFIX = "unused-tool";

/**
 * Generate a deterministic finding id from session, task, and detector.
 * Not a UUID — keeps output deterministic for tests.
 */
function makeFindingId(sessionId: string, taskId: string): string {
  return `${DETECTOR_ID_PREFIX}:${sessionId}:${taskId}`;
}

/**
 * Detect unused tools for all tasks in the ObserveReport.
 *
 * Trigger: toolInventory is present AND available.length > 0 AND idle.length > 0.
 * If toolInventory is absent/null, emit nothing — absence is not zero (I-6).
 */
export function detectUnusedTools(
  report: ObserveReport,
  catalog: readonly ToolCatalogEntry[] = []
): Finding[] {
  const findings: Finding[] = [];
  const catalogByName = new Map(catalog.map((entry) => [entry.name, entry]));

  for (const task of report.tasks) {
    const inv = task.toolInventory;

    // Guard: inventory must be present and have at least one available tool
    // and at least one idle tool.
    if (!inv || inv.available.length === 0 || inv.idle.length === 0) {
      continue;
    }

    const idleRatio = inv.idle.length / inv.available.length;
    const idleTools = inv.idle.map((name) => {
      const entry = catalogByName.get(name);
      return {
        name,
        group: entry?.group ?? "outros",
        purpose: entry?.purpose ?? null,
        essential: entry?.essential ?? false,
      };
    });
    const disableCandidates = idleTools.filter((tool) => !tool.essential);
    if (disableCandidates.length === 0) {
      continue;
    }

    // tokenImpact is an estimate: per-tool token counts are not individually
    // measured in the export.  The export only provides an aggregate for all
    // tool definitions.  Label the value as estimated (I-6).
    const tokenImpact =
      inv.estimatedTokensPerTool !== null
        ? disableCandidates.length * inv.estimatedTokensPerTool
        : null;

    const finding: Finding = {
      id: makeFindingId(report.sessionId, task.taskId),
      sessionId: report.sessionId,
      taskId: task.taskId,
      kind: "unused-tool",
      detectedAt: report.exportedAt,
      confidence: "high",
      prescriptionHint: "disable-tool",
      description:
        "Some available tools were unused in this task. Potential token savings " +
        "are estimates because individual per-tool costs are not measured.",
      tokenImpact: tokenImpact !== null ? tokenImpact : undefined,
      metric: {
        idleRatio,
        availableCount: inv.available.length,
        usedCount: inv.used.length,
        idleCount: inv.idle.length,
        disableCandidateCount: disableCandidates.length,
        idleTools,
        tokenImpactEstimate: tokenImpact,
        tokenImpactIsEstimate: true,
      },
      evidence: {
        type: "breakdown",
        redactable: false,
        unusedTools: disableCandidates.map((tool) => tool.name),
        rawValue: {
          idleRatio,
          availableCount: inv.available.length,
          usedCount: inv.used.length,
          idleCount: inv.idle.length,
          disableCandidateCount: disableCandidates.length,
          idleTools,
          tokenImpactEstimate: tokenImpact,
          tokenImpactIsEstimate: true,
        },
      },
    };

    findings.push(finding);
  }

  return findings;
}
