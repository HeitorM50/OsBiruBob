/**
 * F4 / #17 — deterministic tool-reduction and Skill-overhead prescriptions.
 *
 * Consumes Findings already enriched by Diagnose. It deliberately does not
 * import or reload recommendation catalogues, performs no I/O, and never rounds
 * numeric values (I-3).
 */

import type {
  BobToolGroup,
  Finding,
  PrescribedToolSummary,
  Prescription,
} from "../domain/types";
import { prescriptionId } from "./determinism";

const BOB_TOOL_GROUPS: ReadonlySet<BobToolGroup> = new Set([
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
]);

const SKILL_STEPS: readonly string[] = [
  "Open IBM Bob → Settings → Skills.",
  "Review enabled global and workspace Skills and turn off \"Allow Bob to use this skill\" for any Skill not needed in this workflow.",
  "If you use a project custom mode (.bob/custom_modes.yaml), omit '- skill' from groups: when the task does not need Skills.",
  "Start a new conversation and confirm that breakdown.skills decreased in the next session export.",
];

interface IdleToolMetric {
  name: string;
  group: string;
  purpose: string | null;
  essential: boolean;
}

interface ParsedUnusedToolFinding {
  finding: Finding;
  candidates: IdleToolMetric[];
  retainedEssential: IdleToolMetric[];
  retainedBobGroups: string[];
  tokenImpact: number | undefined;
  estimationBasis: string;
}

