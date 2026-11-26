/**
 * Tests for the unused-tool detector (diagnose/detectors/unused-tool.ts)
 *
 * Covers:
 *  1. Baseline characterization with real tool-catalog.json (benchmark/rodada-a.json)
 *  2. Protected search/diff tools (grep, glob, apply_diff) never appear as candidates
 *  3. Unknown tools fall back to group "other" (never "outros")
 *  4. Subtasks (parentId !== null / isSubtask: true) are excluded (I-5)
 *  5. Bob-group-based estimation (I-6) with explicit estimationBasis
 *  6. Edge cases: all tools used, missing/null inventory, empty available, multi-task
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import type {
  ObserveReport,
  TaskReport,
  ToolCatalogEntry,
} from "../../domain/types";
import { parseSession } from "../../parser/index";
import { observe } from "../../observe/index";
import {
  BOB_TOOL_GROUPS,
  detectUnusedTools,
  PROTECTED_TOOLS,
  UNKNOWN_TOOL_GROUP,
} from "./unused-tool";

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

function loadToolCatalogJson(): ToolCatalogEntry[] {
  const abs = resolve(__dirname, "../../../data/tool-catalog.json");
  return JSON.parse(readFileSync(abs, "utf-8")) as ToolCatalogEntry[];
}

/** Build a minimal TaskReport for synthetic scenarios. */
function makeTask(
  taskId: string,
  available: string[],
  used: string[],
  idle: string[],
  toolDefinitionTokens = 5403,
  overrides: Partial<TaskReport> = {}
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
    ...overrides,
  };
}

