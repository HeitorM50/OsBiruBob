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

/** All registered detectors, in execution order. */
const DETECTORS: ReadonlyArray<(report: ObserveReport) => Finding[]> = [
  detectUnusedTools,
];

/**
 * Run all registered detectors over the ObserveReport and return every
 * Finding produced.  Each detector is pure; errors in one detector do not
 * abort the others.
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
