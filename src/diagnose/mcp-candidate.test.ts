import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import type {
  ExternalCommandRecord,
  McpCatalogEntry,
  ObserveReport,
} from "../domain/types";
import { observe } from "../observe/index";
import { parseSession } from "../parser/index";
import {
  DEFAULT_MCP_MIN_HITS,
  detectMcpCandidates,
  isTrivialOrNoisyCommand,
  MCP_CATALOG_ABSENT,
  MCP_CATALOG_INVALID,
} from "./mcp-candidate";

const DOCKER_ENTRY: McpCatalogEntry = {
  id: "docker-mcp",
  label: "Docker MCP Server",
  binaries: ["docker", "docker-compose"],
  matchesHttp: false,
  replaces: "Docker commands executed through the shell.",
  rationale: "Structured container status avoids verbose shell output.",
  docsUrl: "https://github.com/ckreiling/mcp-server-docker",
  installSnippet:
    '{"mcpServers":{"mcp-server-docker":{"command":"uvx","args":["mcp-server-docker"]}}}',
  estimatedToolTokens: 780,
  minHits: 2,
};

const HTTP_ENTRY: McpCatalogEntry = {
  id: "http-mcp",
  label: "HTTP Fetch MCP Server",
  binaries: ["curl", "wget", "http"],
  matchesHttp: true,
  replaces: "HTTP requests executed through shell clients.",
  rationale: "Structured fetch converts HTML into bounded Markdown.",
  docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/fetch",
  estimatedToolTokens: 350,
  minHits: 2,
};

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

function loadBundledMcpCatalog(): McpCatalogEntry[] {
  return JSON.parse(
    readFileSync(join(process.cwd(), "data/mcp-catalog.json"), "utf-8")
  ) as McpCatalogEntry[];
}

function makeCommand(
  callId: string,
  turnIndex: number,
  raw: string,
  binaries: string[],
  isHttp = false,
  targetHost: string | null = null
): ExternalCommandRecord {
  return {
    callId,
    turnIndex,
    raw,
    rawRedactable: true,
    binaries,
    isHttp,
    targetHost,
  };
}

function withCommands(
  report: ObserveReport,
  commands: ExternalCommandRecord[]
): ObserveReport {
  const copy = structuredClone(report);
  copy.tasks[0].externalCommands = commands;
  return copy;
}

describe("data/mcp-catalog.json quality guarantees", () => {
  const catalog = loadBundledMcpCatalog();

  it("gives every catalog entry a distinct rationale, minHits === 2, installSnippet, and estimatedToolTokens", () => {
    const rationales = catalog.map((entry) => entry.rationale);
    expect(new Set(rationales).size).toBe(catalog.length);

    for (const entry of catalog) {
      expect(entry.minHits).toBe(2);
      expect(typeof entry.installSnippet).toBe("string");
      expect(() => JSON.parse(entry.installSnippet!)).not.toThrow();
      expect(entry.estimatedToolTokens).toBeGreaterThan(0);
    }
  });

  it("splits databases into separate postgres, mysql, and sqlite entries", () => {
    const byId = new Map(catalog.map((e) => [e.id, e]));
    expect(byId.has("database-mcp")).toBe(false);
    expect(byId.get("postgres-mcp")?.binaries).toEqual(["psql"]);
    expect(byId.get("mysql-mcp")?.binaries).toEqual(["mysql"]);
    expect(byId.get("sqlite-mcp")?.binaries).toEqual(["sqlite3"]);
  });

  it("fixes aws-mcp, npm-mcp, and http-mcp binaries", () => {
    const byId = new Map(catalog.map((e) => [e.id, e]));
    expect(byId.get("aws-mcp")?.docsUrl).not.toContain("amazon-q-developer-cli");
    expect(byId.get("aws-mcp")?.docsUrl).toContain("awslabs/mcp");
    expect(byId.get("npm-mcp")?.docsUrl).not.toBe(
      "https://github.com/modelcontextprotocol/servers"
    );
    expect(byId.get("http-mcp")?.binaries).toContain("http");
    expect(byId.get("http-mcp")?.binaries).not.toContain("httpie");
  });
});

