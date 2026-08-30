/**
 * Diagnose — Hindsight
 *
 * Responsibility: convert signals from ObserveReport into explainable Finding[].
 * Each detector is a pure function: (ObserveReport) => Finding[].
 *
 * Allowed imports: src/domain/types.ts, src/observe/index.ts.
 * Forbidden imports: prescribe, compare, CLI/UI.
 */

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