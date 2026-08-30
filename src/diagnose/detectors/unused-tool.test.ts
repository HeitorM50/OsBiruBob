/**
 * Tests for the unused-tool detector (diagnose/detectors/unused-tool.ts)
 *
 * Covers:
 *  1. Baseline characterization — benchmark/rodada-a.json
 *  2. Complete tool usage (no idle tools → zero findings)
 *  3. Missing toolInventory → zero findings, no throw
 *  4. Empty available array → zero findings, no NaN
 *  5. Estimation flag verification (I-6)
 *  6. Multi-task: tasks with idle tools fire; tasks without do not
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import type { ObserveReport, TaskReport } from "../../domain/types";
import { parseSession } from "../../parser/index";
import { observe } from "../../observe/index";
import { detectUnusedTools } from "./unused-tool";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadReport(relativePath: string): ObserveReport {
  const abs = resolve(__dirname, "../../../", relativePath);
  const raw = readFileSync(abs, "utf-8");
  const parsed = parseSession(raw);
  if (!parsed.ok) throw new Error(`parse failed: ${parsed.error.message}`);
  return observe(parsed.value);
}

/** Build a minimal TaskReport for synthetic scenarios. */
function makeTask(
  taskId: string,
  available: string[],
  used: string[],
  idle: string[],
  toolDefinitionTokens = 5403,
): TaskReport {
  const idleRatio = available.length > 0 ? idle.length / available.length : null;
  const estimatedTokensPerTool =
    available.length > 0 ? toolDefinitionTokens / available.length : null;

  return {
    taskId,
    parentId: null,
    isSubtask: false,
    title: "[REDACTED]",
    modeId: "agent",
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_001_000,
    durationMs: 60_000,
    completed: true,
    cost: 0.1,
    contextTokens: 17_584,
    context: {
      fixedOverhead: 10_439,
      reportedTotal: 17_584,
      conversationTokens: 7_145,
      reportedTotalInconsistent: false,
      breakdown: {
        roleDefinition: 0,
        staticSections: 0,
        skills: 0,
        baseRules: 0,
        projectRules: 0,
        customInstructions: 0,
        environment: 0,
        toolSystemPrompts: 0,
        toolDefinitions: toolDefinitionTokens,
        mcpToolDefinitions: 0,
      },
      breakdownPct: {
        roleDefinition: 0,
        staticSections: 0,
        skills: 0,
        baseRules: 0,
        projectRules: 0,
        customInstructions: 0,
        environment: 0,
        toolSystemPrompts: 0,
        toolDefinitions: 1,
        mcpToolDefinitions: 0,
      },
      breakdownSumDelta: 0,
      breakdownSumConsistent: true,
      loadedSkills: [],
      maxContextWindow: null,
      pressure: null,
    },
    turns: [],
    toolCalls: [],
    toolInventory: {
      available,
      used,
      idle,
      idleRatio,
      toolDefinitionTokens,
      estimatedTokensPerTool,
    },
    externalCommands: [],
    humanInterventions: [],
    approval: {
      autoApprovalEnabled: false,
      allowedPermissions: ["read", "edit", "execute"],
      approvedCommands: [],
    },
  };
}

function makeReport(tasks: TaskReport[]): ObserveReport {
  return {
    sessionId: "test-session",
    exportedAt: 1_700_000_000_000,
    workspace: "file:///test",
    tasks,
    totals: {
      taskCount: tasks.length,
      subtaskCount: 0,
      cost: 0,
      assistantTurns: 0,
      toolCalls: 0,
      erroredToolCalls: 0,
      humanInterventions: 0,
    },
    unavailableMetrics: [],
    anomalies: [],
  };
}

// ---------------------------------------------------------------------------
// 1. Baseline characterization — benchmark/rodada-a.json
// ---------------------------------------------------------------------------

describe("detectUnusedTools — baseline characterization (rodada-a.json)", () => {
  const report = loadReport("benchmark/rodada-a.json");
  const findings = detectUnusedTools(report);

  it("produces exactly one Finding", () => {
    expect(findings).toHaveLength(1);
  });

  it("finding.kind is 'unused-tool'", () => {
    expect(findings[0].kind).toBe("unused-tool");
  });

  it("finding.confidence is 'high'", () => {
    expect(findings[0].confidence).toBe("high");
  });

  it("finding.prescriptionHint is 'disable-tool'", () => {
    expect(findings[0].prescriptionHint).toBe("disable-tool");
  });

  it("identifies exactly 18 unused tools", () => {
    const { unusedTools } = findings[0].evidence;
    expect(unusedTools).toBeDefined();
    expect(unusedTools!.length).toBe(18);
  });

  it("includes 'read_xlsx' in unused tools", () => {
    expect(findings[0].evidence.unusedTools).toContain("read_xlsx");
  });

  it("includes 'create_chart' in unused tools", () => {
    expect(findings[0].evidence.unusedTools).toContain("create_chart");
  });

  it("includes 'spawn_subagent' in unused tools", () => {
    expect(findings[0].evidence.unusedTools).toContain("spawn_subagent");
  });

  it("includes 'use_skill' in unused tools", () => {
    expect(findings[0].evidence.unusedTools).toContain("use_skill");
  });

  it("idleRatio is approximately 0.7826 (18/23)", () => {
    const rv = findings[0].evidence.rawValue as Record<string, unknown>;
    const idleRatio = rv.idleRatio as number;
    expect(Math.abs(idleRatio - 18 / 23)).toBeLessThan(1e-10);
  });

  it("tokenImpact is approximately 4230 tokens", () => {
    // 5403 / 23 ≈ 234.9 per tool; 18 × 234.9 ≈ 4228.7
    expect(findings[0].tokenImpact).toBeDefined();
    expect(Math.abs(findings[0].tokenImpact! - (5403 / 23) * 18)).toBeLessThan(1);
  });

  it("tokenImpactIsEstimate flag is true (I-6)", () => {
    const rv = findings[0].evidence.rawValue as Record<string, unknown>;
    expect(rv.tokenImpactIsEstimate).toBe(true);
  });

  it("evidence.redactable is false", () => {
    expect(findings[0].evidence.redactable).toBe(false);
  });

  it("finding has a session id", () => {
    expect(typeof findings[0].sessionId).toBe("string");
    expect(findings[0].sessionId.length).toBeGreaterThan(0);
  });

  it("finding has a task id", () => {
    expect(typeof findings[0].taskId).toBe("string");
    expect(findings[0].taskId.length).toBeGreaterThan(0);
  });
});

