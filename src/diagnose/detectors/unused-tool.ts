/**
 * Detector: unused-tool
 *
 * Identifies tools that were loaded into the context window but never invoked
 * by the assistant. Operates purely over ObserveReport — no I/O, no side effects.
 *
 * Rules:
 * - Subtasks (isSubtask || parentId !== null) are excluded (I-5).
 * - Search and targeted-edit tools (grep, glob, apply_diff) are always protected
 *   and never suggested as disable candidates.
 * - Unknown tools fall back to group "other" (never omitted, never Portuguese).
 * - IBM Bob disables tools by group (.bob/custom_modes.yaml), not individually.
 *   Idle tools inside an active/retained Bob group are excluded from disable
 *   candidates so recommendations never contradict custom_modes.yaml.
 * - tokenImpact is an ESTIMATE (I-6) computed strictly over disableable Bob
 *   groups, with an explicit estimationBasis and no rounding (I-3).
 */

import type {
  BobToolGroup,
  Finding,
  ObserveReport,
  ToolCatalogEntry,
} from "../../domain/types";

/** Stable prefix for finding ids produced by this detector. */
const DETECTOR_ID_PREFIX = "unused-tool";

/** Fallback group for tools not present in data/tool-catalog.json. */
export const UNKNOWN_TOOL_GROUP = "other";

/**
 * Canonical IBM Bob custom-mode tool groups (docs/configuracao-bob.md).
 * Only these groups are valid entries in `.bob/custom_modes.yaml`.
 */
export const BOB_TOOL_GROUPS: readonly BobToolGroup[] = [
  "read",
  "edit",
  "execute",
  "todo",
  "skill",
  "mcp",
  "subtask",
  "subagent",
  "mode",
  "workflow",
];

const BOB_TOOL_GROUP_SET: ReadonlySet<string> = new Set(BOB_TOOL_GROUPS);

/**
 * Tools that must NEVER be recommended for disabling, even if unused in a
 * single session or omitted from a custom catalogue. Disabling search/diff
 * tools pushes the agent toward full-file read_file/write_file churn.
 */
export const PROTECTED_TOOLS: ReadonlySet<string> = new Set([
  "grep",
  "glob",
  "apply_diff",
]);

export function isBobToolGroup(group: string): group is BobToolGroup {
  return BOB_TOOL_GROUP_SET.has(group);
}

/**
 * Generate a deterministic finding id from session, task, and detector.
 * Not a UUID — keeps output deterministic for tests.
 */
function makeFindingId(sessionId: string, taskId: string): string {
  return `${DETECTOR_ID_PREFIX}:${sessionId}:${taskId}`;
}

/**
 * Detect unused tools for root tasks in the ObserveReport.
 *
 * Trigger: root task AND toolInventory is present AND available.length > 0
 * AND at least one non-protected, non-retained-group idle tool exists.
 * If toolInventory is absent/null, emit nothing — absence is not zero (I-6).
 */
