/**
 * Diagnose — Hindsight
 *
 * Responsibility: convert signals from ObserveReport into explainable Finding[].
 * Each detector is a pure function: (ObserveReport) => Finding[].
 *
 * Allowed imports: src/domain/types.ts, src/observe/index.ts.
 * Forbidden imports: prescribe, compare, CLI/UI.
 */

import type { DiagnoseResult, Finding, ObserveReport } from "../domain/types";
import { loadMcpCatalog, loadToolCatalog } from "../catalog";
import { detectUnusedTools } from "./detectors/unused-tool";
import { detectProjectRulesAbsent } from "./project-rules-absent";
import { detectRetryAfterError } from "./retry-after-error";
import { detectRedundantReads } from "./redundant-read";
import { detectSkillOverhead } from "./skill-overhead";
import { detectHumanIntervention } from "./human-intervention";
import { detectMcpCandidates } from "./mcp-candidate";

/** Standard detectors — each takes only an ObserveReport and returns Finding[]. */
const DETECTORS: ReadonlyArray<(report: ObserveReport) => Finding[]> = [
  detectProjectRulesAbsent,
  detectRetryAfterError,
  detectRedundantReads,
  detectSkillOverhead,
  detectHumanIntervention,
];

export interface DiagnoseCatalogOverrides {
  mcp?: unknown;
  tools?: unknown;
}

/**
 * Run all registered detectors with the bundled recommendation catalogs.
 * Catalog failures suppress only their related findings and are recorded in
 * unavailableMetrics.
 */
export function diagnose(
  report: ObserveReport,
  overrides: DiagnoseCatalogOverrides = {}
): DiagnoseResult {
  const findings: Finding[] = [];
  const unavailableMetrics: string[] = [];
  for (const detector of DETECTORS) {
    const result = detector(report);
    findings.push(...result);
  }

  const mcpCatalog = Object.prototype.hasOwnProperty.call(overrides, "mcp")
    ? loadMcpCatalog(overrides.mcp)
    : loadMcpCatalog();
  if (mcpCatalog.ok) {
    const mcpResult = detectMcpCandidates(report, mcpCatalog.entries);
    findings.push(...mcpResult.findings);
    unavailableMetrics.push(...mcpResult.unavailableMetrics);
  } else {
    unavailableMetrics.push(mcpCatalog.reason);
  }

  const toolCatalog = Object.prototype.hasOwnProperty.call(overrides, "tools")
    ? loadToolCatalog(overrides.tools)
    : loadToolCatalog();
  if (toolCatalog.ok) {
    findings.push(...detectUnusedTools(report, toolCatalog.entries));
  } else {
    unavailableMetrics.push(toolCatalog.reason);
  }

  return { findings, unavailableMetrics };
}

export { detectUnusedTools };
export { detectProjectRulesAbsent } from "./project-rules-absent";
export { detectRetryAfterError } from "./retry-after-error";
export { detectRedundantReads } from "./redundant-read";
export { detectSkillOverhead } from "./skill-overhead";
export {
  detectMcpCandidates,
  MCP_CATALOG_ABSENT,
  MCP_CATALOG_INVALID,
} from "./mcp-candidate";
export { detectHumanIntervention } from "./human-intervention";