describe("isTrivialOrNoisyCommand", () => {
  it("filters commands whose binaries are all trivial (sleep, echo, true)", () => {
    expect(isTrivialOrNoisyCommand(makeCommand("1", 0, "sleep 5", ["sleep"]))).toBe(true);
    expect(isTrivialOrNoisyCommand(makeCommand("2", 0, "echo ok", ["echo"]))).toBe(true);
    expect(isTrivialOrNoisyCommand(makeCommand("3", 0, "true", ["true"]))).toBe(true);
    expect(
      isTrivialOrNoisyCommand(
        makeCommand("4", 0, "echo waiting && sleep 2 && true", ["echo", "sleep", "true"])
      )
    ).toBe(true);
  });

  it("keeps real commands and compound commands combining a real binary with sleep", () => {
    expect(
      isTrivialOrNoisyCommand(
        makeCommand("1", 0, "docker build -t app .", ["docker"])
      )
    ).toBe(false);
    expect(
      isTrivialOrNoisyCommand(
        makeCommand("2", 1, "docker compose up -d && sleep 5", ["docker", "sleep"])
      )
    ).toBe(false);
    expect(
      isTrivialOrNoisyCommand(
        makeCommand(
          "3",
          1,
          "docker rm -f todo-api; docker run -d todo && sleep 1 && docker logs todo-api",
          ["docker", "sleep"]
        )
      )
    ).toBe(false);
    expect(
      isTrivialOrNoisyCommand(
        makeCommand("4", 1, "docker exec app sleep 10", ["docker"])
      )
    ).toBe(false);
    expect(
      isTrivialOrNoisyCommand(
        makeCommand("5", 2, "psql -c 'SELECT * FROM sleep_logs'", ["psql"])
      )
    ).toBe(false);
  });
});