function makeReport(tasks: TaskReport[]): ObserveReport {
  return {
    sessionId: "test-session",
    exportedAt: 1_700_000_000_000,
    workspace: "file:///test",
    tasks,
    totals: {
      taskCount: tasks.filter((t) => !t.isSubtask).length,
      subtaskCount: tasks.filter((t) => t.isSubtask).length,
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
// 1. Baseline characterization with real tool-catalog.json (rodada-a.json)
// ---------------------------------------------------------------------------

describe("detectUnusedTools — baseline characterization (rodada-a.json + tool-catalog.json)", () => {
  const report = loadReport("benchmark/rodada-a.json");
  const catalog = loadToolCatalogJson();
  const findings = detectUnusedTools(report, catalog);

  it("produces exactly one Finding", () => {
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("unused-tool");
    expect(findings[0].confidence).toBe("high");
    expect(findings[0].prescriptionHint).toBe("disable-tool");
    expect(findings[0].evidence.redactable).toBe(false);
  });

  it("maps tool-catalog.json only to real Bob groups or 'other' (no invented groups)", () => {
    const allowedGroups = new Set<string>([...BOB_TOOL_GROUPS, UNKNOWN_TOOL_GROUP]);
    for (const entry of catalog) {
      expect(allowedGroups.has(entry.group), `Invalid group "${entry.group}" for ${entry.name}`).toBe(true);
    }
    expect(catalog.find((e) => e.name === "read_file")?.group).toBe("read");
    expect(catalog.find((e) => e.name === "list_files")?.group).toBe("read");
    expect(catalog.find((e) => e.name === "apply_diff")?.group).toBe("edit");
  });

  it("never suggests grep, glob, or apply_diff as disable candidates", () => {
    const candidates = findings[0].evidence.unusedTools ?? [];
    for (const protectedTool of ["grep", "glob", "apply_diff"]) {
      expect(candidates).not.toContain(protectedTool);
    }
  });

  it("identifies the exact retained and disableable Bob groups", () => {
    expect(findings[0].metric.retainedBobGroups).toEqual([
      "read",
      "edit",
      "execute",
      "todo",
    ]);
    expect(findings[0].metric.disableableBobGroups).toEqual([
      "skill",
      "subtask",
      "subagent",
      "mode",
      "workflow",
    ]);
  });

  it("excludes idle tools locked inside active Bob groups (read, edit) from candidates", () => {
    const candidates = findings[0].evidence.unusedTools ?? [];
    expect(candidates).not.toContain("read_xlsx");
    expect(candidates).not.toContain("GetSymbolsOverview");
    expect(candidates).not.toContain("insert_content");
    expect(candidates).not.toContain("ask_followup_question");
    expect(candidates).toEqual(
      expect.arrayContaining([
        "use_skill",
        "switch_mode",
        "spawn_subagent",
        "start_subtask",
        "start_workflow",
        "create_html_artifact",
        "create_chart",
      ])
    );
    expect(candidates).toHaveLength(7);
  });

  it("estimates tokenImpact strictly by disableable Bob groups (5/23 * 5403, unrounded)", () => {
    expect(findings[0].metric.disableableBobToolCount).toBe(5);
    expect(findings[0].tokenImpact).toBe((5403 / 23) * 5);
    expect(findings[0].metric.tokenImpactIsEstimate).toBe(true);
    expect(findings[0].estimationBasis).toContain("5/23");
    expect(findings[0].estimationBasis).toContain("group");
  });

  it("preserves exact unrounded idleRatio (18/23)", () => {
    expect(findings[0].metric.idleRatio).toBe(18 / 23);
  });
});

// ---------------------------------------------------------------------------
// 2. Protected tools (grep, glob, apply_diff) even without catalog
// ---------------------------------------------------------------------------

describe("detectUnusedTools — protected search and diff tools", () => {
  it("never suggests grep, glob, or apply_diff even when catalog is empty", () => {
    const available = ["read_file", "grep", "glob", "apply_diff", "switch_mode"];
    const report = makeReport([
      makeTask("t1", available, ["read_file"], ["grep", "glob", "apply_diff", "switch_mode"]),
    ]);
    const [finding] = detectUnusedTools(report, []);
    expect(finding).toBeDefined();
    expect(finding.evidence.unusedTools).toEqual(["switch_mode"]);
    for (const tool of PROTECTED_TOOLS) {
      expect(finding.evidence.unusedTools).not.toContain(tool);
    }
  });

  it("emits no finding when the only idle tools are grep, glob, and apply_diff", () => {
    const report = makeReport([
      makeTask(
        "t1",
        ["read_file", "grep", "glob", "apply_diff"],
        ["read_file"],
        ["grep", "glob", "apply_diff"]
      ),
    ]);
    expect(detectUnusedTools(report, [])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. Unknown tools fall back to "other" (never "outros")
// ---------------------------------------------------------------------------

describe("detectUnusedTools — unknown tool fallback", () => {
  it("assigns group 'other' (not 'outros') to tools absent from the catalog", () => {
    const report = makeReport([
      makeTask("t1", ["read_file", "future_tool"], ["read_file"], ["future_tool"]),
    ]);
    const [finding] = detectUnusedTools(report, []);
    expect(finding).toBeDefined();
    expect(finding.metric.idleTools).toEqual([
      {
        name: "future_tool",
        group: "other",
        purpose: null,
        essential: false,
      },
    ]);
    expect(finding.tokenImpact).toBeUndefined();
    expect(JSON.stringify(finding)).not.toContain("outros");
  });
});

// ---------------------------------------------------------------------------
// 4. Subtasks excluded (I-5)
// ---------------------------------------------------------------------------

describe("detectUnusedTools — subtasks excluded (I-5)", () => {
  const catalog = loadToolCatalogJson();

  it("ignores subtasks with parentId !== null or isSubtask: true", () => {
    const rootTask = makeTask(
      "root-1",
      ["read_file", "use_skill"],
      ["read_file"],
      ["use_skill"],
      1000
    );
    const subtaskByFlag = makeTask(
      "sub-1",
      ["read_file", "use_skill"],
      ["read_file"],
      ["use_skill"],
      1000,
      { parentId: "root-1", isSubtask: true }
    );
    const subtaskByParentOnly = makeTask(
      "sub-2",
      ["read_file", "switch_mode"],
      ["read_file"],
      ["switch_mode"],
      1000,
      { parentId: "root-1", isSubtask: false }
    );

    const findings = detectUnusedTools(
      makeReport([rootTask, subtaskByFlag, subtaskByParentOnly]),
      catalog
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].taskId).toBe("root-1");
  });
});

// ---------------------------------------------------------------------------
// 5. Determinism and edge cases
// ---------------------------------------------------------------------------

describe("detectUnusedTools — edge cases and determinism", () => {
  const catalog = loadToolCatalogJson();

  it("is deterministic for identical input", () => {
    const report = loadReport("benchmark/rodada-a.json");
    const first = detectUnusedTools(report, catalog);
    const second = detectUnusedTools(report, catalog);
    expect(first).toEqual(second);
    expect(first[0].detectedAt).toBe(report.exportedAt);
  });

  it("returns empty array when all tools are used", () => {
    const tools = ["read_file", "write_file", "list_files"];
    const report = makeReport([makeTask("t1", tools, tools, [])]);
    expect(detectUnusedTools(report, catalog)).toEqual([]);
  });

  it("returns empty array when toolInventory is missing or null", () => {
    const taskMissing = makeTask("t1", [], [], []);
    delete (taskMissing as unknown as Record<string, unknown>)["toolInventory"];
    const taskNull = makeTask("t2", [], [], [], 0, { toolInventory: null });

    expect(detectUnusedTools(makeReport([taskMissing, taskNull]), catalog)).toEqual([]);
  });

  it("returns empty array without NaN when available is empty", () => {
    const report = makeReport([makeTask("t1", [], [], [])]);
    expect(detectUnusedTools(report, catalog)).toEqual([]);
  });

  it("fires only for root tasks with disableable idle tools in multi-task reports", () => {
    const taskWithDisableable = makeTask(
      "task-a",
      ["read_file", "use_skill"],
      ["read_file"],
      ["use_skill"],
      1000
    );
    const taskOnlyActiveGroupIdle = makeTask(
      "task-b",
      ["read_file", "read_xlsx"],
      ["read_file"],
      ["read_xlsx"],
      1000
    );
    const findings = detectUnusedTools(
      makeReport([taskWithDisableable, taskOnlyActiveGroupIdle]),
      catalog
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].taskId).toBe("task-a");
    expect(findings[0].tokenImpact).toBe(500);
  });
});
