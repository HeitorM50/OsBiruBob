/**
 * Parser tests — Hindsight
 *
 * Covers all mandatory test cases from the issue acceptance criteria.
 * Uses real fixtures for baseline characterisation and synthetic fixtures
 * for edge/error cases not present in the real export.
 *
 * No network, no API key, no external services. All fixtures are local.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseSession, summariseSession } from "./index";
import type { ParseResult } from "./index";
import type {
  Session,
  Message,
  SystemMessageData,
  UserMessageData,
  AssistantMessageData,
  ToolMessageData,
} from "../domain/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readFixture(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf-8");
}

// ---------------------------------------------------------------------------
// Baseline: fixtures/sample-export.json
// ---------------------------------------------------------------------------

describe("parseSession — fixtures/sample-export.json (baseline copy)", () => {
  const content = readFixture("fixtures/sample-export.json");
  let result: ParseResult<Session>;

  it("parses without error", () => {
    result = parseSession(content);
    expect(result.ok).toBe(true);
  });

  it("produces exactly 1 task", () => {
    result = parseSession(content);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.tasks).toHaveLength(1);
  });

  it("produces exactly 21 messages in the first task", () => {
    result = parseSession(content);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.tasks[0].messages).toHaveLength(21);
  });

  it("preserves version=1 and epoch exportedAt", () => {
    result = parseSession(content);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.version).toBe(1);
    expect(result.value.exportedAt).toBe(1787958446197);
    expect(result.value.exportedAt).toBeGreaterThan(1_000_000_000_000); // 13-digit epoch ms
  });

  it("preserves workspace URI", () => {
    result = parseSession(content);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.workspace).toBe("file:/home/heitor/Projects/bob-demo");
  });

  it("task has parentId=null (not a subtask)", () => {
    result = parseSession(content);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.tasks[0].task.parentId).toBeNull();
  });

  it("preserves contextWindowBreakdown with correct values", () => {
    result = parseSession(content);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bd = result.value.tasks[0].task.costs.contextWindowBreakdown;
    expect(bd.total).toBe(10439);
    expect(bd.reportedTotal).toBe(17584);
    expect(bd.breakdown.projectRules).toBe(0);
    expect(bd.breakdown.toolDefinitions).toBe(5403);
  });

  it("preserves cost with full precision (I-3)", () => {
    result = parseSession(content);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.tasks[0].task.costs.cost).toBe(0.336902);
  });

  it("preserves data._meta.timestamp on messages (internal field, not stripped)", () => {
    result = parseSession(content);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const firstMsg = result.value.tasks[0].messages[0];
    expect(firstMsg.data._meta.timestamp).toBe(1787958109275);
  });

  it("preserves spend on assistant messages", () => {
    result = parseSession(content);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const assistantMsg = result.value.tasks[0].messages.find(
      (m) => m.role === "assistant"
    );
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg?.data._meta.spend).toBeDefined();
    expect(assistantMsg?.data._meta.spend?.cost).toBe(0.029044);
  });

  it("preserves availableTools on first user message", () => {
    result = parseSession(content);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const userMsg = result.value.tasks[0].messages.find((m) => m.role === "user");
    expect(userMsg).toBeDefined();
    const availableTools = (userMsg?.data as { availableTools?: string[] }).availableTools;
    expect(Array.isArray(availableTools)).toBe(true);
    expect(availableTools?.length).toBe(23);
  });
});

// ---------------------------------------------------------------------------
// Baseline: benchmark/rodada-a.json (must produce identical results to sample)
// ---------------------------------------------------------------------------

describe("parseSession — benchmark/rodada-a.json", () => {
  it("parses without error, 1 task, 21 messages", () => {
    const content = readFixture("benchmark/rodada-a.json");
    const result = parseSession(content);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.tasks).toHaveLength(1);
    expect(result.value.tasks[0].messages).toHaveLength(21);
  });

  it("produces the same exportedAt as the sample fixture", () => {
    const sampleResult = parseSession(readFixture("fixtures/sample-export.json"));
    const rodadaResult = parseSession(readFixture("benchmark/rodada-a.json"));
    expect(sampleResult.ok).toBe(true);
    expect(rodadaResult.ok).toBe(true);
    if (!sampleResult.ok || !rodadaResult.ok) return;
    expect(sampleResult.value.exportedAt).toBe(rodadaResult.value.exportedAt);
  });
});

// ---------------------------------------------------------------------------
// Extra root key (e.g. _metadata) — must be tolerated; data._meta preserved
// ---------------------------------------------------------------------------

describe("parseSession — extra root key tolerance", () => {
  it("ignores unknown root field '_metadata' without error", () => {
    const base = JSON.parse(readFixture("fixtures/sample-export.json"));
    base["_metadata"] = { generatedBy: "test", version: "2.0" };
    const result = parseSession(JSON.stringify(base));
    expect(result.ok).toBe(true);
  });

  it("does NOT remove data._meta when extra root keys are present", () => {
    const base = JSON.parse(readFixture("fixtures/sample-export.json"));
    base["_metadata"] = { extra: true };
    const result = parseSession(JSON.stringify(base));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const firstMsg = result.value.tasks[0].messages[0];
    expect(firstMsg.data._meta).toBeDefined();
    expect(firstMsg.data._meta.timestamp).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Invalid JSON — must return ParseError, never throw
// ---------------------------------------------------------------------------

describe("parseSession — invalid JSON", () => {
  it("returns ParseError with actionable message for malformed JSON", () => {
    const result = parseSession("{ not valid json ,,, }");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/Invalid JSON/i);
    expect(result.error.path).toBe("<root>");
  });

  it("returns ParseError for empty string", () => {
    const result = parseSession("");
    expect(result.ok).toBe(false);
  });

  it("never throws — always returns ParseResult", () => {
    expect(() => parseSession("{ broken")).not.toThrow();
    expect(() => parseSession("null")).not.toThrow();
    expect(() => parseSession("42")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// tasks absent — must return ParseError naming the field
// ---------------------------------------------------------------------------

describe("parseSession — missing 'tasks' field", () => {
  it("returns ParseError naming 'tasks' when field is absent", () => {
    const envelope = { version: 1, exportedAt: 1787958446197, workspace: "file:/x" };
    const result = parseSession(JSON.stringify(envelope));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message.toLowerCase()).toMatch(/tasks/);
  });
});

// ---------------------------------------------------------------------------
// tasks not an array — must return ParseError naming the field
// ---------------------------------------------------------------------------

describe("parseSession — tasks is not an array", () => {
  it("returns ParseError naming 'tasks' when tasks is a string", () => {
    const envelope = {
      version: 1,
      exportedAt: 1787958446197,
      workspace: "file:/x",
      tasks: "not-an-array",
    };
    const result = parseSession(JSON.stringify(envelope));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message.toLowerCase()).toMatch(/tasks/);
  });

  it("returns ParseError naming 'tasks' when tasks is an object", () => {
    const envelope = {
      version: 1,
      exportedAt: 1787958446197,
      workspace: "file:/x",
      tasks: { 0: "wrong" },
    };
    const result = parseSession(JSON.stringify(envelope));
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Subtask — parentId preserved, task not aggregated at parse time
// ---------------------------------------------------------------------------

describe("parseSession — subtask with parentId", () => {
  it("preserves parentId on subtask and marks isSubtask correctly in summary", () => {
    // Build a minimal two-turn session: one root task + one subtask
    const base = JSON.parse(readFixture("fixtures/sample-export.json"));
    const rootTask = JSON.parse(JSON.stringify(base.tasks[0]));

    // Clone to create a subtask entry
    const subtask = JSON.parse(JSON.stringify(base.tasks[0]));
    subtask.task.id = "subtask-id-000";
    subtask.task.parentId = rootTask.task.id; // non-null → subtask

    const synthetic = {
      version: base.version,
      exportedAt: base.exportedAt,
      workspace: base.workspace,
      tasks: [rootTask, subtask],
    };

    const result = parseSession(JSON.stringify(synthetic));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.tasks).toHaveLength(2);

    // Root task
    expect(result.value.tasks[0].task.parentId).toBeNull();

    // Subtask
    expect(result.value.tasks[1].task.parentId).toBe(rootTask.task.id);

    // Summary reflects isSubtask correctly — parser does NOT aggregate
    const summary = summariseSession(result.value);
    expect(summary[0].isSubtask).toBe(false);
    expect(summary[1].isSubtask).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// summariseSession — does not expose sensitive fields
// ---------------------------------------------------------------------------

describe("summariseSession — metadata listing without sensitive content", () => {
  it("returns id, titlePreview, status, messageCount, isSubtask", () => {
    const content = readFixture("fixtures/sample-export.json");
    const result = parseSession(content);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const summary = summariseSession(result.value);
    expect(summary).toHaveLength(1);

    const entry = summary[0];
    expect(typeof entry.id).toBe("string");
    expect(typeof entry.titlePreview).toBe("string");
    expect(typeof entry.status).toBe("string");
    expect(typeof entry.messageCount).toBe("number");
    expect(entry.messageCount).toBe(21);
    expect(typeof entry.isSubtask).toBe("boolean");
    expect(entry.isSubtask).toBe(false);
  });

  it("truncates titlePreview to at most 60 characters", () => {
    const content = readFixture("fixtures/sample-export.json");
    const result = parseSession(content);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const summary = summariseSession(result.value);
    expect(summary[0].titlePreview.length).toBeLessThanOrEqual(60);
  });

  it("does not include newlines in titlePreview", () => {
    const content = readFixture("fixtures/sample-export.json");
    const result = parseSession(content);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const summary = summariseSession(result.value);
    expect(summary[0].titlePreview).not.toContain("\n");
  });
});

// ---------------------------------------------------------------------------
// Cross-field consistency — role and id must match between envelope and data
// ---------------------------------------------------------------------------

describe("parseSession — role/id cross-field consistency", () => {
  /** Mutate the first message of a cloned fixture and re-serialise. */
  function withFirstMessage(patch: (msg: Record<string, unknown>) => void): string {
    const base = JSON.parse(readFixture("fixtures/sample-export.json"));
    const msg = base.tasks[0].messages[0] as Record<string, unknown>;
    patch(msg);
    return JSON.stringify(base);
  }

  // 1. Baseline is accepted (sanity guard for this describe block)
  it("accepts the real baseline unchanged", () => {
    const result = parseSession(readFixture("fixtures/sample-export.json"));
    expect(result.ok).toBe(true);
  });

  // 2. Divergent roles → rejected
  it("returns ok:false when envelope role differs from data.role", () => {
    const content = withFirstMessage((msg) => {
      (msg["data"] as Record<string, unknown>)["role"] = "tool";
    });
    const result = parseSession(content);
    expect(result.ok).toBe(false);
  });

  // 3. Error path for role mismatch names data.role
  it("error path contains 'data.role' for a role mismatch", () => {
    const content = withFirstMessage((msg) => {
      (msg["data"] as Record<string, unknown>)["role"] = "tool";
    });
    const result = parseSession(content);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.path).toMatch(/data\.role/);
  });

  // 4. Divergent IDs → rejected
  it("returns ok:false when envelope id differs from data.id", () => {
    const content = withFirstMessage((msg) => {
      (msg["data"] as Record<string, unknown>)["id"] = "completely-different-id";
    });
    const result = parseSession(content);
    expect(result.ok).toBe(false);
  });

  // 5. Error path for ID mismatch names data.id
  it("error path contains 'data.id' for an id mismatch", () => {
    const content = withFirstMessage((msg) => {
      (msg["data"] as Record<string, unknown>)["id"] = "completely-different-id";
    });
    const result = parseSession(content);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.path).toMatch(/data\.id/);
  });

  // 6. data.id absent → controlled error, no crash
  it("returns ok:false without crashing when data.id is absent", () => {
    const content = withFirstMessage((msg) => {
      delete (msg["data"] as Record<string, unknown>)["id"];
    });
    expect(() => parseSession(content)).not.toThrow();
    const result = parseSession(content);
    expect(result.ok).toBe(false);
  });

  // 7. Error message must not expose sensitive content
  it("error message does not contain data.content, task.title, tool arguments, or private paths", () => {
    const raw = JSON.parse(readFixture("fixtures/sample-export.json"));
    const sensitiveContent = (raw.tasks[0].messages[0].data as Record<string, unknown>)["content"] as string;
    const taskTitle = raw.tasks[0].task.title as string;

    const content = withFirstMessage((msg) => {
      (msg["data"] as Record<string, unknown>)["role"] = "tool";
    });
    const result = parseSession(content);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    const errorText = result.error.message;
    // Must not leak message body or task title
    expect(errorText).not.toContain(sensitiveContent.slice(0, 20));
    expect(errorText).not.toContain(taskTitle.slice(0, 20));
    // Must not expose absolute paths from the export
    expect(errorText).not.toMatch(/\/home\//);
  });
});

