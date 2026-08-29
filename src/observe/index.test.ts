/**
 * Observe tests — extractTurnMetrics
 *
 * Baseline characterisation uses benchmark/rodada-a.json (same content as
 * fixtures/sample-export.json). Synthetic fixtures cover edge-cases not present
 * in the real export.
 *
 * No network, no API key, no external services. All fixtures are local.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseSession } from "../parser/index";
import { extractTurnMetrics } from "./index";
import type { Message } from "../domain/types";

// ---------------------------------------------------------------------------
// Helpers
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

// ---------------------------------------------------------------------------
// Baseline: benchmark/rodada-a.json
// ---------------------------------------------------------------------------

describe("extractTurnMetrics — benchmark/rodada-a.json (baseline)", () => {
  const session = loadRodadaA();
  const messages = session.tasks[0].messages;
  const turns = extractTurnMetrics(messages);

  it("produces exactly five turns", () => {
    expect(turns).toHaveLength(5);
  });

  it("assigns indices [0, 1, 2, 3, 4]", () => {
    expect(turns.map((t) => t.index)).toEqual([0, 1, 2, 3, 4]);
  });

  it("timestamps match expected epoch ms values", () => {
    expect(turns.map((t) => t.timestamp)).toEqual([
      1787958111009,
      1787958248859,
      1787958289168,
      1787958305385,
      1787958332549,
    ]);
  });

  it("contextTokens match accumulated values (not increments)", () => {
    expect(turns.map((t) => t.contextTokens)).toEqual([14522, 15190, 16714, 17302, 17584]);
  });

  it("contextDelta: null on first turn, correct increments thereafter", () => {
    expect(turns[0].contextDelta).toBeNull();
    expect(turns[1].contextDelta).toBe(668);
    expect(turns[2].contextDelta).toBe(1524);
    expect(turns[3].contextDelta).toBe(588);
    expect(turns[4].contextDelta).toBe(282);
  });

  it("costs preserved with full precision (no rounding)", () => {
    expect(turns.map((t) => t.cost)).toEqual([
      0.029044, 0.03038, 0.033428, 0.034604, 0.035168,
    ]);
  });

  it("sum of turn costs equals 0.16262400000000002 within absolute tolerance 1e-12", () => {
    const sum = turns.reduce((acc, t) => acc + t.cost, 0);
    expect(Math.abs(sum - 0.16262400000000002)).toBeLessThan(1e-12);
  });

  it("task.costs.cost is 0.336902 (characterisation: diverges from turn cost sum)", () => {
    const taskCost = session.tasks[0].task.costs.cost;
    expect(taskCost).toBe(0.336902);
    // The divergence is intentional — different measurements, not to be reconciled.
    expect(Math.abs(taskCost - 0.16262400000000002)).toBeGreaterThan(1e-12);
  });

  it("reasoningTokens === 0 on all turns", () => {
    expect(turns.every((t) => t.reasoningTokens === 0)).toBe(true);
  });

  it("tool call counts per turn are [6, 3, 2, 3, 0]", () => {
    expect(turns.map((t) => t.toolCallIds.length)).toEqual([6, 3, 2, 3, 0]);
  });

  it("tool call IDs are preserved correctly for each turn", () => {
    expect(turns[0].toolCallIds).toEqual([
      "tooluse_5PQM2lnxPYGrPb3SsoDdKM",
      "tooluse_bzuidsdycUDuDnTXermOXv",
      "tooluse_8abc6iY39vc6bI85wVBE5N",
      "tooluse_MQTdrQ5lCR2vlQ7qXMvVSJ",
      "tooluse_Zt6Q4TtrBXXHrbwWuy9pW6",
      "tooluse_LWAv0N20SjnJsmyBhOUSmT",
    ]);
    expect(turns[1].toolCallIds).toEqual([
      "tooluse_n4ZYuahWdehoV9gwa6I0uO",
      "tooluse_k3b4qBWdQwJOa33u4L6kG4",
      "tooluse_U9TJOD9e6KykXlnVXt9K74",
    ]);
    expect(turns[2].toolCallIds).toEqual([
      "tooluse_nootttgTHNPZfckQopQjc6",
      "tooluse_xXuz7l0OOOMlvEIQhMp5Qc",
    ]);
    expect(turns[3].toolCallIds).toEqual([
      "tooluse_YXqXoCBewjwOmP8zULgkfn",
      "tooluse_7daQXIVDiYL0VAH4UL8Mkt",
      "tooluse_CgC47vxseMblYd9XpiKN30",
    ]);
    expect(turns[4].toolCallIds).toEqual([]);
  });

  it("only the last turn has stop === true", () => {
    expect(turns.slice(0, 4).every((t) => t.stop === false)).toBe(true);
    expect(turns[4].stop).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Ordering — reversed or shuffled input still produces timestamp order
// ---------------------------------------------------------------------------

describe("extractTurnMetrics — ordering invariants", () => {
  it("reversed messages array produces same turn order as original", () => {
    const session = loadRodadaA();
    const messages = session.tasks[0].messages;
    const forward = extractTurnMetrics(messages);
    const reversed = extractTurnMetrics([...messages].reverse());
    expect(reversed.map((t) => t.timestamp)).toEqual(forward.map((t) => t.timestamp));
    expect(reversed.map((t) => t.messageId)).toEqual(forward.map((t) => t.messageId));
  });

  it("shuffled messages array produces same turn order as original", () => {
    const session = loadRodadaA();
    const messages = session.tasks[0].messages;
    // Deterministic shuffle — rotate by 7
    const shuffled: Message[] = [
      ...messages.slice(7),
      ...messages.slice(0, 7),
    ];
    const forward = extractTurnMetrics(messages);
    const fromShuffled = extractTurnMetrics(shuffled);
    expect(fromShuffled.map((t) => t.timestamp)).toEqual(forward.map((t) => t.timestamp));
  });

  it("does not mutate the original messages array", () => {
    const session = loadRodadaA();
    const messages = session.tasks[0].messages;
    const originalIds = messages.map((m) => m.id);
    extractTurnMetrics(messages);
    expect(messages.map((m) => m.id)).toEqual(originalIds);
  });
});

// ---------------------------------------------------------------------------
// Filtering — non-assistant messages are ignored without accessing spend
// ---------------------------------------------------------------------------

describe("extractTurnMetrics — filtering edge cases", () => {
  it("ignores tool and user messages from baseline (no spend access)", () => {
    const session = loadRodadaA();
    const messages = session.tasks[0].messages;
    // Baseline has 21 messages total; 5 assistant, rest are user/tool/system
    const nonAssistant = messages.filter((m) => m.role !== "assistant");
    expect(nonAssistant.length).toBeGreaterThan(0);
    // Should return no turns — none are assistant with spend
    const turns = extractTurnMetrics(nonAssistant);
    expect(turns).toHaveLength(0);
  });

  it("ignores assistant message without spend (no crash)", () => {
    const session = loadRodadaA();
    const messages = session.tasks[0].messages;
    // Inject a synthetic assistant message without spend
    const syntheticNoSpend: Message = {
      id: "synthetic-no-spend",
      role: "assistant",
      data: {
        id: "synthetic-no-spend",
        role: "assistant",
        content: "hello",
        _meta: {
          timestamp: 9999999999999,
          // spend intentionally absent
        },
      },
    };
    const augmented = [...messages, syntheticNoSpend];
    // Should still produce exactly 5 turns (the synthetic one is ignored)
    const turns = extractTurnMetrics(augmented);
    expect(turns).toHaveLength(5);
    expect(turns.every((t) => t.messageId !== "synthetic-no-spend")).toBe(true);
  });

  it("returns empty array for an empty messages list", () => {
    expect(extractTurnMetrics([])).toEqual([]);
  });

  // Regression: envelope role === "assistant" but data.role disagrees (e.g. "tool").
  // Such a message must be skipped — using it would produce wrong metrics and
  // potentially access fields (toolUsage) that belong to the wrong data shape.
  it("ignores message where envelope role is 'assistant' but data.role is 'tool' (divergent roles)", () => {
    // Cast to Message: this object is intentionally malformed to simulate corrupt
    // export data. The parser now rejects these at parse time, but extractTurnMetrics
    // must also handle them defensively in case data ever arrives pre-parsed.
    const divergent = {
      id: "divergent-roles",
      role: "assistant", // envelope says assistant
      data: {
        id: "divergent-roles",
        role: "tool", // data says tool — mismatch
        content: "",
        _meta: {
          timestamp: 1000,
          spend: { cost: 0.05, contextTokens: 500, reasoningTokens: 0 },
        },
        toolUsage: {
          signature: {
            id: "tooluse_divergent",
            name: "some_tool",
            arguments: {},
            isError: false,
          },
          permission: "read",
          isOutsideWorkspace: false,
        },
      },
    } as unknown as Message;
    const turns = extractTurnMetrics([divergent]);
    expect(turns).toHaveLength(0);
  });

  // Regression: data.role === "assistant" but envelope role is not "assistant".
  // The message must also be skipped in this direction.
  it("ignores message where data.role is 'assistant' but envelope role is 'user' (divergent roles, other direction)", () => {
    const divergent = {
      id: "divergent-roles-2",
      role: "user", // envelope says user
      data: {
        id: "divergent-roles-2",
        role: "assistant", // data says assistant — mismatch
        content: "",
        _meta: {
          timestamp: 2000,
          spend: { cost: 0.05, contextTokens: 500, reasoningTokens: 0 },
        },
      },
    } as unknown as Message;
    const turns = extractTurnMetrics([divergent]);
    expect(turns).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Timestamp tie-breaking — deterministic by original position
// ---------------------------------------------------------------------------

describe("extractTurnMetrics — timestamp tie-breaking", () => {
  it("uses original position as deterministic tiebreaker for equal timestamps", () => {
    // Two assistant messages with the same timestamp — position determines order
    const msgA: Message = {
      id: "msg-a",
      role: "assistant",
      data: {
        id: "msg-a",
        role: "assistant",
        content: "",
        _meta: {
          timestamp: 1000,
          spend: { cost: 0.01, contextTokens: 100, reasoningTokens: 0 },
        },
      },
    };
    const msgB: Message = {
      id: "msg-b",
      role: "assistant",
      data: {
        id: "msg-b",
        role: "assistant",
        content: "",
        _meta: {
          timestamp: 1000,
          spend: { cost: 0.02, contextTokens: 200, reasoningTokens: 0 },
        },
      },
    };
    const turns = extractTurnMetrics([msgA, msgB]);
    expect(turns[0].messageId).toBe("msg-a");
    expect(turns[1].messageId).toBe("msg-b");
    // Reversed input → same timestamps, reversed original positions → reversed order
    const turnsRev = extractTurnMetrics([msgB, msgA]);
    expect(turnsRev[0].messageId).toBe("msg-b");
    expect(turnsRev[1].messageId).toBe("msg-a");
  });
});

// ---------------------------------------------------------------------------
// Invalid export — missing _meta.timestamp rejected by parseSession
// ---------------------------------------------------------------------------

describe("parseSession — missing _meta.timestamp", () => {
  it("returns ok:false with error path containing _meta.timestamp", () => {
    const base = JSON.parse(readFixture("fixtures/sample-export.json"));
    // Remove timestamp from the first message's _meta
    delete base.tasks[0].messages[0].data._meta.timestamp;
    const result = parseSession(JSON.stringify(base));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/timestamp/);
    // Path should reference _meta or timestamp
    const errorText = `${result.error.message} ${result.error.path ?? ""}`;
    expect(errorText.toLowerCase()).toMatch(/timestamp/);
  });
});
