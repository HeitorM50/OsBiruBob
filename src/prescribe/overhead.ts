/**
 * F4 / #17 — deterministic tool-reduction and Skill-overhead prescriptions.
 *
 * Consumes Findings already enriched by Diagnose. It deliberately does not
 * import or reload recommendation catalogues.
 */

import type { Finding, Prescription } from "../domain/types";
import { prescriptionId } from "./determinism";

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
  tokenImpact: number | undefined;
}

interface ParsedSkillFinding {
  finding: Finding;
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
  const candidates = tools.filter((tool) => !tool.essential);
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

  return {
    finding,
    candidates,
    retainedEssential,
    tokenImpact: finding.tokenImpact,
  };
}

function parseSkillFinding(finding: Finding): ParsedSkillFinding | null {
  if (finding.kind !== "skill-overhead" || finding.evidence.redactable) return null;

  const skillTokens = finding.metric.skillTokens;
  const loadedSkills = finding.metric.loadedSkills;
  if (!isFinitePositive(skillTokens)) return null;
  if (
    loadedSkills !== undefined &&
    (!Array.isArray(loadedSkills) || !loadedSkills.every(isNonEmptyString) || loadedSkills.length > 0)
  ) {
    return null;
  }
  if (finding.tokenImpact !== undefined && !isFinitePositive(finding.tokenImpact)) {
    return null;
  }

  return { finding, tokenImpact: finding.tokenImpact };
}

function retainedRationale(retained: readonly IdleToolMetric[]): string {
  if (retained.length === 0) return "";
  return ` Catalogue-protected essential tools retained: ${retained
    .map((tool) => tool.name)
    .join(", ")}.`;
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
  const estimatedPerCandidate =
    parsed.tokenImpact === undefined
      ? undefined
      : parsed.tokenImpact / parsed.candidates.length;
  let allocatedSaving = 0;

  return orderedGroups.map(([group, tools], index) => {
    tools.sort((a, b) => a.name.localeCompare(b.name));
    let estimatedTokenSaving: number | undefined;
    if (estimatedPerCandidate !== undefined && parsed.tokenImpact !== undefined) {
      estimatedTokenSaving =
        index === orderedGroups.length - 1
          ? parsed.tokenImpact - allocatedSaving
          : estimatedPerCandidate * tools.length;
      allocatedSaving += estimatedTokenSaving;
    }

    const toolList = tools.map((tool) => `- ${tool.name}`).join("\n");
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
      content:
        `Group: ${group}\n\n` +
        "Estimated recommendation for this analyzed session:\n\n" +
        toolList,
      rationale:
        "These tools were available but unused in the analyzed session. " +
        "Review their necessity in other workflows before disabling them. " +
        "Potential token savings are estimated, not individually measured." +
        retainedRationale(parsed.retainedEssential),
      ...(estimatedTokenSaving === undefined ? {} : { estimatedTokenSaving }),
    };
  });
}

function skillPrescription(parsed: ParsedSkillFinding): Prescription {
  const findingIds = [parsed.finding.id];
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
      "Review global or installed Skills enabled for this workflow. " +
      "The export reports aggregate Skill overhead but does not identify a specific Skill target.",
    rationale:
      "Estimated aggregate Skill overhead for the analyzed session; no concrete Skill was identified.",
    ...(parsed.tokenImpact === undefined
      ? {}
      : { estimatedTokenSaving: parsed.tokenImpact }),
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
