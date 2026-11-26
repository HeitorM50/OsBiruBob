import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import type { ContextSummary, ObserveReport } from "../domain/types";
import { observe } from "../observe/index";
import { parseSession } from "../parser/index";
import {
  detectSkillOverhead,
  detectSkillOverheadWithStatus,
  SKILL_LOADED_SKILLS_UNAVAILABLE_PREFIX,
} from "./skill-overhead";

const SKILLS_PATH =
  "tasks[0].task.costs.contextWindowBreakdown.breakdown.skills";

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

function metricObject(
  value: unknown,
  field: string
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Expected metric.${field} to be an object`);
  }
  return value as Record<string, unknown>;
}

describe("detectSkillOverhead", () => {
  const baselineReport = loadBaselineReport();

  it("detects the measured skill overhead in benchmark/rodada-a.json", () => {
    const [finding] = detectSkillOverhead(baselineReport);
    const baselineTask = baselineReport.tasks[0];

    expect(detectSkillOverhead(baselineReport)).toHaveLength(1);
    expect(finding).toMatchObject({
      id: `skill-overhead:${baselineReport.sessionId}:${baselineTask.taskId}`,
      sessionId: baselineReport.sessionId,
      taskId: baselineTask.taskId,
      kind: "skill-overhead",
      detectedAt: baselineReport.exportedAt,
      confidence: "high",
      evidence: {
        type: "breakdown",
        redactable: false,
        fieldPath: SKILLS_PATH,
        breakdownField: "skills",
        breakdownValue: 1_541,
      },
      prescriptionHint: "disable-skill",
      tokenImpact: 1_541,
      metric: {
        skillTokens: 1_541,
        measuredSkillTokens: 1_541,
        loadedSkills: [],
      },
    });
  });

  it("reports the unrounded percentage over the fixed overhead", () => {
    const [finding] = detectSkillOverhead(baselineReport);
    const percentage = finding.metric.percentageOfFixedOverhead;

    expect(percentage).toBe((1_541 / 10_439) * 100);
    expect(percentage).toBeCloseTo(14.8, 1);
  });

  it("labels breakdown.skills overhead as measured (estimated: false), not contradictory", () => {
    const [finding] = detectSkillOverhead(baselineReport);
    const tokenImpact = metricObject(
      finding.metric.tokenImpact,
      "tokenImpact"
    );

    expect(tokenImpact).toEqual({
      tokens: 1_541,
      estimated: false,
      basis: "measured directly from contextWindowBreakdown.breakdown.skills",
    });
    expect(finding.estimationBasis).toContain("Settings → Skills");
  });

  it("does not flag paid skills when at least one loaded skill is declared", () => {
    const report = structuredClone(baselineReport);
    report.tasks[0].context!.loadedSkills = ["implement-pipeline-module"];

    expect(detectSkillOverhead(report)).toEqual([]);
  });

  it("does not flag an empty skill slice", () => {
    const report = structuredClone(baselineReport);
    report.tasks[0].context!.breakdown.skills = 0;
    report.tasks[0].context!.breakdownPct.skills = 0;

    expect(detectSkillOverhead(report)).toEqual([]);
  });

  it("treats an absent loadedSkills field as unavailable, never as empty (I-6)", () => {
    const report = structuredClone(baselineReport);
    delete (report.tasks[0].context as Partial<ContextSummary>).loadedSkills;

    const status = detectSkillOverheadWithStatus(report);
    expect(status.findings).toEqual([]);
    expect(status.unavailableMetrics).toEqual([
      `${SKILL_LOADED_SKILLS_UNAVAILABLE_PREFIX}${report.tasks[0].taskId}`,
    ]);
    expect(detectSkillOverhead(report)).toEqual([]);
  });

  it("ignores subtasks (parentId !== null / isSubtask: true) (I-5)", () => {
    const report = structuredClone(baselineReport);
    const subtask = structuredClone(report.tasks[0]);
    subtask.taskId = "subtask-1";
    subtask.parentId = report.tasks[0].taskId;
    subtask.isSubtask = true;
    report.tasks.push(subtask);

    const findings = detectSkillOverhead(report);
    expect(findings).toHaveLength(1);
    expect(findings[0].taskId).toBe(report.tasks[0].taskId);
  });

  it("emits at most one finding per qualifying root task", () => {
    const report = structuredClone(baselineReport);
    const secondTask = structuredClone(report.tasks[0]);
    secondTask.taskId = "second-task";
    report.tasks.push(secondTask);

    const findings = detectSkillOverhead(report);

    expect(findings).toHaveLength(2);
    expect(findings.map((finding) => finding.taskId)).toEqual([
      report.tasks[0].taskId,
      "second-task",
    ]);
    expect(findings[1].evidence.fieldPath).toBe(
      "tasks[1].task.costs.contextWindowBreakdown.breakdown.skills"
    );
  });

  it("is deterministic, side-effect free, and returns detached skill lists", () => {
    const report = structuredClone(baselineReport);
    const before = structuredClone(report);

    const first = detectSkillOverhead(report);
    const second = detectSkillOverhead(report);

    expect(first).toEqual(second);
    expect(report).toEqual(before);

    (first[0].metric.loadedSkills as string[]).push("mutated-result");
    expect(report.tasks[0].context!.loadedSkills).toEqual([]);
  });
});
