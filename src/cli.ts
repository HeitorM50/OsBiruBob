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
import type { ObserveReport } from "./domain/types";

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
      "",
      "Options:",
      "  --input <file>   Path to the Bob session export JSON",
      "  --demo           Run against fixtures/sample-export.json",
      "  --json           Emit the full ObserveReport JSON to stdout",
      "  --help           Show this help",
      "",
    ].join("\n")
  );
}

/** Parse CLI args — returns the input file path and flags. */
function parseArgs(argv: string[]): { inputPath: string; emitJson: boolean } {
  const args = argv.slice(2);

  if (args.includes("--help")) {
    usage();
    process.exit(0);
  }

  let inputPath: string | null = null;
  let emitJson = false;

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
    } else if (args[i] === "--json") {
      emitJson = true;
    }
  }

  if (inputPath === null) {
    die("No input file specified. Use --input <file> or --demo");
  }

  return { inputPath, emitJson };
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
    lines.push(`    Fixed overhead      ${task.context.fixedOverhead.toLocaleString()} tokens`);
    lines.push(`    Conversation        ${task.context.conversationTokens.toLocaleString()} tokens`);
    lines.push(`    Reported total      ${task.context.reportedTotal.toLocaleString()} tokens`);
    if (task.context.pressure !== null) {
      lines.push(`    Pressure            ${(task.context.pressure * 100).toFixed(1)}%`);
    } else {
      lines.push(`    Pressure            null  (no maxContextWindow configured)`);
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
// main — CLI entry point (Node only)
// ---------------------------------------------------------------------------

function main(): void {
  const { inputPath, emitJson } = parseArgs(process.argv);

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
