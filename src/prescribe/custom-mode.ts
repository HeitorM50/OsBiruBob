/**
 * F4 — Deterministic IBM Bob custom-mode generator (.bob/custom_modes.yaml).
 *
 * Transforms unused-tool Findings (and aligns with mcp-candidate and
 * skill-overhead Findings for the same task) into a ready-to-apply
 * `.bob/custom_modes.yaml` prescription using ONLY valid IBM Bob tool groups.
 *
 * Pure, browser-safe, zero external YAML dependencies, no I/O, no rounding.
 * Allowed imports: src/domain/types.ts, ./determinism.
 */

import type { BobToolGroup, EpochMs, Finding, Prescription } from "../domain/types";
import { prescriptionId } from "./determinism";

/** Canonical order of valid IBM Bob custom-mode tool groups. */
export const CANONICAL_BOB_GROUPS: readonly BobToolGroup[] = [
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

const BOB_GROUP_SET: ReadonlySet<string> = new Set(CANONICAL_BOB_GROUPS);

/** Safe baseline Bob groups when a finding carries no explicit retainedBobGroups list. */
const FALLBACK_CORE_GROUPS: readonly BobToolGroup[] = ["read", "edit", "execute"];

const CUSTOM_MODE_STEPS: readonly string[] = [
  "Save the generated YAML to .bob/custom_modes.yaml in your project root.",
  "Open the repository in IBM Bob and confirm the workspace is trusted (untrusted workspaces ignore .bob/ configuration).",
  "Open Settings → Modes to confirm 'Hindsight Optimized' appears, then select it in the mode picker before starting a new conversation.",
];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isBobToolGroup(value: unknown): value is BobToolGroup {
  return typeof value === "string" && BOB_GROUP_SET.has(value);
}

function orderBobGroups(groups: Iterable<BobToolGroup>): BobToolGroup[] {
  const unique = new Set(groups);
  return CANONICAL_BOB_GROUPS.filter((group) => unique.has(group));
}

function latestDetectedAt(findings: readonly Finding[]): EpochMs {
  let latest = findings[0].detectedAt;
  for (let i = 1; i < findings.length; i++) {
    if (findings[i].detectedAt > latest) latest = findings[i].detectedAt;
  }
  return latest;
}

/**
 * Render a deterministic IBM Bob `.bob/custom_modes.yaml` document.
 * Only valid Bob tool groups are emitted (sorted in canonical Bob order).
 */
export function renderCustomModesYaml(groups: readonly BobToolGroup[]): string {
  const ordered = orderBobGroups(groups.filter(isBobToolGroup));
  const groupLines = ordered.map((group) => `      - ${group}`).join("\n");

  return [
    "customModes:",
    "  - slug: hindsight-optimized",
    "    name: Hindsight Optimized",
    "    description: Focused Bob mode enabling only the tool groups needed for this workflow.",
    "    roleDefinition: You are a software engineer executing a focused task with minimal tool overhead.",
    "    whenToUse: Use for workflows similar to the analyzed session without unused tool groups.",
    "    customInstructions: Follow the root AGENTS.md and the user's prompt.",
    "    groups:",
    groupLines,
  ].join("\n");
}

function extractValidBobGroups(value: unknown): BobToolGroup[] | null {
  if (!Array.isArray(value)) return null;
  const valid: BobToolGroup[] = [];
  for (const item of value) {
    if (isBobToolGroup(item)) {
      valid.push(item);
    }
  }
  return orderBobGroups(valid);
}

/**
 * Generate deterministic `.bob/custom_modes.yaml` prescriptions from Findings.
 *
 * - Emits one `custom-mode` prescription per `(sessionId, taskId)` that has
 *   a valid `unused-tool` finding.
 * - Uses ONLY IBM Bob's real tool groups (`read`, `edit`, `execute`, `todo`,
 *   `skill`, `mcp`, `subtask`, `subagent`, `mode`, `workflow`).
 * - Consistency guarantee: if `mcp-candidate` findings also exist for the same
 *   task, `- mcp` is automatically included in `groups:` so the custom mode
 *   does not block the recommended MCP server(s).
 * - Sensitive finding fields are never read or copied into the YAML.
 */
export function prescribeCustomMode(findings: readonly Finding[]): Prescription[] {
  const uniqueById = new Map<string, Finding>();
  for (const finding of findings) {
    if (
      (finding.kind === "unused-tool" ||
        finding.kind === "mcp-candidate" ||
        finding.kind === "skill-overhead") &&
      !uniqueById.has(finding.id)
    ) {
      uniqueById.set(finding.id, finding);
    }
  }

  const byTask = new Map<string, Finding[]>();
  for (const finding of uniqueById.values()) {
    const key = `${finding.sessionId}\u001f${finding.taskId}`;
    const list = byTask.get(key);
    if (list) list.push(finding);
    else byTask.set(key, [finding]);
  }

  const result: Prescription[] = [];

  for (const [, taskFindings] of [...byTask.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const unusedFindings = taskFindings
      .filter((f) => f.kind === "unused-tool" && !f.evidence.redactable)
      .sort((a, b) => a.id.localeCompare(b.id));

    if (unusedFindings.length === 0) continue;

    const primaryUnused = unusedFindings[0];
    const mcpFindings = taskFindings
      .filter((f) => f.kind === "mcp-candidate")
      .sort((a, b) => a.id.localeCompare(b.id));
    const skillFindings = taskFindings
      .filter((f) => f.kind === "skill-overhead" && !f.evidence.redactable)
      .sort((a, b) => a.id.localeCompare(b.id));

    const retainedFromMetric = extractValidBobGroups(
      primaryUnused.metric.retainedBobGroups
    );
    const disableableFromMetric =
      extractValidBobGroups(primaryUnused.metric.disableableBobGroups) ?? [];

    const enabledSet = new Set<BobToolGroup>(
      retainedFromMetric && retainedFromMetric.length > 0
        ? retainedFromMetric
        : FALLBACK_CORE_GROUPS
    );

    const addedMcpForConsistency = mcpFindings.length > 0 && !enabledSet.has("mcp");
    if (mcpFindings.length > 0) {
      enabledSet.add("mcp");
    }

    const enabledGroups = orderBobGroups(enabledSet);
    const omittedGroups = disableableFromMetric.filter(
      (group) => !enabledSet.has(group)
    );

    const linkedFindings: Finding[] = [...unusedFindings];
    if (mcpFindings.length > 0) {
      linkedFindings.push(...mcpFindings);
    }
    if (!enabledSet.has("skill") && skillFindings.length > 0) {
      linkedFindings.push(...skillFindings);
    }

    const findingIds = linkedFindings
      .map((f) => f.id)
      .sort((a, b) => a.localeCompare(b));

    const estimatedTokenSaving =
      primaryUnused.tokenImpact !== undefined &&
      isFiniteNonNegative(primaryUnused.tokenImpact)
        ? primaryUnused.tokenImpact
        : undefined;

    const estimationBasis = isNonEmptyString(primaryUnused.estimationBasis)
      ? primaryUnused.estimationBasis
      : isNonEmptyString(primaryUnused.metric.estimationBasis)
        ? primaryUnused.metric.estimationBasis
        : "Proportional estimate over disableable Bob tool groups: (tools in fully-idle, non-essential Bob groups / available tools) * breakdown.toolDefinitions. Individual tool definition sizes are not measured.";

    const rationaleParts: string[] = [
      `Enables only the Bob tool groups needed for this workflow (${enabledGroups.join(", ")}).`,
    ];
    if (omittedGroups.length > 0) {
      rationaleParts.push(
        `Omits unused Bob groups (${omittedGroups.join(", ")}) to reduce tool overhead without removing protected search/diff tools.`
      );
    }
    if (addedMcpForConsistency) {
      rationaleParts.push(
        "Includes 'mcp' so the recommended MCP server(s) remain usable in this custom mode."
      );
    }
    if (!enabledSet.has("skill") && skillFindings.length > 0) {
      rationaleParts.push(
        "Omits 'skill' consistently with the undeclared Skill overhead finding."
      );
    }
    rationaleParts.push(
      "Bob configures tools by group, not individually; token savings are estimated by group rather than individually measured."
    );

    result.push({
      id: prescriptionId(
        "custom-mode",
        primaryUnused.sessionId,
        primaryUnused.taskId,
        findingIds
      ),
      sessionId: primaryUnused.sessionId,
      taskId: primaryUnused.taskId,
      findingIds,
      kind: "custom-mode",
      status: "pending",
      createdAt: latestDetectedAt(linkedFindings),
      targetFile: ".bob/custom_modes.yaml",
      content: renderCustomModesYaml(enabledGroups),
      groups: enabledGroups,
      steps: [...CUSTOM_MODE_STEPS],
      rationale: rationaleParts.join(" "),
      ...(estimatedTokenSaving === undefined
        ? {}
        : {
            estimatedTokenSaving,
            isEstimate: true,
            estimationBasis,
          }),
    });
  }

  return result;
}