describe("detectUnusedTools — deterministic metadata", () => {
  it("uses report.exportedAt and produces identical Findings for identical input", () => {
    const report = loadReport("benchmark/rodada-a.json");
    const first = detectUnusedTools(report);
    const second = detectUnusedTools(report);

    expect(first).toEqual(second);
    expect(first[0].detectedAt).toBe(report.exportedAt);
  });
});

// ---------------------------------------------------------------------------
// 2. Complete tool usage — zero idle tools → zero findings
// ---------------------------------------------------------------------------

describe("detectUnusedTools — all tools used", () => {
  it("returns an empty array when idle list is empty", () => {
    const tools = ["read_file", "write_file", "list_files"];
    const report = makeReport([makeTask("t1", tools, tools, [])]);
    const findings = detectUnusedTools(report);
    expect(findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Missing toolInventory → zero findings, no throw
// ---------------------------------------------------------------------------

describe("detectUnusedTools — missing toolInventory", () => {
  it("returns an empty array when toolInventory is absent", () => {
    const task = makeTask("t1", [], [], []);
    // Simulate missing inventory by deleting the key entirely
    const taskAny = task as unknown as Record<string, unknown>;
    delete taskAny["toolInventory"];
    const report = makeReport([task]);
    expect(() => detectUnusedTools(report)).not.toThrow();
    expect(detectUnusedTools(report)).toHaveLength(0);
  });

  it("returns an empty array when toolInventory is null", () => {
    const task = makeTask("t1", [], [], []);
    (task as unknown as Record<string, unknown>)["toolInventory"] = null;
    const report = makeReport([task]);
    expect(detectUnusedTools(report)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Empty available array → zero findings, no NaN / division-by-zero
// ---------------------------------------------------------------------------

describe("detectUnusedTools — empty available array", () => {
  it("returns no findings when available is empty", () => {
    const report = makeReport([makeTask("t1", [], [], [])]);
    const findings = detectUnusedTools(report);
    expect(findings).toHaveLength(0);
  });

  it("does not produce NaN or Infinity in idleRatio", () => {
    // available === [] means estimatedTokensPerTool === null; no division.
    const report = makeReport([makeTask("t1", [], [], [])]);
    // No finding is emitted, so no NaN can appear in the output.
    const findings = detectUnusedTools(report);
    expect(findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Estimation flag verification (I-6)
// ---------------------------------------------------------------------------

describe("detectUnusedTools — estimation flag (I-6)", () => {
  it("rawValue.tokenImpactIsEstimate is always true when tokenImpact is present", () => {
    const tools = ["a", "b", "c", "d"];
    const used = ["a"];
    const idle = ["b", "c", "d"];
    const report = makeReport([makeTask("t1", tools, used, idle, 1000)]);
    const [finding] = detectUnusedTools(report);
    expect(finding).toBeDefined();
    const rv = finding.evidence.rawValue as Record<string, unknown>;
    expect(rv.tokenImpactIsEstimate).toBe(true);
  });

  it("description text contains 'estimate'", () => {
    const tools = ["a", "b", "c"];
    const used = ["a"];
    const idle = ["b", "c"];
    const report = makeReport([makeTask("t1", tools, used, idle, 900)]);
    const [finding] = detectUnusedTools(report);
    expect(finding.description?.toLowerCase()).toContain("estimate");
  });
});

// ---------------------------------------------------------------------------
// 6. Multi-task: mixed idle and fully-used tasks
// ---------------------------------------------------------------------------

describe("detectUnusedTools — multi-task report", () => {
  const allTools = ["t1", "t2", "t3"];
  const taskWithIdle = makeTask("task-a", allTools, ["t1"], ["t2", "t3"]);
  const taskFullyUsed = makeTask("task-b", allTools, allTools, []);
  const report = makeReport([taskWithIdle, taskFullyUsed]);
  const findings = detectUnusedTools(report);

  it("produces one finding for the task with idle tools", () => {
    expect(findings).toHaveLength(1);
  });

  it("finding is for the task that has idle tools (task-a)", () => {
    expect(findings[0].taskId).toBe("task-a");
  });

  it("does not fire for the fully-used task (task-b)", () => {
    expect(findings.every((f) => f.taskId !== "task-b")).toBe(true);
  });
});
