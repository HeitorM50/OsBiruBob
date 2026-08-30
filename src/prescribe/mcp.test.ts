import { describe, expect, it } from "vitest";

import type { Finding } from "../domain/types";
import { prescribeMcpEnablement } from "./mcp";

function candidate(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "finding-docker",
    sessionId: "session-1",
    taskId: "task-1",
    kind: "mcp-candidate",
    detectedAt: 1_700_000_000_000,
    evidence: {
      type: "command",
      redactable: true,
      catalogEntryId: "docker-mcp",
      rationale: "Shell output is unstructured; MCP responses are structured data.",
    },
    confidence: "medium",
    metric: { serverLabel: "Docker MCP Server" },
    prescriptionHint: "enable-mcp",
    ...overrides,
  };
}

describe("prescribeMcpEnablement", () => {
  it("creates a deterministic, traceable prescription", () => {
    const source = candidate();
    const first = prescribeMcpEnablement([source]);
    const second = prescribeMcpEnablement([source]);

    expect(first).toEqual(second);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      kind: "enable-mcp",
      findingIds: [source.id],
      content: "Docker MCP Server",
      rationale: source.evidence.rationale,
    });
  });

  it("deduplicates findings and groups the same catalog target", () => {
    const first = candidate({ id: "finding-b" });
    const second = candidate({ id: "finding-a" });
    const result = prescribeMcpEnablement([first, first, second]);

    expect(result).toHaveLength(1);
    expect(result[0].findingIds).toEqual(["finding-a", "finding-b"]);
  });

  it("keeps sessions, tasks, and catalog entries separate", () => {
    const result = prescribeMcpEnablement([
      candidate(),
      candidate({ id: "finding-task-2", taskId: "task-2" }),
      candidate({
        id: "finding-git",
        evidence: {
          type: "command",
          redactable: true,
          catalogEntryId: "git-mcp",
        },
        metric: { serverLabel: "Git MCP Server" },
      }),
    ]);

    expect(result).toHaveLength(3);
  });

  it("ignores unsupported findings and candidates without a catalog entry", () => {
    expect(
      prescribeMcpEnablement([
        candidate({ kind: "unused-tool" }),
        candidate({ evidence: { type: "command", redactable: true } }),
      ])
    ).toEqual([]);
  });
});
