import { readFileSync } from "fs";
import { join } from "path";
import { parseSession } from "../../src/parser/index";
import { observe } from "../../src/observe/index";
import { diagnose } from "../../src/diagnose/index";
import { detectMcpCandidates } from "../../src/diagnose/mcp-candidate";

const raw = readFileSync(join(process.cwd(), "benchmark/rodada-a.json"), "utf-8");
const parsed = parseSession(raw);
if (!parsed.ok) { console.error("Parse failed:", parsed.error.message); process.exit(1); }
const report = observe(parsed.value);
const findings = diagnose(report);

// Also run MCP with catalog (catalog may not exist yet)
let catalog: unknown = null;
try {
  catalog = JSON.parse(readFileSync(join(process.cwd(), "data/mcp-catalog.json"), "utf-8"));
} catch {
  console.log("NOTE: data/mcp-catalog.json not found — running without MCP catalog");
}
const mcpResult = detectMcpCandidates(report, catalog);
const allFindings = [...findings, ...mcpResult.findings];

// Count by kind
const byKind: Record<string, number> = {};
for (const f of allFindings) {
  byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
}

console.log("=== BASELINE FINDINGS (benchmark/rodada-a.json) ===");
console.log("Total findings:", allFindings.length);
console.log("By kind:", JSON.stringify(byKind, null, 2));
console.log("");

console.log("=== EVIDENCE AUDIT ===");
let allHaveEvidence = true;
let allHaveConfidence = true;
let redactableLeaksFound = false;
for (const f of allFindings) {
  const hasFieldPath = !!f.evidence.fieldPath;
  const hasMessageIds = Array.isArray(f.evidence.messageIds) && f.evidence.messageIds.length > 0;
  const hasToolCallIds = Array.isArray(f.evidence.toolCallIds) && f.evidence.toolCallIds.length > 0;
  const hasEvidence = hasFieldPath || hasMessageIds || hasToolCallIds;
  if (!hasEvidence) allHaveEvidence = false;
  if (!f.confidence) allHaveConfidence = false;
  
  console.log(`[${f.kind}]`);
  console.log(`  id: ${f.id}`);
  console.log(`  confidence: ${f.confidence}`);
  console.log(`  evidence.type: ${f.evidence.type}`);
  console.log(`  evidence.redactable: ${f.evidence.redactable}`);
  console.log(`  hasFieldPath=${hasFieldPath} | hasMessageIds=${hasMessageIds} | hasToolCallIds=${hasToolCallIds}`);
  console.log(`  tokenImpact: ${f.tokenImpact ?? "null"}`);
  
  // Check if redactable evidence has no content exposed
  if (f.evidence.redactable && f.evidence.rawValue && typeof f.evidence.rawValue === "string") {
    // rawValue for retry-after-error is the error message - redactable but permitted as it's not user content
    console.log(`  evidence.rawValue (redactable): [PRESENT - ${typeof f.evidence.rawValue}]`);
  }
}

console.log("");
console.log("=== INVARIANT CHECKS ===");
console.log("allHaveEvidence:", allHaveEvidence);
console.log("allHaveConfidence:", allHaveConfidence);

// Check mcp-candidate is never above medium
const mcpFindings = allFindings.filter(f => f.kind === "mcp-candidate");
const mcpAboveMedium = mcpFindings.filter(f => f.confidence === "high" || f.confidence === "low");
console.log("mcp-candidate never above medium:", mcpAboveMedium.length === 0);

// Check tokenImpact for estimates (only for skill-overhead, we know tokenImpact.estimated = true on metric)
const skillFindings = allFindings.filter(f => f.kind === "skill-overhead");
const skillEstimateLabeled = skillFindings.every(f => {
  const ti = (f.metric as Record<string, unknown>).tokenImpact;
  return typeof ti === "object" && ti !== null && (ti as Record<string, unknown>).estimated === true;
});
console.log("skill-overhead tokenImpact labeled as estimate:", skillEstimateLabeled);

console.log("");
console.log("=== EXPECTED vs ACTUAL ===");
const expected: Record<string, number | string> = {
  "project-rules-absent": 1,
  "unused-tool": 1,
  "skill-overhead": 1,
  "mcp-candidate": ">=1",
  "redundant-read": 0,
  "retry-after-error": 0,
  "human-intervention": 0,
};
for (const [kind, exp] of Object.entries(expected)) {
  const actual = byKind[kind] ?? 0;
  let pass: boolean;
  if (typeof exp === "string" && exp.startsWith(">=")) {
    pass = actual >= parseInt(exp.slice(2));
  } else {
    pass = actual === exp;
  }
  console.log(`  ${pass ? "PASS" : "FAIL"} ${kind}: expected=${exp}, actual=${actual}`);
}

console.log("");
console.log("=== MCP unavailableMetrics ===", mcpResult.unavailableMetrics);