describe("detectMcpCandidates", () => {
  const baselineReport = loadBaselineReport();
  const bundledCatalog = loadBundledMcpCatalog();

  it("counts both baseline docker commands in rodada-a.json (hitCount: 2) including compound docker + sleep", () => {
    const result = detectMcpCandidates(baselineReport, bundledCatalog);
    expect(result.unavailableMetrics).toEqual([]);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].metric.serverId).toBe("docker-mcp");
    expect(result.findings[0].metric.hitCount).toBe(2);
  });

  it("counts a compound docker + sleep command as 1 docker hit while ignoring pure sleep and pure echo", () => {
    const entry = { ...DOCKER_ENTRY, minHits: 1 };
    const report = withCommands(baselineReport, [
      makeCommand("c1", 0, "docker compose up -d && sleep 5", ["docker", "sleep"]),
      makeCommand("c2", 1, "sleep 5", ["sleep"]),
      makeCommand("c3", 2, "echo done", ["echo"]),
    ]);
    const result = detectMcpCandidates(report, [entry]);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].metric.hitCount).toBe(1);
    expect(result.findings[0].evidence.toolCallIds).toEqual(["c1"]);
  });

  it("does not count pure sleep or pure echo commands as MCP hits", () => {
    const anyBinaryEntry: McpCatalogEntry = {
      ...DOCKER_ENTRY,
      id: "sleep-echo-test",
      binaries: ["sleep", "echo", "true"],
      minHits: 1,
    };
    const pureSleep = withCommands(baselineReport, [
      makeCommand("s1", 0, "sleep 5", ["sleep"]),
    ]);
    const pureEcho = withCommands(baselineReport, [
      makeCommand("e1", 0, "echo hello", ["echo"]),
    ]);

    expect(detectMcpCandidates(pureSleep, [anyBinaryEntry]).findings).toEqual([]);
    expect(detectMcpCandidates(pureEcho, [anyBinaryEntry]).findings).toEqual([]);
  });

  it("forwards docsUrl, installSnippet, and estimatedToolTokens into evidence when 2 real hits are observed", () => {
    const report = withCommands(baselineReport, [
      makeCommand("c1", 0, "docker ps", ["docker"]),
      makeCommand("c2", 1, "docker logs api", ["docker"]),
    ]);

    const result = detectMcpCandidates(report, [DOCKER_ENTRY, HTTP_ENTRY]);
    expect(result.unavailableMetrics).toEqual([]);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      id: `mcp-candidate:${report.sessionId}:${report.tasks[0].taskId}:docker-mcp`,
      kind: "mcp-candidate",
      confidence: "medium",
      prescriptionHint: "enable-mcp",
      evidence: {
        type: "command",
        redactable: true,
        descriptionSafe: true,
        toolCallIds: ["c1", "c2"],
        turnIndices: [0, 1],
        catalogEntryId: DOCKER_ENTRY.id,
        replaces: DOCKER_ENTRY.replaces,
        rationale: DOCKER_ENTRY.rationale,
        docsUrl: DOCKER_ENTRY.docsUrl,
        installSnippet: DOCKER_ENTRY.installSnippet,
        estimatedToolTokens: 780,
      },
      metric: {
        serverId: DOCKER_ENTRY.id,
        serverLabel: DOCKER_ENTRY.label,
        hitCount: 2,
        binaries: ["docker"],
        docsUrl: DOCKER_ENTRY.docsUrl,
        estimatedToolTokens: 780,
      },
    });
    expect(result.findings[0].estimationBasis).toContain("780");
  });

  it("uses DEFAULT_MCP_MIN_HITS (2) when minHits is omitted and ignores trivial commands", () => {
    const { minHits: _omitted, ...entryWithoutMinHits } = DOCKER_ENTRY;
    expect(DEFAULT_MCP_MIN_HITS).toBe(2);

    const oneRealPlusTrivial = withCommands(baselineReport, [
      makeCommand("c1", 0, "docker ps", ["docker"]),
      makeCommand("c2", 1, "sleep 1", ["sleep"]),
      makeCommand("c3", 2, "echo done", ["echo"]),
      makeCommand("c4", 3, "true", ["true"]),
    ]);
    expect(
      detectMcpCandidates(oneRealPlusTrivial, [entryWithoutMinHits]).findings
    ).toEqual([]);

    const twoReal = withCommands(baselineReport, [
      makeCommand("c1", 0, "docker ps", ["docker"]),
      makeCommand("c2", 1, "docker compose up -d && sleep 5", ["docker", "sleep"]),
    ]);
    expect(
      detectMcpCandidates(twoReal, [entryWithoutMinHits]).findings
    ).toHaveLength(1);
  });

  it("ignores subtasks (parentId !== null / isSubtask: true) (I-5)", () => {
    const report = withCommands(baselineReport, [
      makeCommand("c1", 0, "docker ps", ["docker"]),
      makeCommand("c2", 1, "docker logs api", ["docker"]),
    ]);
    const subtask = structuredClone(report.tasks[0]);
    subtask.taskId = "subtask-1";
    subtask.parentId = report.tasks[0].taskId;
    subtask.isSubtask = true;
    report.tasks.push(subtask);

    const result = detectMcpCandidates(report, [DOCKER_ENTRY]);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].taskId).toBe(report.tasks[0].taskId);
  });

  it("never raises confidence above medium", () => {
    const report = withCommands(baselineReport, [
      makeCommand("c1", 0, "docker ps", ["docker"]),
      makeCommand("c2", 1, "docker logs api", ["docker"]),
    ]);
    const result = detectMcpCandidates(report, [DOCKER_ENTRY]);

    expect(result.findings.every((finding) => finding.confidence === "medium")).toBe(
      true
    );
    expect(result.findings.some((finding) => finding.confidence === "high")).toBe(
      false
    );
  });

  it("records an unavailable reason for an absent catalogue", () => {
    expect(detectMcpCandidates(baselineReport, undefined)).toEqual({
      findings: [],
      unavailableMetrics: [MCP_CATALOG_ABSENT],
    });
  });

  it("degrades safely for invalid JSON or malformed entries", () => {
    expect(() => detectMcpCandidates(baselineReport, "{ broken json")).not.toThrow();
    expect(detectMcpCandidates(baselineReport, "{ broken json")).toEqual({
      findings: [],
      unavailableMetrics: [MCP_CATALOG_INVALID],
    });
    expect(
      detectMcpCandidates(baselineReport, [{ ...DOCKER_ENTRY, minHits: 0 }])
    ).toEqual({
      findings: [],
      unavailableMetrics: [MCP_CATALOG_INVALID],
    });
  });

  it("treats an empty catalogue as valid and unknown binaries as unmatched", () => {
    expect(detectMcpCandidates(baselineReport, [])).toEqual({
      findings: [],
      unavailableMetrics: [],
    });

    const report = withCommands(baselineReport, [
      makeCommand("unknown-call", 0, "foo --bar", ["foo"]),
    ]);
    expect(detectMcpCandidates(report, [DOCKER_ENTRY])).toEqual({
      findings: [],
      unavailableMetrics: [],
    });
  });

  it("matches HTTP commands through matchesHttp and aggregates hosts", () => {
    const report = withCommands(baselineReport, [
      makeCommand(
        "http-1",
        0,
        "curl https://api.example.test/one",
        ["curl"],
        true,
        "api.example.test"
      ),
      makeCommand(
        "http-2",
        1,
        "http https://other.example.test/two",
        ["http"],
        true,
        "other.example.test"
      ),
    ]);

    const result = detectMcpCandidates(report, [HTTP_ENTRY]);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].metric).toMatchObject({
      hitCount: 2,
      binaries: ["curl", "http"],
      httpHitCount: 2,
      targetHosts: ["api.example.test", "other.example.test"],
    });
  });

  it("counts one command once when both binary and HTTP rules match", () => {
    const entry = { ...HTTP_ENTRY, minHits: 1 };
    const report = withCommands(baselineReport, [
      makeCommand(
        "http-both",
        0,
        "curl https://api.example.test/status",
        ["curl"],
        true,
        "api.example.test"
      ),
    ]);

    const result = detectMcpCandidates(report, [entry]);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].metric.hitCount).toBe(1);
    expect(result.findings[0].evidence.toolCallIds).toEqual(["http-both"]);
  });

  it("emits one finding per server and root task", () => {
    const report = withCommands(baselineReport, [
      makeCommand("c1", 0, "docker ps", ["docker"]),
      makeCommand("c2", 1, "docker logs api", ["docker"]),
    ]);
    const secondTask = structuredClone(report.tasks[0]);
    secondTask.taskId = "second-task";
    report.tasks.push(secondTask);

    const result = detectMcpCandidates(report, [DOCKER_ENTRY]);

    expect(result.findings).toHaveLength(2);
    expect(result.findings.map((finding) => finding.taskId)).toEqual([
      report.tasks[0].taskId,
      "second-task",
    ]);
    expect(new Set(result.findings.map((finding) => finding.id)).size).toBe(2);
  });

  it("is deterministic and does not mutate report or catalogue", () => {
    const report = withCommands(baselineReport, [
      makeCommand("c1", 0, "docker ps", ["docker"]),
      makeCommand("c2", 1, "docker logs api", ["docker"]),
    ]);
    const catalog = [structuredClone(DOCKER_ENTRY)];
    const originalCommands = report.tasks[0].externalCommands.map((command) => ({
      callId: command.callId,
      raw: command.raw,
      binaries: [...command.binaries],
    }));
    const originalCatalog = structuredClone(catalog);

    const first = detectMcpCandidates(report, catalog);
    const second = detectMcpCandidates(report, catalog);

    expect(first).toEqual(second);
    expect(catalog).toEqual(originalCatalog);
    expect(
      report.tasks[0].externalCommands.every((command, index) => {
        const original = originalCommands[index];
        return (
          command.callId === original.callId &&
          command.raw === original.raw &&
          command.binaries.join("\0") === original.binaries.join("\0")
        );
      })
    ).toBe(true);
  });
});
