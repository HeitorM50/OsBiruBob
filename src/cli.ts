/**
 * CLI entry point — Hindsight (Phase 2 exit gate)
 *
 * Responsibility:
 *  - Read the export file from disk (the ONLY module allowed to use fs).
 *  - Invoke the pure pipeline: parseSession → observe.
 *  - Emit a human-readable summary to stdout.
 *  - Emit the full ObserveReport as JSON to stdout when --json is requested.
 *  - Exit with code 1 on any error; provide an actionable message to stderr.
 *
 * Redacts sensitive data (message content, tool arguments) before display.
 * Demo mode loads fixtures/sample-export.json — no credentials, no network.
 *
 * The core pipeline (parseSession + observe) is pure and browser-safe.
 * Only this file uses Node APIs (fs, path, process).
 */

import { readFileSync } from "fs";
import { join } from "path";
import { parseSession } from "./parser/index";
import { observe } from "./observe/index";
import { toPublicReport } from "./observe/public-report";
import { diagnoseWithCatalogs } from "./diagnose/index";
import { compare } from "./compare/index";
import type { ObserveReport, Comparison } from "./domain/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function die(message: string): never {
  process.stderr.write(`\nHindsight error: ${message}\n\n`);
  process.exit(1);
}

function usage(): void {
  process.stdout.write(
    [
      "",
      "Hindsight — Phase 2 pipeline (parser + observe)",
      "",
      "Usage:",
      "  npx tsx src/cli.ts --input <path/to/export.json> [--json]",
      "  npx tsx src/cli.ts --demo [--json]",
      "  npx tsx src/cli.ts --compare <fileA> <fileB>",
      "",
      "Options:",
      "  --input <file>        Path to the Bob session export JSON",
      "  --demo                Run against fixtures/sample-export.json",
      "  --json                Emit the full ObserveReport JSON to stdout",
      "  --compare <a> <b>     Compare two exports and print a delta table",
      "  --help                Show this help",
      "",
    ].join("\n")
  );
}

/** Parse CLI args — returns the input file path and flags. */
function parseArgs(argv: string[]): {
  inputPath: string | null;
  emitJson: boolean;
  compareA: string | null;
  compareB: string | null;
} {
  const args = argv.slice(2);

  if (args.includes("--help")) {
    usage();
    process.exit(0);
  }

  let inputPath: string | null = null;
  let emitJson = false;
  let compareA: string | null = null;
  let compareB: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--demo") {
      inputPath = join(process.cwd(), "fixtures", "sample-export.json");
    } else if (args[i] === "--input") {
      const next = args[i + 1];
      if (!next || next.startsWith("--")) {
        die("--input requires a file path argument");
      }
      inputPath = next;
      i++;
    } else if (args[i] === "--compare") {
      const a = args[i + 1];
      const b = args[i + 2];
      if (!a || a.startsWith("--") || !b || b.startsWith("--")) {
        die("--compare requires two file path arguments: --compare <fileA> <fileB>");
      }
      compareA = a;
      compareB = b;
      i += 2;
    } else if (args[i] === "--json") {
      emitJson = true;
    }
  }

  if (compareA === null && inputPath === null) {
    die("No input file specified. Use --input <file>, --demo, or --compare <a> <b>");
  }

  return { inputPath, emitJson, compareA, compareB };
}

// ---------------------------------------------------------------------------
// Human-readable output
// ---------------------------------------------------------------------------

/**
 * Format the ObserveReport as a human-readable CLI summary.
 * No sensitive fields (message content, tool arguments, task title, paths) are
 * included in the output.
 */