export function detectUnusedTools(
  report: ObserveReport,
  catalog: readonly ToolCatalogEntry[] = []
): Finding[] {
  const findings: Finding[] = [];
  const catalogByName = new Map(catalog.map((entry) => [entry.name, entry]));

  for (const task of report.tasks) {
    // I-5: subtasks are excluded from session-level diagnostics/prescriptions.
    if (task.isSubtask || task.parentId !== null) {
      continue;
    }

    const inv = task.toolInventory;

    // Guard: inventory must be present and have at least one available tool
    // and at least one idle tool.
    if (!inv || inv.available.length === 0 || inv.idle.length === 0) {
      continue;
    }

    const usedSet = new Set(inv.used);
    const availableTools = inv.available.map((name) => {
      const entry = catalogByName.get(name);
      return {
        name,
        group: entry?.group ?? UNKNOWN_TOOL_GROUP,
        purpose: entry?.purpose ?? null,
        essential: (entry?.essential ?? false) || PROTECTED_TOOLS.has(name),
        used: usedSet.has(name),
      };
    });

    const availableByGroup = new Map<string, typeof availableTools>();
    for (const tool of availableTools) {
      const list = availableByGroup.get(tool.group);
      if (list) list.push(tool);
      else availableByGroup.set(tool.group, [tool]);
    }

    const retainedBobGroups: BobToolGroup[] = [];
    const disableableBobGroups: BobToolGroup[] = [];
    for (const group of BOB_TOOL_GROUPS) {
      const groupTools = availableByGroup.get(group);
      if (!groupTools || groupTools.length === 0) continue;
      const needed = groupTools.some((tool) => tool.used || tool.essential);
      if (needed) retainedBobGroups.push(group);
      else disableableBobGroups.push(group);
    }

    const retainedBobGroupSet = new Set<string>(retainedBobGroups);
    const disableableBobGroupSet = new Set<string>(disableableBobGroups);

    const idleRatio = inv.idle.length / inv.available.length;
    const idleTools = inv.idle.map((name) => {
      const entry = catalogByName.get(name);
      return {
        name,
        group: entry?.group ?? UNKNOWN_TOOL_GROUP,
        purpose: entry?.purpose ?? null,
        essential: (entry?.essential ?? false) || PROTECTED_TOOLS.has(name),
      };
    });

    // Exclude protected/essential tools AND idle tools belonging to a retained
    // Bob group (Bob toggles tools by group, so keeping a group keeps its tools).
    const disableCandidates = idleTools.filter(
      (tool) => !tool.essential && !retainedBobGroupSet.has(tool.group)
    );
    if (disableCandidates.length === 0) {
      continue;
    }

    const disableableBobToolCount = disableCandidates.filter((tool) =>
      disableableBobGroupSet.has(tool.group)
    ).length;

    // tokenImpact is an ESTIMATE (I-6) based strictly on tools inside
    // disableable Bob groups, because IBM Bob disables tools by group and
    // per-tool definition sizes are not individually measured in the export.
    const tokenImpact =
      inv.estimatedTokensPerTool !== null && disableableBobToolCount > 0
        ? disableableBobToolCount * inv.estimatedTokensPerTool
        : null;

    const estimationBasis =
      tokenImpact !== null
        ? `Proportional estimate over disableable Bob tool groups: (${disableableBobToolCount}/${inv.available.length} tools in fully-idle, non-essential Bob groups) * breakdown.toolDefinitions (${inv.toolDefinitionTokens} tokens). Bob configures tools by group, not individually, and individual tool definition sizes are not measured.`
        : "No disableable Bob tool group was identified in the catalogue; Bob configures tools by group and individual tool definition sizes are not measured.";

    const metricsPayload = {
      idleRatio,
      availableCount: inv.available.length,
      usedCount: inv.used.length,
      idleCount: inv.idle.length,
      disableCandidateCount: disableCandidates.length,
      disableableBobToolCount,
      retainedBobGroups,
      disableableBobGroups,
      idleTools,
      tokenImpactEstimate: tokenImpact,
      tokenImpactIsEstimate: true,
      estimationBasis,
    };

    const finding: Finding = {
      id: makeFindingId(report.sessionId, task.taskId),
      sessionId: report.sessionId,
      taskId: task.taskId,
      kind: "unused-tool",
      detectedAt: report.exportedAt,
      confidence: "high",
      prescriptionHint: "disable-tool",
      description:
        "Some available Bob tool groups were unused in this task. Potential token savings " +
        "are estimates by Bob group because individual per-tool costs are not measured.",
      tokenImpact: tokenImpact !== null ? tokenImpact : undefined,
      estimationBasis,
      metric: metricsPayload,
      evidence: {
        type: "breakdown",
        redactable: false,
        unusedTools: disableCandidates.map((tool) => tool.name),
        rawValue: { ...metricsPayload },
      },
    };

    findings.push(finding);
  }

  return findings;
}
