/**
 * Tool-call extraction tests — Hindsight
 *
 * All 12 mandatory acceptance criteria from issue #7.
 *
 * - Uses benchmark/rodada-a.json for integration cases.
 * - Uses synthetic fixtures for edge cases.
 * - Never prints arguments, message content, task titles, or absolute paths.
 * - Never modifies benchmark/rodada-a.json.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseSession } from "../parser/index";
import { extractTurnMetrics } from "./index";
import { extractToolCalls, toPublicToolCallRecord, toPublicToolCallRecords } from "./tool-calls";
import type { Message, ToolCallRecord, TurnMetrics } from "../domain/types";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function readFixture(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf-8");
}

function loadRodadaA() {
  const content = readFixture("benchmark/rodada-a.json");
  const result = parseSession(content);
  if (!result.ok) throw new Error(`parseSession failed: ${result.error.message}`);
  return result.value;
}

// Minimal synthetic message builders — no sensitive content.

function makeAssistant(
  id: string,
  timestamp: number,
  toolCallSpecs: Array<{ id: string; name: string }> = [],
  cost = 0.01
): Message {
  return {
    id,
    role: "assistant",
    data: {
      id,
      role: "assistant",
      content: "",
      _meta: {
        timestamp,
        spend: { cost, contextTokens: 1000, reasoningTokens: 0 },
      },
      toolCalls: toolCallSpecs.map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: { syntheticArg: "value" },
      })),
    },
  };
}

function makeTool(
  id: string,
  timestamp: number,
  signatureId: string,
  opts: {
    isError?: boolean;
    permission?: string;
    durationMs?: number;
    isOutsideWorkspace?: boolean;
  } = {}
): Message {
  return {
    id,
    role: "tool",
    data: {
      id,
      role: "tool",
      content: "",
      _meta: {
        timestamp,
        durationMs: opts.durationMs,
      },
      toolUsage: {
        signature: {
          id: signatureId,
          name: "tool_name",
          arguments: {},
          isError: opts.isError ?? false,
        },
        permission: opts.permission ?? "read",
        isOutsideWorkspace: opts.isOutsideWorkspace ?? false,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// 1. Real baseline — 14 records, 0 errors, no correlation anomalies
// ---------------------------------------------------------------------------

describe("extractToolCalls — real baseline (benchmark/rodada-a.json)", () => {
  const session = loadRodadaA();
  const messages = session.tasks[0].messages;
  const taskId = session.tasks[0].task.id;
  const { records, anomalies } = extractToolCalls(taskId, messages);

  it("produces exactly 14 ToolCallRecord entries", () => {
    expect(records).toHaveLength(14);
  });

  it("produces exactly 0 entries where isError === true", () => {
    expect(records.filter((r) => r.isError === true)).toHaveLength(0);
  });

  it("produces no correlation anomalies (no unmatched, no orphans, no duplicates)", () => {
    const correlationAnomalies = anomalies.filter((a) =>
      [
        "unmatched-tool-call",
        "orphan-tool-result",
        "duplicate-tool-call-id",
        "duplicate-tool-result-id",
      ].includes(a.kind)
    );
    expect(correlationAnomalies).toHaveLength(0);
  });

  it("every record has a non-null resultMessageId", () => {
    expect(records.every((r) => r.resultMessageId !== null)).toBe(true);
  });

  it("every record has a non-null permission", () => {
    expect(records.every((r) => r.permission !== null)).toBe(true);
  });

  it("every record has a non-null isError (boolean)", () => {
    expect(records.every((r) => r.isError !== null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. First turn — 6 calls with the same turnIndex, original order preserved
// ---------------------------------------------------------------------------

describe("extractToolCalls — first turn has 6 calls at turnIndex 0", () => {
  const session = loadRodadaA();
  const messages = session.tasks[0].messages;
  const taskId = session.tasks[0].task.id;
  const { records } = extractToolCalls(taskId, messages);

  it("the first 6 records all have turnIndex === 0", () => {
    const turn0 = records.filter((r) => r.turnIndex === 0);
    expect(turn0).toHaveLength(6);
  });

  it("call order within turn 0 matches the original toolCalls[] order", () => {
    // Known from prior inspection of the export (via extractTurnMetrics tests)
    const expectedIds = [
      "tooluse_5PQM2lnxPYGrPb3SsoDdKM",
      "tooluse_bzuidsdycUDuDnTXermOXv",
      "tooluse_8abc6iY39vc6bI85wVBE5N",
      "tooluse_MQTdrQ5lCR2vlQ7qXMvVSJ",
      "tooluse_Zt6Q4TtrBXXHrbwWuy9pW6",
      "tooluse_LWAv0N20SjnJsmyBhOUSmT",
    ];
    const turn0Ids = records.filter((r) => r.turnIndex === 0).map((r) => r.callId);
    expect(turn0Ids).toEqual(expectedIds);
  });

  it("records are emitted in turn order (turn 0 before turn 1 before …)", () => {
    for (let i = 1; i < records.length; i++) {
      expect(records[i].turnIndex).toBeGreaterThanOrEqual(records[i - 1].turnIndex);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. "todo" permission — confirm real count in the benchmark
//
// DISCREPANCY: The issue acceptance criteria say "6 calls with permission:
// 'todo'", but the real benchmark contains exactly 5 such results.
// We assert the real count (5) and document the discrepancy here.
// benchmark/rodada-a.json is NOT modified.
// ---------------------------------------------------------------------------

describe("extractToolCalls — 'todo' permission count (discrepancy from issue)", () => {
  const session = loadRodadaA();
  const messages = session.tasks[0].messages;
  const taskId = session.tasks[0].task.id;
  const { records } = extractToolCalls(taskId, messages);

  it("has exactly 5 records with permission === 'todo' (issue says 6 — real count wins)", () => {
    // DISCREPANCY: issue #7 acceptance criteria state "6 calls with permission: 'todo'".
    // The actual benchmark/rodada-a.json contains 5 such results.
    // We assert the real value; do not fabricate a sixth entry.
    const todoCount = records.filter((r) => r.permission === "todo").length;
    expect(todoCount).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// 4. Out-of-order results — correlation by ID, not by position
// ---------------------------------------------------------------------------

describe("extractToolCalls — out-of-order results (correlation by ID only)", () => {
  it("correctly correlates call A and call B even when result B arrives before result A", () => {
    // Call A at t=100, Call B at t=200 → Results arrive: result-B at t=300, result-A at t=400
    const assistant = makeAssistant("asst-1", 100, [
      { id: "call-A", name: "tool_a" },
      { id: "call-B", name: "tool_b" },
    ]);
    const resultB = makeTool("result-msg-B", 300, "call-B", {
      permission: "read",
      isError: false,
    });
    const resultA = makeTool("result-msg-A", 400, "call-A", {
      permission: "edit",
      isError: true,
    });

    const { records, anomalies } = extractToolCalls("task-1", [
      assistant,
      resultB, // arrives first
      resultA, // arrives second
    ]);

    expect(anomalies).toHaveLength(0);
    expect(records).toHaveLength(2);

    // Call A should be correlated with result-msg-A (permission: edit, isError: true)
    const recA = records.find((r) => r.callId === "call-A");
    expect(recA).toBeDefined();
    expect(recA?.resultMessageId).toBe("result-msg-A");
    expect(recA?.permission).toBe("edit");
    expect(recA?.isError).toBe(true);

    // Call B should be correlated with result-msg-B (permission: read, isError: false)
    const recB = records.find((r) => r.callId === "call-B");
    expect(recB).toBeDefined();
    expect(recB?.resultMessageId).toBe("result-msg-B");
    expect(recB?.permission).toBe("read");
    expect(recB?.isError).toBe(false);
  });

  it("result ordering does not determine call ordering within a turn", () => {
    const assistant = makeAssistant("asst-1", 100, [
      { id: "call-first", name: "tool_x" },
      { id: "call-second", name: "tool_y" },
    ]);
    // Results arrive in reverse order
    const resultSecond = makeTool("msg-r2", 200, "call-second");
    const resultFirst = makeTool("msg-r1", 300, "call-first");

    const { records } = extractToolCalls("task-1", [assistant, resultSecond, resultFirst]);

    // Calls must be emitted in original toolCalls[] order, not result arrival order
    expect(records[0].callId).toBe("call-first");
    expect(records[1].callId).toBe("call-second");
  });
});

// ---------------------------------------------------------------------------
// 5. Unmatched call
// ---------------------------------------------------------------------------

describe("extractToolCalls — unmatched call", () => {
  const assistant = makeAssistant("asst-1", 100, [{ id: "call-nomatch", name: "some_tool" }]);
  const { records, anomalies } = extractToolCalls("task-1", [assistant]);

  it("record is preserved (not dropped)", () => {
    expect(records).toHaveLength(1);
    expect(records[0].callId).toBe("call-nomatch");
  });

  it("resultMessageId === null", () => {
    expect(records[0].resultMessageId).toBeNull();
  });

  it("isError === null (not false)", () => {
    expect(records[0].isError).toBeNull();
  });

  it("permission === null", () => {
    expect(records[0].permission).toBeNull();
  });

  it("durationMs === null", () => {
    expect(records[0].durationMs).toBeNull();
  });

  it("isOutsideWorkspace === null", () => {
    expect(records[0].isOutsideWorkspace).toBeNull();
  });

  it("a corresponding ObserveAnomaly with kind 'unmatched-tool-call' exists", () => {
    const anomaly = anomalies.find(
      (a) => a.kind === "unmatched-tool-call" && a.callId === "call-nomatch"
    );
    expect(anomaly).toBeDefined();
    expect(anomaly?.taskId).toBe("task-1");
    expect(anomaly?.messageId).toBe("asst-1");
  });

  it("anomaly detail does not contain arguments or sensitive content", () => {
    const anomaly = anomalies.find((a) => a.kind === "unmatched-tool-call");
    expect(anomaly).toBeDefined();
    // Arguments value "value" (from makeAssistant) must NOT appear in detail
    expect(anomaly?.detail).not.toContain("syntheticArg");
    expect(anomaly?.detail).not.toContain("value");
  });
});

// ---------------------------------------------------------------------------
// 6. Orphan result
// ---------------------------------------------------------------------------

describe("extractToolCalls — orphan result", () => {
  const orphanResult = makeTool("orphan-msg", 200, "call-nonexistent", {
    permission: "read",
    isError: false,
  });
  const { records, anomalies } = extractToolCalls("task-1", [orphanResult]);

  it("no ToolCallRecord is created for the orphan", () => {
    expect(records).toHaveLength(0);
  });

  it("an ObserveAnomaly with kind 'orphan-tool-result' exists", () => {
    const anomaly = anomalies.find((a) => a.kind === "orphan-tool-result");
    expect(anomaly).toBeDefined();
    expect(anomaly?.messageId).toBe("orphan-msg");
    expect(anomaly?.callId).toBe("call-nonexistent");
    expect(anomaly?.taskId).toBe("task-1");
  });

  it("orphan is excluded from success and error counts", () => {
    // No records → success count and error count both 0, not 1
    const successes = records.filter((r) => r.isError === false).length;
    const errors = records.filter((r) => r.isError === true).length;
    expect(successes).toBe(0);
    expect(errors).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 7. Duplicate call IDs
// Duplicate-ID policy: an integrity anomaly is emitted; no arbitrary result
// is attached to any of the ambiguous calls; all result fields remain null.
// ---------------------------------------------------------------------------

describe("extractToolCalls — duplicate call IDs", () => {
  // Two assistant messages both emit a call with the same id "dup-call"
  const asst1 = makeAssistant("asst-1", 100, [{ id: "dup-call", name: "tool_x" }]);
  const asst2 = makeAssistant("asst-2", 200, [{ id: "dup-call", name: "tool_x" }]);
  const result = makeTool("result-msg", 300, "dup-call");

  const { records, anomalies } = extractToolCalls("task-1", [asst1, asst2, result]);

  it("emits a 'duplicate-tool-call-id' integrity anomaly", () => {
    const anomaly = anomalies.find((a) => a.kind === "duplicate-tool-call-id");
    expect(anomaly).toBeDefined();
    expect(anomaly?.callId).toBe("dup-call");
    expect(anomaly?.taskId).toBe("task-1");
  });

  it("no record has an arbitrary result attached (all result fields are null)", () => {
    // Both entries with callId "dup-call" must have null result fields
    const dupRecords = records.filter((r) => r.callId === "dup-call");
    expect(dupRecords.length).toBeGreaterThan(0);
    for (const rec of dupRecords) {
      expect(rec.resultMessageId).toBeNull();
      expect(rec.isError).toBeNull();
      expect(rec.permission).toBeNull();
    }
  });

  it("anomaly detail does not contain arguments or sensitive content", () => {
    const anomaly = anomalies.find((a) => a.kind === "duplicate-tool-call-id");
    expect(anomaly?.detail).not.toContain("syntheticArg");
  });
});

// ---------------------------------------------------------------------------
// 8. Duplicate result IDs
// ---------------------------------------------------------------------------

describe("extractToolCalls — duplicate result IDs", () => {
  // One call; two tool messages reference the same signature.id
  const assistant = makeAssistant("asst-1", 100, [{ id: "call-1", name: "tool_x" }]);
  const result1 = makeTool("result-msg-1", 200, "call-1", { permission: "read" });
  const result2 = makeTool("result-msg-2", 300, "call-1", { permission: "edit" });

  const { records, anomalies } = extractToolCalls("task-1", [assistant, result1, result2]);

  it("emits a 'duplicate-tool-result-id' integrity anomaly", () => {
    const anomaly = anomalies.find((a) => a.kind === "duplicate-tool-result-id");
    expect(anomaly).toBeDefined();
    expect(anomaly?.callId).toBe("call-1");
  });

  it("the call record does not have an arbitrary result attached", () => {
    expect(records).toHaveLength(1);
    expect(records[0].resultMessageId).toBeNull();
    expect(records[0].isError).toBeNull();
    expect(records[0].permission).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 9. Unknown permission value — parser accepts it, observe preserves it
// ---------------------------------------------------------------------------

describe("extractToolCalls — unknown permission value (forward-compat)", () => {
  it("parser accepts an unknown permission value without error", () => {
    const base = JSON.parse(readFixture("fixtures/sample-export.json"));
    // Inject unknown permission into the first tool message
    const toolMsg = base.tasks[0].messages.find(
      (m: { role: string }) => m.role === "tool"
    );
    expect(toolMsg).toBeDefined();
    toolMsg.data.toolUsage.permission = "future-unknown-permission";
    const result = parseSession(JSON.stringify(base));
    expect(result.ok).toBe(true);
  });

  it("observe extraction preserves the unknown permission string", () => {
    // Use a synthetic message with an unknown permission to avoid touching the fixture
    const assistant = makeAssistant("asst-1", 100, [{ id: "call-1", name: "tool_x" }]);
    const result = makeTool("result-1", 200, "call-1", {
      permission: "future-unknown-value",
    });

    const { records, anomalies } = extractToolCalls("task-1", [assistant, result]);
    expect(anomalies).toHaveLength(0);
    expect(records).toHaveLength(1);
    expect(records[0].permission).toBe("future-unknown-value");
  });

  it("extraction does not fail on unknown permission", () => {
    const assistant = makeAssistant("asst-1", 100, [{ id: "call-x", name: "t" }]);
    const result = makeTool("r-x", 200, "call-x", { permission: "quantum-permission" });
    expect(() => extractToolCalls("task-1", [assistant, result])).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 10. Parallel calls — multiple calls share the same turn; result ordering
//     does not determine call ordering (already partially covered by test 4,
//     but here we verify turnIndex consistency for parallel calls)
// ---------------------------------------------------------------------------

describe("extractToolCalls — parallel calls (multiple calls per turn)", () => {
  it("all calls from the same assistant message share the same turnIndex", () => {
    const assistant = makeAssistant("asst-1", 100, [
      { id: "p-call-1", name: "tool_a" },
      { id: "p-call-2", name: "tool_b" },
      { id: "p-call-3", name: "tool_c" },
    ]);
    const r1 = makeTool("r1", 200, "p-call-1");
    const r2 = makeTool("r2", 210, "p-call-2");
    const r3 = makeTool("r3", 220, "p-call-3");

    const { records } = extractToolCalls("task-1", [assistant, r1, r2, r3]);
    const turn0 = records.filter((r) => r.turnIndex === 0);
    expect(turn0).toHaveLength(3);
    // All from the same assistant message
    for (const rec of turn0) {
      expect(rec.assistantMessageId).toBe("asst-1");
    }
  });

  it("result ordering does not alter call ordering within a turn", () => {
    const assistant = makeAssistant("asst-1", 100, [
      { id: "pa", name: "tool_a" },
      { id: "pb", name: "tool_b" },
    ]);
    // Results in reverse order
    const rb = makeTool("msg-rb", 200, "pb");
    const ra = makeTool("msg-ra", 300, "pa");

    const { records } = extractToolCalls("task-1", [assistant, rb, ra]);
    // Original toolCalls[] order: [pa, pb]
    expect(records[0].callId).toBe("pa");
    expect(records[1].callId).toBe("pb");
    // But each correlates correctly by ID
    expect(records[0].resultMessageId).toBe("msg-ra");
    expect(records[1].resultMessageId).toBe("msg-rb");
  });
});

// ---------------------------------------------------------------------------
// 11. Public serialization
// ---------------------------------------------------------------------------

describe("toPublicToolCallRecord — safe serialization", () => {
  const record: ToolCallRecord = {
    callId: "call-public-test",
    name: "write_file",
    arguments: { path: "/home/user/secret.ts", content: "secret code here" },
    turnIndex: 0,
    assistantMessageId: "asst-msg-1",
    resultMessageId: "tool-msg-1",
    isError: false,
    permission: "edit",
    durationMs: 123,
    isOutsideWorkspace: false,
  };

  it("arguments are '[REDACTED]' by default", () => {
    const pub = toPublicToolCallRecord(record);
    expect(pub.arguments).toBe("[REDACTED]");
  });

  it("JSON.stringify of the public projection does not contain sensitive argument values", () => {
    const pub = toPublicToolCallRecord(record);
    const json = JSON.stringify(pub);
    // Sensitive path and content from arguments must not appear
    expect(json).not.toContain("/home/user/secret.ts");
    expect(json).not.toContain("secret code here");
    expect(json).not.toContain("/home/");
  });

  it("includeRaw option returns the original arguments", () => {
    const pub = toPublicToolCallRecord(record, { includeRaw: true });
    expect(pub.arguments).toEqual({ path: "/home/user/secret.ts", content: "secret code here" });
  });

  it("the input record is not mutated by default projection", () => {
    const originalArgs = { path: "/home/user/secret.ts", content: "secret code here" };
    const rec: ToolCallRecord = { ...record, arguments: { ...originalArgs } };
    toPublicToolCallRecord(rec);
    expect(rec.arguments).toEqual(originalArgs);
  });

  it("the input record is not mutated by includeRaw projection", () => {
    const originalArgs = { path: "/home/user/secret.ts", content: "secret code here" };
    const rec: ToolCallRecord = { ...record, arguments: { ...originalArgs } };
    toPublicToolCallRecord(rec, { includeRaw: true });
    expect(rec.arguments).toEqual(originalArgs);
  });

  it("toPublicToolCallRecords redacts all records by default", () => {
    const records: ToolCallRecord[] = [record, { ...record, callId: "call-2" }];
    const pubs = toPublicToolCallRecords(records);
    for (const pub of pubs) {
      expect(pub.arguments).toBe("[REDACTED]");
    }
  });

  it("non-argument fields are preserved intact", () => {
    const pub = toPublicToolCallRecord(record);
    expect(pub.callId).toBe(record.callId);
    expect(pub.name).toBe(record.name);
    expect(pub.turnIndex).toBe(record.turnIndex);
    expect(pub.assistantMessageId).toBe(record.assistantMessageId);
    expect(pub.resultMessageId).toBe(record.resultMessageId);
    expect(pub.isError).toBe(record.isError);
    expect(pub.permission).toBe(record.permission);
    expect(pub.durationMs).toBe(record.durationMs);
    expect(pub.isOutsideWorkspace).toBe(record.isOutsideWorkspace);
  });
});

// ---------------------------------------------------------------------------
// 12. Immutability — extractToolCalls does not mutate its inputs
// ---------------------------------------------------------------------------

describe("extractToolCalls — immutability", () => {
  it("does not mutate the messages array", () => {
    const session = loadRodadaA();
    const messages = session.tasks[0].messages;
    const originalIds = messages.map((m) => m.id);
    const taskId = session.tasks[0].task.id;
    extractToolCalls(taskId, messages);
    expect(messages.map((m) => m.id)).toEqual(originalIds);
  });

  it("does not mutate toolCalls within assistant messages", () => {
    const assistant = makeAssistant("asst-1", 100, [
      { id: "call-A", name: "tool_a" },
      { id: "call-B", name: "tool_b" },
    ]);
    const resultA = makeTool("r-a", 200, "call-A");
    const resultB = makeTool("r-b", 300, "call-B");

    const origCallIds = (assistant.data as { toolCalls?: Array<{ id: string }> })
      .toolCalls?.map((tc) => tc.id) ?? [];

    extractToolCalls("task-1", [assistant, resultA, resultB]);

    const afterCallIds = (assistant.data as { toolCalls?: Array<{ id: string }> })
      .toolCalls?.map((tc) => tc.id) ?? [];
    expect(afterCallIds).toEqual(origCallIds);
  });

  it("does not mutate the turns array when provided", () => {
    const session = loadRodadaA();
    const messages = session.tasks[0].messages;
    const taskId = session.tasks[0].task.id;
    const turns = extractTurnMetrics(messages);
    const originalTurnIds = turns.map((t: TurnMetrics) => t.messageId);
    extractToolCalls(taskId, messages, turns);
    expect(turns.map((t: TurnMetrics) => t.messageId)).toEqual(originalTurnIds);
  });
});

// ---------------------------------------------------------------------------
// Bonus: multi-turn integration — correct turnIndex assignment
// ---------------------------------------------------------------------------

describe("extractToolCalls — multi-turn turnIndex assignment", () => {
  it("assigns distinct turnIndices to calls from different assistant messages", () => {
    const asst0 = makeAssistant("asst-0", 100, [{ id: "c0", name: "t0" }]);
    const r0 = makeTool("r0", 150, "c0");
    const asst1 = makeAssistant("asst-1", 200, [{ id: "c1", name: "t1" }]);
    const r1 = makeTool("r1", 250, "c1");

    const { records } = extractToolCalls("task-1", [asst0, r0, asst1, r1]);
    expect(records.find((r) => r.callId === "c0")?.turnIndex).toBe(0);
    expect(records.find((r) => r.callId === "c1")?.turnIndex).toBe(1);
  });

  it("correctly uses pre-computed TurnMetrics when provided", () => {
    const session = loadRodadaA();
    const messages = session.tasks[0].messages;
    const taskId = session.tasks[0].task.id;
    const turns = extractTurnMetrics(messages);

    const withTurns = extractToolCalls(taskId, messages, turns);
    const withoutTurns = extractToolCalls(taskId, messages);

    // Both approaches should produce identical records
    expect(withTurns.records.map((r) => r.callId)).toEqual(
      withoutTurns.records.map((r) => r.callId)
    );
    expect(withTurns.records.map((r) => r.turnIndex)).toEqual(
      withoutTurns.records.map((r) => r.turnIndex)
    );
  });
});
