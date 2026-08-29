import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import type {
  ContextSummary,
  ObserveReport,
  TaskReport,
} from "../domain/types";
import { observe } from "../observe/index";
import { parseSession } from "../parser/index";
import { detectProjectRulesAbsent } from "./project-rules-absent";

const PROJECT_RULES_PATH =
  "tasks[0].task.costs.contextWindowBreakdown.breakdown.projectRules";

const BREAKDOWN_FIELDS = [
  "roleDefinition",
  "staticSections",
  "skills",
  "baseRules",
  "projectRules",
  "customInstructions",
  "environment",
  "toolSystemPrompts",
  "toolDefinitions",
  "mcpToolDefinitions",
] as const;

function loadBaselineReport(): ObserveReport {
  const raw = readFileSync(
    join(process.cwd(), "benchmark/rodada-a.json"),
    "utf-8"
  );
  const parsed = parseSession(raw);
  if (!parsed.ok) {
    throw new Error(`Baseline parse failed: ${parsed.error.message}`);
  }

  return observe(parsed.value);
}

function makeTaskReport(taskId: string, context: ContextSummary): TaskReport {
  return {
    taskId,
    parentId: null,
    isSubtask: false,
    title: "[REDACTED]",
    modeId: "synthetic-test-mode",
    createdAt: 1_787_958_109_275,
    updatedAt: 1_787_958_332_549,
    durationMs: 223_274,
    completed: true,
    cost: 0.336902,
    contextTokens: context.reportedTotal,
    context,
    turns: [],
    toolCalls: [],
    toolInventory: {
      available: [],
      used: [],
      idle: [],
      idleRatio: 0,
      toolDefinitionTokens: context.breakdown.toolDefinitions,
      estimatedTokensPerTool: null,
    },
    externalCommands: [],
    humanInterventions: [],
    approval: {
      autoApprovalEnabled: false,
      allowedPermissions: [],
      approvedCommands: [],
    },
  };
}

function makeReport(
  tasks: TaskReport[],
  unavailableMetrics: string[] = []
): ObserveReport {
  return {
    sessionId: "baseline-session",
    exportedAt: 1_787_958_446_197,
    workspace: "[REDACTED]",
    tasks,
    totals: {
      taskCount: tasks.filter((task) => !task.isSubtask).length,
      subtaskCount: tasks.filter((task) => task.isSubtask).length,
      cost: 0,
      assistantTurns: 0,
      toolCalls: 0,
      erroredToolCalls: 0,
      humanInterventions: 0,
    },
    unavailableMetrics,
    anomalies: [],
  };
}

function withProjectRules(
  context: ContextSummary,
  projectRules: number
): ContextSummary {
  return {
    ...context,
    breakdown: { ...context.breakdown, projectRules },
    breakdownPct: {
      ...context.breakdownPct,
      projectRules:
        context.fixedOverhead > 0
          ? (projectRules / context.fixedOverhead) * 100
          : 0,
    },
  };
}

function withoutProjectRules(context: ContextSummary): ContextSummary {
  const breakdown: Record<string, number> = { ...context.breakdown };
  const breakdownPct: Record<string, number> = { ...context.breakdownPct };
  delete breakdown.projectRules;
  delete breakdownPct.projectRules;

  // The current F2 type requires known breakdown fields. This cast models a
  // forward-compatible ObserveReport where that source metric is unavailable.
  return {
    ...context,
    breakdown: breakdown as ContextSummary["breakdown"],
    breakdownPct: breakdownPct as ContextSummary["breakdownPct"],
  };
}

function metricRecord(
  value: unknown,
  field: string
): Record<string, number> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Expected metric.${field} to be an object`);
  }
  return value as Record<string, number>;
}

describe("detectProjectRulesAbsent", () => {
  const baselineReport = loadBaselineReport();
  const baselineContext = baselineReport.tasks[0].context;

  it("emits exactly one traceable finding for benchmark/rodada-a.json", () => {
    const findings = detectProjectRulesAbsent(baselineReport);
    const baselineTask = baselineReport.tasks[0];

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      id: `project-rules-absent:${baselineReport.sessionId}:${baselineTask.taskId}`,
      sessionId: baselineReport.sessionId,
      taskId: baselineTask.taskId,
      kind: "project-rules-absent",
      detectedAt: baselineReport.exportedAt,
      confidence: "high",
      prescriptionHint: "agents-md-file",
      evidence: {
        type: "breakdown",
        redactable: false,
        fieldPath: PROJECT_RULES_PATH,
        breakdownField: "projectRules",
        breakdownValue: 0,
      },
    });
  });

  it("carries all ten origins and unrounded percentages over total 10439", () => {
    const [finding] = detectProjectRulesAbsent(baselineReport);
    const breakdown = metricRecord(finding.metric.breakdown, "breakdown");
    const breakdownPct = metricRecord(
      finding.metric.breakdownPct,
      "breakdownPct"
    );

    expect(finding.metric.total).toBe(10_439);
    expect(Object.keys(breakdown)).toEqual(BREAKDOWN_FIELDS);
    expect(Object.keys(breakdownPct)).toEqual(BREAKDOWN_FIELDS);
    for (const field of BREAKDOWN_FIELDS) {
      expect(breakdownPct[field]).toBe((breakdown[field] / 10_439) * 100);
    }
    expect(breakdown.projectRules).toBe(0);
    expect(breakdownPct.projectRules).toBe(0);
  });

  it("does not emit a finding when projectRules is greater than zero", () => {
    const context = withProjectRules(baselineContext, 321);
    const report = makeReport([makeTaskReport("configured-task", context)]);

    expect(detectProjectRulesAbsent(report)).toEqual([]);
  });

  it("treats an absent projectRules metric as unavailable, never as zero", () => {
    const context = withoutProjectRules(baselineContext);
    const report = makeReport(
      [makeTaskReport("missing-metric-task", context)],
      [PROJECT_RULES_PATH]
    );

    expect(report.unavailableMetrics).toContain(PROJECT_RULES_PATH);
    expect(
      Object.prototype.hasOwnProperty.call(
        report.tasks[0].context.breakdown,
        "projectRules"
      )
    ).toBe(false);
    expect(detectProjectRulesAbsent(report)).toEqual([]);
  });

  it("emits one finding for the correct task and uses its array index in fieldPath", () => {
    const configured = makeTaskReport(
      "configured-task",
      withProjectRules(baselineContext, 200)
    );
    const absent = makeTaskReport("absent-task", baselineContext);
    const report = makeReport([configured, absent]);

    const findings = detectProjectRulesAbsent(report);

    expect(findings).toHaveLength(1);
    expect(findings[0].taskId).toBe("absent-task");
    expect(findings[0].evidence.fieldPath).toBe(
      "tasks[1].task.costs.contextWindowBreakdown.breakdown.projectRules"
    );
  });

  it("is deterministic, does not mutate its input, and returns detached metric objects", () => {
    const report = makeReport([
      makeTaskReport("baseline-task", baselineContext),
    ]);
    const before = structuredClone(report);

    const first = detectProjectRulesAbsent(report);
    const second = detectProjectRulesAbsent(report);

    expect(first).toEqual(second);
    expect(report).toEqual(before);

    const returnedBreakdown = metricRecord(
      first[0].metric.breakdown,
      "breakdown"
    );
    returnedBreakdown.projectRules = 999;
    expect(report.tasks[0].context.breakdown.projectRules).toBe(0);
  });
});
