import { ObserveReport, Finding, ObserveAnomaly } from "../domain/types";
import { detectRedundantReads } from "./redundant-read";
import { detectHumanIntervention } from "./human-intervention";
// Importar os outros detectores conforme forem implementados

interface DetectorResult {
  name: string;
  findings: Finding[];
  error?: string;
}

interface DiagnoseReport {
  sessionId: string;
  exportedAt: number;
  detectors: DetectorResult[];
  totalFindings: number;
  findingsByKind: Record<string, number>;
}

/**
 * Rode todos os detectores sobre um ObserveReport.
 *
 * Cada detector é isolado: se um lançar exceção, os outros continuam.
 */
export function runAllDetectors(report: ObserveReport): DiagnoseReport {
  const detectors: DetectorResult[] = [];
  const allFindings: Finding[] = [];
  
  // Lista de detectores (adicionar conforme implementados)
  const detectorFns: Array<{ name: string; fn: (report: ObserveReport) => Finding[] }> = [
    { name: "redundant-read", fn: detectRedundantReads },
    { name: "human-intervention", fn: detectHumanIntervention },
    // { name: "retry-after-error", fn: detectRetryAfterError },
    // { name: "project-rules-absent", fn: detectProjectRulesAbsent },
    // { name: "unused-tool", fn: detectUnusedTool },
    // { name: "skill-overhead", fn: detectSkillOverhead },
    // { name: "mcp-candidate", fn: detectMcpCandidate },
  ];
  
  // Rodar cada detector, isolando exceções
  for (const detector of detectorFns) {
    try {
      const findings = detector.fn(report);
      detectors.push({
        name: detector.name,
        findings,
      });
      allFindings.push(...findings);
    } catch (error) {
      detectors.push({
        name: detector.name,
        findings: [],
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
  
  // Agrupar findings por kind
  const findingsByKind: Record<string, number> = {};
  for (const finding of allFindings) {
    findingsByKind[finding.kind] = (findingsByKind[finding.kind] || 0) + 1;
  }
  
  return {
    sessionId: report.sessionId,
    exportedAt: report.exportedAt,
    detectors,
    totalFindings: allFindings.length,
    findingsByKind,
  };
}

/**
 * Formata o relatório para saída humana (sem dados sensíveis).
 */
export function formatDiagnoseReport(report: DiagnoseReport): string {
  const lines: string[] = [];
  
  lines.push(`Session: ${report.sessionId}`);
  lines.push(`Exported At: ${new Date(report.exportedAt).toISOString()}`);
  lines.push(`Total Findings: ${report.totalFindings}`);
  lines.push("");
  lines.push("Findings by Kind:");
  
  for (const [kind, count] of Object.entries(report.findingsByKind)) {
    lines.push(`  ${kind}: ${count}`);
  }
  
  lines.push("");
  lines.push("Detectors:");
  
  for (const detector of report.detectors) {
    const status = detector.error ? `❌ ${detector.error}` : `✅ ${detector.findings.length} findings`;
    lines.push(`  ${detector.name}: ${status}`);
  }
  
  return lines.join("\n");
}