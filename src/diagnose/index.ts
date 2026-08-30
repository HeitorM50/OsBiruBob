/**
 * Diagnose — Hindsight
 *
 * Responsibility: convert signals from ObserveReport into explainable Finding[].
 * Each detector is a pure function: (ObserveReport) => Finding[].
 *
 * Allowed imports: src/domain/types.ts, src/observe/index.ts.
 * Forbidden imports: prescribe, compare, CLI/UI.
 */

import type { Finding, ObserveReport } from "../domain/types";
import { detectUnusedTools } from "./detectors/unused-tool";
import { detectProjectRulesAbsent } from "./project-rules-absent";
import { detectRetryAfterError } from "./retry-after-error";
import { detectRedundantReads } from "./redundant-read";
import { detectSkillOverhead } from "./skill-overhead";

/** Standard detectors — each takes only an ObserveReport and returns Finding[]. */
const DETECTORS: ReadonlyArray<(report: ObserveReport) => Finding[]> = [
  detectProjectRulesAbsent,
  detectRetryAfterError,
  detectRedundantReads,
  detectSkillOverhead,
  detectUnusedTools,
];

/**
 * Run all registered detectors over the ObserveReport and return every
 * Finding produced.  Each detector is pure; errors in one detector do not
 * abort the others.
 *
 * Note: detectMcpCandidates requires an external catalogue argument and is
 * therefore NOT included in this orchestration. Callers that have catalogue
 * data should invoke it directly and merge its findings.
 */
export function diagnose(report: ObserveReport): Finding[] {
  const findings: Finding[] = [];
  for (const detector of DETECTORS) {
    const result = detector(report);
    findings.push(...result);
  }
  return findings;
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