// ---------------------------------------------------------------------------
// Type-level: Message discriminated union
// ---------------------------------------------------------------------------

// Valid shapes — these must compile. Declared at module scope so type imports work.
const _typeLevelSystem: Message = {
  id: "s1",
  role: "system",
  data: { id: "s1", role: "system", content: "", _meta: { timestamp: 1 } } satisfies SystemMessageData,
};
const _typeLevelUser: Message = {
  id: "u1",
  role: "user",
  data: { id: "u1", role: "user", content: "", _meta: { timestamp: 1 } } satisfies UserMessageData,
};
const _typeLevelAssistant: Message = {
  id: "a1",
  role: "assistant",
  data: { id: "a1", role: "assistant", content: "", _meta: { timestamp: 1 } } satisfies AssistantMessageData,
};
const _typeLevelTool: Message = {
  id: "t1",
  role: "tool",
  data: {
    id: "t1",
    role: "tool",
    content: "",
    _meta: { timestamp: 1 },
    toolUsage: {
      signature: { id: "tc1", name: "x", arguments: {}, isError: false },
      permission: "read",
      isOutsideWorkspace: false,
    },
  } satisfies ToolMessageData,
};

// Invalid shape — must be rejected by the discriminated union.
// @ts-expect-error: envelope role "assistant" is incompatible with data.role "user"
const _typeLevelBad: Message = {
  id: "x1",
  role: "assistant",
  data: { id: "x1", role: "user", content: "", _meta: { timestamp: 1 } } satisfies UserMessageData,
};

describe("Message discriminated union — type-level correctness", () => {
  it("accepts valid messages of all four roles at the type level", () => {
    // Runtime assertion — only to prevent "unused variable" lint errors.
    // The real check is that the module-scope declarations above compile without errors.
    expect([_typeLevelSystem, _typeLevelUser, _typeLevelAssistant, _typeLevelTool].length).toBe(4);
  });

  it("rejects contradictory role/data combinations via @ts-expect-error", () => {
    // The @ts-expect-error above the module-scope declaration is the real type check.
    // If tsc ever accepts that assignment without error, typecheck will fail here.
    void _typeLevelBad;
    expect(true).toBe(true);
  });
});
