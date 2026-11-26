/**
 * Shared finding labels and finding ↔ prescription linkage helpers.
 *
 * Single source of truth for finding kind names across Diagnose, Fix, and
 * Compare screens so terminology never drifts between screens.
 */

import type { Finding, FindingKind, Prescription } from "../domain/types";

export const CORE_FINDING_KINDS: readonly FindingKind[] = [
  "project-rules-absent",
  "unused-tool",
  "skill-overhead",
  "mcp-candidate",
  "redundant-read",
  "retry-after-error",
  "human-intervention",
];

/** Canonical human-readable name per FindingKind, shared by all screens. */
export const FINDING_KIND_LABELS: Readonly<Record<string, string>> = {
  "project-rules-absent": "Project rules missing",
  "unused-tool": "Idle tools",
  "skill-overhead": "Undeclared skill overhead",
  "mcp-candidate": "MCP server candidate",
  "redundant-read": "Redundant re-read",
  "retry-after-error": "Retry after failure",
  "human-intervention": "Human intervention",
  "unmatched-tool-call": "Unmatched tool call",
  "orphan-tool-result": "Orphan tool result",
};

export const FINDING_GROUP_LABELS: Readonly<Record<string, string>> = {
  "project-rules-absent": "Missing configuration",
  "unused-tool": "Overhead paid but unused",
  "skill-overhead": "Overhead paid but undeclared",
  "mcp-candidate": "Shell that could be a tool",
  "redundant-read": "Redundant re-read",
  "retry-after-error": "Retry after failure",
  "human-intervention": "Human intervention",
};

export function findingKindLabel(kind: string): string {
  return FINDING_KIND_LABELS[kind] ?? kind;
}

export function findingGroupLabel(kind: string): string {
  return FINDING_GROUP_LABELS[kind] ?? kind;
}

/**
 * Prescription kinds that are rendered as visible cards on the Fix screen.
 * `agents-md-section` is composed into `agents-md-file`, so links should target
 * the file prescription rather than an unrendered section.
 */
const VISIBLE_PRESCRIPTION_KINDS: ReadonlySet<string> = new Set([
  "agents-md-file",
  "custom-mode",
  "disable-tool",
  "disable-skill",
  "enable-mcp",
]);

function matchesHint(finding: Finding, prescription: Prescription): boolean {
  const hint = finding.prescriptionHint;
  if (prescription.kind === hint) return true;
  if (hint === "agents-md-section" && prescription.kind === "agents-md-file") {
    return true;
  }
  if (hint === "disable-tool" && prescription.kind === "custom-mode") {
    return true;
  }
  return false;
}

/**
 * Find the primary visible prescription on the Fix screen that addresses a
 * given finding, preferring one that matches `finding.prescriptionHint`.
 */
export function findTargetPrescription(
  finding: Finding,
  prescriptions: readonly Prescription[]
): Prescription | null {
  const candidates = prescriptions.filter(
    (p) =>
      VISIBLE_PRESCRIPTION_KINDS.has(p.kind) &&
      p.findingIds.includes(finding.id)
  );
  if (candidates.length === 0) return null;

  // Prefer custom-mode over individual disable-tool when hint is disable-tool
  if (finding.prescriptionHint === "disable-tool") {
    const customMode = candidates.find((p) => p.kind === "custom-mode");
    if (customMode) return customMode;
  }

  return candidates.find((p) => matchesHint(finding, p)) ?? candidates[0];
}
