/**
 * Prescribe — AGENTS.md generator (F4 / #16)
 *
 * Transforms supported Findings into deterministic, reviewable AGENTS.md
 * prescriptions. This module is pure and browser-safe: it performs no I/O,
 * reads no raw export, and never consults the system clock.
 *
 * Allowed imports: src/domain/types.ts.
 * Forbidden imports: parser, observe, compare, CLI/UI and Node APIs.
 */

import type { EpochMs, Finding, Prescription } from "../domain/types";
import { prescriptionId } from "./determinism";
export { prescribeOverheadReduction } from "./overhead";
export { prescribeMcpEnablement } from "./mcp";

type AgentsMdFindingKind =
  | "project-rules-absent"
  | "human-intervention"
  | "redundant-read"
  | "retry-after-error";

type AgentsMdFinding = Omit<Finding, "kind"> & { kind: AgentsMdFindingKind };
type SectionFinding = Omit<Finding, "kind"> & {
  kind: Exclude<AgentsMdFindingKind, "project-rules-absent">;
};

const KIND_ORDER: Readonly<Record<AgentsMdFindingKind, number>> = {
  "project-rules-absent": 0,
  "human-intervention": 1,
  "redundant-read": 2,
  "retry-after-error": 3,
};

const BASE_RULE =
  "- Keep repository-specific instructions concise, stable, and scoped to the current task.";

const SECTION_TEMPLATES: Readonly<
  Partial<Record<AgentsMdFindingKind, { content: string; rationale: string }>>
> = {
  "human-intervention": {
    content:
      "- Confirm ambiguous requirements before making broad changes, and preserve decisions already established during the task.",
    rationale:
      "Reduces avoidable mid-task clarification without copying user message content.",
  },
  "redundant-read": {
    content:
      "- Reuse information already gathered during the task; reread a file only when it may have changed or its contents are no longer available.",
    rationale:
      "Reduces repeated reads without exposing the observed file path.",
  },
  "retry-after-error": {
    content:
      "- Inspect and address the cause of a failed operation before retrying it, then validate the result.",
    rationale:
      "Reduces blind retries without exposing commands, arguments, or raw errors.",
  },
};

function isAgentsMdFinding(finding: Finding): finding is AgentsMdFinding {
  return Object.prototype.hasOwnProperty.call(KIND_ORDER, finding.kind);
}

function compareFindings(a: AgentsMdFinding, b: AgentsMdFinding): number {
  return (
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
    a.sessionId.localeCompare(b.sessionId) ||
    a.taskId.localeCompare(b.taskId) ||
    a.detectedAt - b.detectedAt ||
    a.id.localeCompare(b.id)
  );
}

function latestDetectedAt(findings: readonly Finding[]): EpochMs {
  let latest = findings[0].detectedAt;
  for (let index = 1; index < findings.length; index++) {
    if (findings[index].detectedAt > latest) latest = findings[index].detectedAt;
  }
  return latest;
}

function uniqueSupportedFindings(findings: readonly Finding[]): AgentsMdFinding[] {
  const byId = new Map<string, AgentsMdFinding>();

  for (const finding of findings) {
    if (!isAgentsMdFinding(finding) || byId.has(finding.id)) continue;
    byId.set(finding.id, finding);
  }

  return [...byId.values()].sort(compareFindings);
}

function groupByTask(
  findings: readonly AgentsMdFinding[]
): Array<readonly AgentsMdFinding[]> {
  const groups = new Map<string, AgentsMdFinding[]>();

  for (const finding of findings) {
    const key = `${finding.sessionId.length}:${finding.sessionId}${finding.taskId}`;
    const group = groups.get(key);
    if (group) group.push(finding);
    else groups.set(key, [finding]);
  }

  return [...groups.values()];
}

function createSectionPrescription(
  finding: SectionFinding
): Prescription {
  const template = SECTION_TEMPLATES[finding.kind];
  if (!template) {
    // Exhaustive at runtime as well as at compile time; future kinds degrade safely.
    throw new Error(`Missing safe AGENTS.md template for ${finding.kind}`);
  }

  const findingIds = [finding.id];
  return {
    id: prescriptionId("agents-md-section", finding.sessionId, finding.taskId, findingIds),
    sessionId: finding.sessionId,
    taskId: finding.taskId,
    findingIds,
    kind: "agents-md-section",
    status: "pending",
    createdAt: finding.detectedAt,
    content: template.content,
    rationale: template.rationale,
  };
}

function renderSectionContents(sections: readonly Prescription[]): string {
  const seen = new Set<string>();
  const rules: string[] = [BASE_RULE];

  for (const section of sections) {
    if (section.kind !== "agents-md-section" || !section.content || seen.has(section.content)) {
      continue;
    }
    seen.add(section.content);
    rules.push(section.content);
  }

  return `# AGENTS.md\n\n## Working guidelines\n\n${rules.join("\n")}`;
}

/**
 * Generate only the AGENTS.md prescription family from Finding[].
 *
 * Sensitive Finding fields are deliberately never read while producing content:
 * description, prescription, evidence, metrics and Finding IDs remain audit
 * metadata and cannot flow into the generated Markdown.
 */
export function prescribeAgentsMd(findings: readonly Finding[]): Prescription[] {
  const supported = uniqueSupportedFindings(findings);
  if (supported.length === 0) return [];

  const result: Prescription[] = [];

  for (const group of groupByTask(supported)) {
    const sections = group
      .filter(
        (finding): finding is SectionFinding => finding.kind !== "project-rules-absent"
      )
      .map(createSectionPrescription);

    result.push(...sections);

    const findingIds = group.map((finding) => finding.id);
    const first = group[0];
    result.push({
      id: prescriptionId("agents-md-file", first.sessionId, first.taskId, findingIds),
      sessionId: first.sessionId,
      taskId: first.taskId,
      findingIds,
      kind: "agents-md-file",
      status: "pending",
      createdAt: latestDetectedAt(group),
      content: renderSectionContents(sections),
      targetFile: "AGENTS.md",
      rationale:
        "Provides a minimal, reviewable project-instruction draft derived from supported findings.",
    });
  }

  return result;
}

/**
 * Render AGENTS.md content from prescriptions produced by prescribeAgentsMd().
 * File prescriptions take precedence because they already contain the composed
 * draft. With section-only input, a minimal document is composed deterministically.
 */
export function renderAgentsMd(prescriptions: readonly Prescription[]): string {
  const files = prescriptions
    .filter(
      (prescription): prescription is Prescription & { content: string } =>
        prescription.kind === "agents-md-file" && typeof prescription.content === "string"
    )
    .sort(
      (a, b) =>
        a.sessionId.localeCompare(b.sessionId) ||
        a.taskId.localeCompare(b.taskId) ||
        a.id.localeCompare(b.id)
    );

  if (files.length > 0) return files.map((file) => file.content).join("\n\n---\n\n");

  const sections = prescriptions
    .filter((prescription) => prescription.kind === "agents-md-section")
    .sort(
      (a, b) =>
        a.sessionId.localeCompare(b.sessionId) ||
        a.taskId.localeCompare(b.taskId) ||
        a.createdAt - b.createdAt ||
        a.id.localeCompare(b.id)
    );

  return sections.length > 0 ? renderSectionContents(sections) : "";
}