interface ParsedSkillFinding {
  finding: Finding;
  skillTokens: number;
  tokenImpact: number | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isBobGroup(group: string): group is BobToolGroup {
  return BOB_TOOL_GROUPS.has(group as BobToolGroup);
}

function parseIdleTool(value: unknown): IdleToolMetric | null {
  if (!isRecord(value)) return null;
  if (
    !isNonEmptyString(value.name) ||
    !isNonEmptyString(value.group) ||
    !(value.purpose === null || isNonEmptyString(value.purpose)) ||
    typeof value.essential !== "boolean"
  ) {
    return null;
  }

  return {
    name: value.name,
    group: value.group,
    purpose: value.purpose,
    essential: value.essential,
  };
}

function sortedUniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function equalStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function parseUnusedToolFinding(finding: Finding): ParsedUnusedToolFinding | null {
  if (
    finding.kind !== "unused-tool" ||
    finding.evidence.redactable ||
    !Array.isArray(finding.evidence.unusedTools) ||
    finding.evidence.unusedTools.length === 0 ||
    !finding.evidence.unusedTools.every(isNonEmptyString)
  ) {
    return null;
  }

  const rawIdleTools = finding.metric.idleTools;
  const candidateCount = finding.metric.disableCandidateCount;
  if (
    !Array.isArray(rawIdleTools) ||
    rawIdleTools.length === 0 ||
    !Number.isInteger(candidateCount) ||
    !isFiniteNonNegative(candidateCount) ||
    finding.metric.tokenImpactIsEstimate !== true
  ) {
    return null;
  }

  const rawRetainedGroups = finding.metric.retainedBobGroups;
  let retainedBobGroups: string[] = [];
  if (rawRetainedGroups !== undefined) {
    if (!Array.isArray(rawRetainedGroups) || !rawRetainedGroups.every(isNonEmptyString)) {
      return null;
    }
    retainedBobGroups = sortedUniqueStrings(rawRetainedGroups);
  }
  const retainedGroupSet = new Set(retainedBobGroups);

  const byName = new Map<string, IdleToolMetric>();
  for (const rawTool of rawIdleTools) {
    const tool = parseIdleTool(rawTool);
    if (!tool) return null;
    const existing = byName.get(tool.name);
    if (existing) {
      if (
        existing.group !== tool.group ||
        existing.purpose !== tool.purpose ||
        existing.essential !== tool.essential
      ) {
        return null;
      }
      continue;
    }
    byName.set(tool.name, tool);
  }

  const tools = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  const candidates = tools.filter(
    (tool) => !tool.essential && !retainedGroupSet.has(tool.group)
  );
  const retainedEssential = tools.filter((tool) => tool.essential);
  const evidenceCandidates = sortedUniqueStrings(finding.evidence.unusedTools);
  const metricCandidates = candidates.map((tool) => tool.name);

  if (
    candidateCount !== candidates.length ||
    !equalStrings(evidenceCandidates, metricCandidates)
  ) {
    return null;
  }

  if (finding.tokenImpact !== undefined && !isFiniteNonNegative(finding.tokenImpact)) {
    return null;
  }

  const estimationBasis = isNonEmptyString(finding.estimationBasis)
    ? finding.estimationBasis
    : isNonEmptyString(finding.metric.estimationBasis)
      ? finding.metric.estimationBasis
      : "Proportional estimate over disableable Bob tool groups: (tools in fully-idle, non-essential Bob groups / available tools) * breakdown.toolDefinitions. Individual tool definition sizes are not measured.";

  return {
    finding,
    candidates,
    retainedEssential,
    retainedBobGroups,
    tokenImpact: finding.tokenImpact,
    estimationBasis,
  };
}

function parseSkillFinding(finding: Finding): ParsedSkillFinding | null {
  if (finding.kind !== "skill-overhead" || finding.evidence.redactable) return null;

  const skillTokens = finding.metric.skillTokens;
  const loadedSkills = finding.metric.loadedSkills;
  if (!isFinitePositive(skillTokens)) return null;
  // Absence is not empty (I-6): loadedSkills must be explicitly an empty array.
  if (
    !Array.isArray(loadedSkills) ||
    !loadedSkills.every(isNonEmptyString) ||
    loadedSkills.length > 0
  ) {
    return null;
  }
  if (finding.tokenImpact !== undefined && !isFinitePositive(finding.tokenImpact)) {
    return null;
  }

  return { finding, skillTokens, tokenImpact: finding.tokenImpact };
}

function retainedRationale(
  retainedEssential: readonly IdleToolMetric[],
  retainedBobGroups: readonly string[]
): string {
  const notes: string[] = [];
  if (retainedEssential.length > 0) {
    notes.push(
      `Protected essential tools retained: ${retainedEssential
        .map((tool) => tool.name)
        .join(", ")}.`
    );
  }
  if (retainedBobGroups.length > 0) {
    notes.push(
      `Active Bob groups retained as a whole: ${retainedBobGroups.join(", ")} (Bob configures tools by group, not individually).`
    );
  }
  return notes.length > 0 ? ` ${notes.join(" ")}` : "";
}

function formatToolLine(tool: IdleToolMetric): string {
  return tool.purpose ? `- ${tool.name}: ${tool.purpose}` : `- ${tool.name}`;
}

function toolPrescriptions(parsed: ParsedUnusedToolFinding): Prescription[] {
  if (parsed.candidates.length === 0) return [];

  const groups = new Map<string, IdleToolMetric[]>();
  for (const tool of parsed.candidates) {
    const group = groups.get(tool.group);
    if (group) group.push(tool);
    else groups.set(tool.group, [tool]);
  }

  const orderedGroups = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  const findingIds = [parsed.finding.id];

  // Only configurable groups (i.e. not "other") receive a share of the
  // Bob-group token saving estimate. Unknown/non-group tools in "other" have
  // no direct group toggle in .bob/custom_modes.yaml.
  const estimableGroups = orderedGroups.filter(([group]) => group !== "other");
  const estimableToolCount = estimableGroups.reduce(
    (sum, [, tools]) => sum + tools.length,
    0
  );
  const estimatedPerTool =
    parsed.tokenImpact === undefined || estimableToolCount === 0
      ? undefined
      : parsed.tokenImpact / estimableToolCount;

  const groupSavings = new Map<string, number>();
  if (estimatedPerTool !== undefined && parsed.tokenImpact !== undefined) {
    let allocated = 0;
    estimableGroups.forEach(([group, tools], index) => {
      const saving =
        index === estimableGroups.length - 1
          ? parsed.tokenImpact! - allocated
          : estimatedPerTool * tools.length;
      allocated += saving;
      groupSavings.set(group, saving);
    });
  }

  return orderedGroups.map(([group, tools]) => {
    tools.sort((a, b) => a.name.localeCompare(b.name));
    const estimatedTokenSaving = groupSavings.get(group);
    const bobGroup = isBobGroup(group);

    const toolList = tools.map(formatToolLine).join("\n");
    const structuredTools: PrescribedToolSummary[] = tools.map((tool) => ({
      name: tool.name,
      group: tool.group,
      purpose: tool.purpose,
    }));

    const steps = bobGroup
      ? [
          `Create or update .bob/custom_modes.yaml and omit '- ${group}' from groups:.`,
          "Confirm the workspace is trusted in IBM Bob and select the custom mode in Settings → Modes.",
          "Start a new conversation so Bob loads only the selected tool groups.",
        ]
      : [
          "Switch to a project custom mode in .bob/custom_modes.yaml; default-agent-only tools (such as HTML/chart artifacts) are omitted automatically in custom modes.",
          "Unknown tools under 'other' do not map to a configurable Bob group and cannot be toggled individually.",
        ];

    const groupHeader = bobGroup
      ? `Omit '- ${group}' from groups: in .bob/custom_modes.yaml to disable this unused Bob tool group:`
      : "Tools not mapped to a configurable Bob group (default-agent-only tools are omitted automatically when using a custom mode):";

    return {
      id: prescriptionId(
        "disable-tool",
        parsed.finding.sessionId,
        parsed.finding.taskId,
        findingIds,
        group
      ),
      sessionId: parsed.finding.sessionId,
      taskId: parsed.finding.taskId,
      findingIds,
      kind: "disable-tool",
      status: "pending",
      createdAt: parsed.finding.detectedAt,
      ...(bobGroup ? { targetFile: ".bob/custom_modes.yaml" } : {}),
      content: `Group: ${group}\n\n${groupHeader}\n\n${toolList}`,
      tools: structuredTools,
      steps,
      rationale:
        (bobGroup
          ? `Bob tool group '${group}' had no tool calls and contains no protected essential tools in the analyzed session. ` +
            "Potential token savings are estimated by Bob group, not individually measured. " +
            `Basis: ${parsed.estimationBasis}`
          : "These tools were unused in the analyzed session but do not belong to a configurable Bob custom-mode group; " +
            "no per-group token saving is estimated for them.") +
        retainedRationale(parsed.retainedEssential, parsed.retainedBobGroups),
      ...(estimatedTokenSaving === undefined
        ? {}
        : {
            estimatedTokenSaving,
            isEstimate: true,
            estimationBasis: parsed.estimationBasis,
          }),
    };
  });
}

function skillPrescription(parsed: ParsedSkillFinding): Prescription {
  const findingIds = [parsed.finding.id];
  const estimationBasis =
    "Upper-bound saving estimate equal to measured breakdown.skills; actual savings depend on which global or workspace Skills are disabled in IBM Bob (Settings → Skills).";

  return {
    id: prescriptionId(
      "disable-skill",
      parsed.finding.sessionId,
      parsed.finding.taskId,
      findingIds
    ),
    sessionId: parsed.finding.sessionId,
    taskId: parsed.finding.taskId,
    findingIds,
    kind: "disable-skill",
    status: "pending",
    createdAt: parsed.finding.detectedAt,
    content:
      "How to review and disable unused Skills in IBM Bob:\n" +
      SKILL_STEPS.map((step, index) => `${index + 1}. ${step}`).join("\n") +
      "\n\nNote: The export measures aggregate Skill overhead in breakdown.skills, " +
      "but does not identify a specific Skill target.",
    steps: [...SKILL_STEPS],
    rationale:
      "Bob measured aggregate Skill context overhead in breakdown.skills while loadedSkills was empty. " +
      "Disabling unused Skills in Settings → Skills can recover up to this measured amount (upper-bound estimate), " +
      "because the export does not break down tokens per individual Skill.",
    ...(parsed.tokenImpact === undefined
      ? {}
      : {
          estimatedTokenSaving: parsed.tokenImpact,
          isEstimate: true,
          estimationBasis,
        }),
  };
}

/** Generate deterministic tool and Skill overhead prescriptions from enriched Findings. */
export function prescribeOverheadReduction(
  findings: readonly Finding[]
): Prescription[] {
  const unique = new Map<string, Finding>();
  for (const finding of findings) {
    if (
      (finding.kind === "unused-tool" || finding.kind === "skill-overhead") &&
      !unique.has(finding.id)
    ) {
      unique.set(finding.id, finding);
    }
  }

  const ordered = [...unique.values()].sort(
    (a, b) =>
      a.sessionId.localeCompare(b.sessionId) ||
      a.taskId.localeCompare(b.taskId) ||
      a.kind.localeCompare(b.kind) ||
      a.detectedAt - b.detectedAt ||
      a.id.localeCompare(b.id)
  );

  const result: Prescription[] = [];
  for (const finding of ordered) {
    const unused = parseUnusedToolFinding(finding);
    if (unused) {
      result.push(...toolPrescriptions(unused));
      continue;
    }
    const skill = parseSkillFinding(finding);
    if (skill) result.push(skillPrescription(skill));
  }
  return result;
}
