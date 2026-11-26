import { describe, expect, it } from "vitest";

import type { Finding } from "../domain/types";
import { prescribeMcpEnablement } from "./mcp";

const DOCKER_SNIPPET = JSON.stringify(
  {
    mcpServers: {
      "mcp-server-docker": {
        command: "uvx",
        args: ["mcp-server-docker"],
        disabled: false,
        alwaysAllow: [],
      },
    },
  },
  null,
  2
);

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
      replaces: "Replaces repeated docker shell calls.",
      rationale: "Container logs and inspect JSON flood shell output; Docker MCP returns structured data.",
      docsUrl: "https://github.com/ckreiling/mcp-server-docker",
      installSnippet: DOCKER_SNIPPET,
      estimatedToolTokens: 780,
      externalCommands: ["docker run -e SECRET=hunter2 app"],
    },
    confidence: "medium",
    metric: {
      serverLabel: "Docker MCP Server",
      docsUrl: "https://github.com/ckreiling/mcp-server-docker",
      estimatedToolTokens: 780,
    },
    prescriptionHint: "enable-mcp",
    ...overrides,
  };
}

describe("prescribeMcpEnablement", () => {
  it("creates a rich, deterministic, traceable prescription with docsUrl, snippet, steps, and token trade-off", () => {
    const source = candidate();
    const first = prescribeMcpEnablement([source]);
    const second = prescribeMcpEnablement([source]);

    expect(first).toEqual(second);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      kind: "enable-mcp",
      findingIds: [source.id],
      targetFile: ".bob/mcp.json",
      docsUrl: "https://github.com/ckreiling/mcp-server-docker",
      installSnippet: DOCKER_SNIPPET,
      estimatedTokenCost: 780,
      isEstimate: true,
    });
    expect(first[0].content).toContain("Docker MCP Server");
    expect(first[0].content).toContain("https://github.com/ckreiling/mcp-server-docker");
    expect(first[0].content).toContain("mcpServers");
    expect(first[0].content).toContain("780 tokens/turn");
    expect(first[0].content).toContain("trades off against tool-reduction");
    expect(first[0].content).toContain(".bob/mcp.json");
    expect(first[0].content).toContain(".bob/custom_modes.yaml");
    expect(first[0].steps?.length).toBeGreaterThanOrEqual(3);
    expect(first[0].rationale).toContain(source.evidence.rationale);
    expect(first[0].rationale).toContain("780");
    // Never leaks raw command text
    expect(first[0].content).not.toContain("hunter2");
    expect(first[0].rationale).not.toContain("hunter2");
  });

  it("handles missing docsUrl and missing estimatedToolTokens honestly without inventing values", () => {
    const minimal = candidate({
      evidence: {
        type: "command",
        redactable: true,
        catalogEntryId: "custom-mcp",
        rationale: "Structured API calls.",
        docsUrl: null,
      },
      metric: { serverLabel: "Custom MCP Server" },
    });
    const [rx] = prescribeMcpEnablement([minimal]);

    expect(rx.docsUrl).toBeNull();
    expect(rx).not.toHaveProperty("installSnippet");
    expect(rx).not.toHaveProperty("estimatedTokenCost");
    expect(rx.content).toContain("unavailable");
  });

  it("deduplicates findings and groups the same catalog target regardless of input order", () => {
    const first = candidate({ id: "finding-b" });
    const second = candidate({ id: "finding-a" });
    const forward = prescribeMcpEnablement([first, first, second]);
    const reverse = prescribeMcpEnablement([second, first]);

    expect(forward).toEqual(reverse);
    expect(forward).toHaveLength(1);
    expect(forward[0].findingIds).toEqual(["finding-a", "finding-b"]);
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