function formatReport(report: ObserveReport): string {
  const lines: string[] = [];
  const diagnosis = diagnoseWithCatalogs(report);

  lines.push("");
  lines.push("┌─ Hindsight — ObserveReport ──────────────────────────────────┐");

  // Session overview
  lines.push("");
  lines.push(`  Session     ${report.sessionId.slice(0, 12)}…`);
  lines.push(`  Workspace   [REDACTED]`);
  lines.push(`  Tasks       ${report.totals.taskCount} root  /  ${report.totals.subtaskCount} subtask(s)`);

  // Totals
  lines.push("");
  lines.push("  ── Totals (root tasks only) ──────────────────────────────────");
  lines.push(`  Cost                 $${report.totals.cost.toFixed(6)}`);
  lines.push(`  Assistant turns      ${report.totals.assistantTurns}`);
  lines.push(`  Tool calls           ${report.totals.toolCalls}`);
  lines.push(`  Errored tool calls   ${report.totals.erroredToolCalls}`);
  lines.push(`  Human interventions  ${report.totals.humanInterventions}`);
  lines.push(`  Diagnostic findings  ${diagnosis.findings.length}`);

  // Per-task detail
  for (const task of report.tasks) {
    const prefix = task.isSubtask ? "[subtask] " : "";
    lines.push("");
    lines.push(`  ── Task ${prefix}${task.taskId.slice(0, 12)}… ─────────────────────────────────`);
    lines.push(`  Mode      ${task.modeId}`);
    lines.push(`  Duration  ${(task.durationMs / 1000).toFixed(1)}s`);
    lines.push(`  Completed ${task.completed ? "yes ✓" : "no"}`);
    lines.push(`  Cost      $${task.cost.toFixed(6)}`);
    lines.push("");
    lines.push("  Context window:");
    const ctx = task.context;
    if (ctx === null) {
      lines.push(`    unavailable  (no breakdown in export — task is completed)`);
    } else {
      lines.push(`    Fixed overhead      ${ctx.fixedOverhead.toLocaleString()} tokens`);
      lines.push(`    Conversation        ${ctx.conversationTokens.toLocaleString()} tokens`);
      lines.push(`    Reported total      ${ctx.reportedTotal.toLocaleString()} tokens`);
      if (ctx.pressure !== null) {
        lines.push(`    Pressure            ${(ctx.pressure * 100).toFixed(1)}%`);
      } else {
        lines.push(`    Pressure            null  (no maxContextWindow configured)`);
      }
    }
    lines.push("");
    lines.push("  Tool inventory:");
    if (task.toolInventory === null) {
      lines.push(`    (unavailable — availableTools absent from export)`);
    } else {
      const inv = task.toolInventory;
      const idleRatioPct = inv.idleRatio !== null ? `${(inv.idleRatio * 100).toFixed(1)}%` : "n/a";
      lines.push(`    Available  ${inv.available.length}`);
      lines.push(`    Used       ${inv.used.length}  (${inv.used.join(", ")})`);
      lines.push(`    Idle       ${inv.idle.length}  (idle ratio: ${idleRatioPct})`);
      lines.push(`    Tool defs  ${inv.toolDefinitionTokens} tokens`);
      if (inv.estimatedTokensPerTool !== null) {
        lines.push(`    Est. tokens/tool  ${inv.estimatedTokensPerTool} (estimate)`);
      }
    }
    if (task.externalCommands.length > 0) {
      lines.push("");
      lines.push(`  External commands (${task.externalCommands.length}):`);
      for (const cmd of task.externalCommands) {
        lines.push(`    [turn ${cmd.turnIndex}] ${cmd.binaries.join(", ")}${cmd.isHttp ? "  [http]" : ""}`);
      }
    }
    if (task.isSubtask) {
      lines.push(`  (subtask — excluded from totals)`);
    }
  }

  // Unavailable metrics
  lines.push("");
  lines.push("  ── Unavailable metrics ───────────────────────────────────────");
  lines.push(`  ${report.unavailableMetrics.join(", ")}`);
  if (diagnosis.unavailableMetrics.length > 0) {
    lines.push(`  ${diagnosis.unavailableMetrics.join(", ")}`);
  }

  // Anomalies
  if (report.anomalies.length > 0) {
    lines.push("");
    lines.push(`  ── Anomalies (${report.anomalies.length}) ──────────────────────────────────────`);
    for (const a of report.anomalies) {
      lines.push(`  [${a.kind}] ${a.detail}`);
    }
  }

  lines.push("");
  lines.push("└──────────────────────────────────────────────────────────────┘");
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// runObserve — pure orchestration (no Node APIs — testable without fs)
// ---------------------------------------------------------------------------

/**
 * Pure orchestration: takes raw export content (string) and returns
 * { ok: true, report } or { ok: false, message }.
 *
 * No file system access. Browser-safe. Can be called identically in Node and
 * browser (src/ui/).
 */
export function runObserve(
  content: string,
  maxContextWindow: number | null = null
): { ok: true; report: ObserveReport } | { ok: false; message: string } {
  const parseResult = parseSession(content);
  if (!parseResult.ok) {
    return {
      ok: false,
      message: `Parse failed: ${parseResult.error.message}`,
    };
  }
  const report = observe(parseResult.value, maxContextWindow);
  return { ok: true, report };
}

// ---------------------------------------------------------------------------
// formatComparison — human-readable delta table
// ---------------------------------------------------------------------------

/**
 * Format a Comparison as a human-readable CLI table.
 * Sensitive data (session IDs are not content — they are safe to show truncated).
 */
function formatComparison(cmp: Comparison): string {
  const lines: string[] = [];
  const m = cmp.metrics;

  lines.push("");
  lines.push("┌─ Hindsight — Comparison ─────────────────────────────────────┐");
  lines.push("");
  lines.push(`  Session A   ${cmp.sessionIdA.slice(0, 12)}…`);
  lines.push(`  Session B   ${cmp.sessionIdB.slice(0, 12)}…`);
  lines.push(`  Valid       ${cmp.valid ? "yes ✓" : `no — ${cmp.invalidReason ?? "unknown reason"}`}`);

  lines.push("");
  lines.push("  ── Calculated metrics ────────────────────────────────────────");

  const sign = (n: number): string => (n > 0 ? `+${n}` : String(n));
  const signF = (n: number, decimals: number): string =>
    (n > 0 ? "+" : "") + n.toFixed(decimals);

  lines.push(`  ${"Metric".padEnd(28)} ${"Round A".padStart(12)} ${"Round B".padStart(12)} ${"Delta".padStart(12)}`);
  lines.push(`  ${"─".repeat(28)} ${"─".repeat(12)} ${"─".repeat(12)} ${"─".repeat(12)}`);
  lines.push(
    `  ${"Cost (USD)".padEnd(28)} ${`$${m.costA.toFixed(6)}`.padStart(12)} ${`$${m.costB.toFixed(6)}`.padStart(12)} ${signF(m.costDelta, 6).padStart(12)}`
  );
  lines.push(
    `  ${"Fixed overhead (tokens)".padEnd(28)} ${String(m.fixedOverheadA).padStart(12)} ${String(m.fixedOverheadB).padStart(12)} ${sign(m.fixedOverheadDelta).padStart(12)}`
  );
  lines.push(
    `  ${"Context tokens".padEnd(28)} ${String(m.contextTokensA).padStart(12)} ${String(m.contextTokensB).padStart(12)} ${sign(m.contextTokensDelta).padStart(12)}`
  );
  lines.push(
    `  ${"Assistant turns".padEnd(28)} ${String(m.assistantTurnsA).padStart(12)} ${String(m.assistantTurnsB).padStart(12)} ${sign(m.assistantTurnsDelta).padStart(12)}`
  );
  lines.push(
    `  ${"Human interventions".padEnd(28)} ${String(m.humanInterventionsA).padStart(12)} ${String(m.humanInterventionsB).padStart(12)} ${sign(m.humanInterventionsDelta).padStart(12)}`
  );

  if (m.projectRulesTokensA !== undefined || m.projectRulesTokensB !== undefined) {
    const a = m.projectRulesTokensA !== undefined ? String(m.projectRulesTokensA) : "n/a";
    const b = m.projectRulesTokensB !== undefined ? String(m.projectRulesTokensB) : "n/a";
    lines.push(
      `  ${"Project rules (tokens)".padEnd(28)} ${a.padStart(12)} ${b.padStart(12)} ${"—".padStart(12)}`
    );
  }

  lines.push("");
  lines.push("  ── Metrics unavailable in export ─────────────────────────────");
  lines.push("  build failures          not derivable from export — set manually");

  lines.push("");
  lines.push("└──────────────────────────────────────────────────────────────┘");
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// main — CLI entry point (Node only)
// ---------------------------------------------------------------------------

function main(): void {
  const { inputPath, emitJson, compareA, compareB } = parseArgs(process.argv);

  // ── Compare mode ──────────────────────────────────────────────────────────
  if (compareA !== null && compareB !== null) {
    let contentA: string;
    let contentB: string;

    try {
      contentA = readFileSync(compareA, "utf-8");
    } catch (err) {
      die(`Cannot read file "${compareA}": ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      contentB = readFileSync(compareB, "utf-8");
    } catch (err) {
      die(`Cannot read file "${compareB}": ${err instanceof Error ? err.message : String(err)}`);
    }

    const resultA = runObserve(contentA);
    if (!resultA.ok) die(`Parse failed for file A: ${resultA.message}`);

    const resultB = runObserve(contentB);
    if (!resultB.ok) die(`Parse failed for file B: ${resultB.message}`);

    const cmp = compare(resultA.report, resultB.report);
    process.stdout.write(formatComparison(cmp));
    return;
  }

  // ── Single-file observe mode ──────────────────────────────────────────────
  if (inputPath === null) {
    die("No input file specified. Use --input <file>, --demo, or --compare <a> <b>");
  }

  // Read file — the ONLY fs operation in the entire pipeline
  let content: string;
  try {
    content = readFileSync(inputPath, "utf-8");
  } catch (err) {
    die(
      `Cannot read file "${inputPath}": ${err instanceof Error ? err.message : String(err)}\n` +
        `  Verify the path exists and is readable.`
    );
  }

  const result = runObserve(content);
  if (!result.ok) {
    die(result.message);
  }

  const { report } = result;

  if (emitJson) {
    // Emit a redacted projection — workspace, task titles, tool arguments,
    // external command raw text, and human intervention content are replaced
    // with [REDACTED] to prevent accidental leakage.
    process.stdout.write(JSON.stringify(toPublicReport(report), null, 2) + "\n");
  } else {
    process.stdout.write(formatReport(report));
  }
}

// Only run as CLI entrypoint — not when imported as a module (tests, UI).
// tsx sets import.meta.url; when run directly the url matches the argv[1] path.
// Vitest imports this file as a module, so process.argv[1] will not be this file.
if (
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("cli.ts") || process.argv[1].endsWith("cli.js"))
) {
  main();
}
