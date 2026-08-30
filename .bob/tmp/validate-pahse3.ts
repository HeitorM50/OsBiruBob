import { readFileSync } from "fs";
import { join } from "path";
import { parseSession } from "../parser/parse-session";
import { createObserveReport } from "../observe/create-observe-report";
import { runAllDetectors, formatDiagnoseReport } from "../diagnose/run-all-detectors";

// Ler baseline
const baselinePath = join(__dirname, "../../benchmark/rodada-a.json");
const baselineContent = readFileSync(baselinePath, "utf-8");

// Parse e observe
const session = parseSession(baselineContent);
const report = createObserveReport(session);

// Rodar detectores
const result = runAllDetectors(report);

// Validar expectativas do baseline
console.log(formatDiagnoseReport(result));
console.log("");
console.log("Expected for baseline:");
console.log("  - project-rules-absent: 1");
console.log("  - unused-tool: 1");
console.log("  - skill-overhead: 1 (if implemented)");
console.log("  - mcp-candidate: 1 (if implemented)");
console.log("  - redundant-read: 0");
console.log("  - retry-after-error: 0");
console.log("  - human-intervention: 0");
console.log("");
console.log("Actual:");
for (const [kind, count] of Object.entries(result.findingsByKind)) {
  console.log(`  - ${kind}: ${count}`);
}