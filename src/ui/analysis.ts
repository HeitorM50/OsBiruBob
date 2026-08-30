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
          "This file is empty. Select a JSON export generated from the Tasks area in IBM Bob.",
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
          ? "This content is not valid JSON. Export the session again and select the file without editing it."
          : "This JSON does not match the structure of an IBM Bob session export. In Bob, use Tasks → export JSON.",
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
          "The export was read, but the analysis could not be completed. Try exporting the session again.",
      },
    };
  }
}
