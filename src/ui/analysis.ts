import type { DiagnoseResult, ObserveReport } from "../domain/types";
import { diagnoseWithCatalogs } from "../diagnose";
import { observe } from "../observe";
import { parseSession } from "../parser";

export type AnalysisSource = "demo" | "file";

export interface AnalyzedExport {
  fileName: string;
  source: AnalysisSource;
  report: ObserveReport;
  diagnosis: DiagnoseResult;
}

export type AnalysisErrorCode =
  | "empty-file"
  | "invalid-json"
  | "not-bob-export"
  | "analysis-failed";

export interface AnalysisError {
  fileName: string;
  code: AnalysisErrorCode;
  message: string;
}

export type AnalysisResult =
  | { ok: true; value: AnalyzedExport }
  | { ok: false; error: AnalysisError };

/**
 * Run the browser-safe analysis pipeline without retaining or exposing raw input.
 * Every failure becomes an actionable UI result; untrusted parser details are not
 * forwarded verbatim to the presentation layer.
 */
export function analyzeExport(
  raw: string,
  fileName: string,
  source: AnalysisSource,
  maxContextWindow: number | null = null
): AnalysisResult {
  if (raw.trim().length === 0) {
    return {
      ok: false,
      error: {
        fileName,
        code: "empty-file",
        message:
          "O arquivo está vazio. Selecione um export JSON gerado pela área Tasks do IBM Bob.",
      },
    };
  }

  const parsed = parseSession(raw);
  if (!parsed.ok) {
    const invalidJson = parsed.error.message.startsWith("Invalid JSON:");
    return {
      ok: false,
      error: {
        fileName,
        code: invalidJson ? "invalid-json" : "not-bob-export",
        message: invalidJson
          ? "O conteúdo não é JSON válido. Exporte a sessão novamente e selecione o arquivo sem editá-lo."
          : "O JSON não tem a estrutura esperada de um export de sessão do IBM Bob. No Bob, use Tasks → export JSON.",
      },
    };
  }

  try {
    const report = observe(parsed.value, maxContextWindow);
    const diagnosis = diagnoseWithCatalogs(report);
    return {
      ok: true,
      value: { fileName, source, report, diagnosis },
    };
  } catch {
    return {
      ok: false,
      error: {
        fileName,
        code: "analysis-failed",
        message:
          "O export foi lido, mas a análise não pôde ser concluída. Tente exportar a sessão novamente.",
      },
    };
  }
}
