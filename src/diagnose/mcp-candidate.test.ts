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
  detectMcpCandidates,
  MCP_CATALOG_ABSENT,
  MCP_CATALOG_INVALID,
} from "./index";

const DOCKER_ENTRY: McpCatalogEntry = {
  id: "docker-mcp",
  label: "Docker MCP",
  binaries: ["docker", "docker-compose"],
  matchesHttp: false,
  replaces: "Docker commands executed through the shell.",
  rationale: "Structured tool results avoid interpreting shell output.",
  minHits: 2,
};

const HTTP_ENTRY: McpCatalogEntry = {
  id: "http-mcp",
  label: "HTTP MCP",
  binaries: ["curl", "wget"],
  matchesHttp: true,
  replaces: "HTTP requests executed through shell clients.",
  rationale: "Structured responses avoid parsing command output.",
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

describe("detectMcpCandidates", () => {
  const baselineReport = loadBaselineReport();

  it("suggests Docker from the two matching baseline commands", () => {
    const result = detectMcpCandidates(baselineReport, [
      DOCKER_ENTRY,
      HTTP_ENTRY,
    ]);
    const dockerCommands = baselineReport.tasks[0].externalCommands.filter(
      (command) => command.binaries.includes("docker")
    );

    expect(result.unavailableMetrics).toEqual([]);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      id: `mcp-candidate:${baselineReport.sessionId}:${baselineReport.tasks[0].taskId}:docker-mcp`,
      sessionId: baselineReport.sessionId,
      taskId: baselineReport.tasks[0].taskId,
      kind: "mcp-candidate",
      detectedAt: baselineReport.exportedAt,
      confidence: "medium",
      prescriptionHint: "enable-mcp",
      evidence: {
        type: "command",
        redactable: true,
        toolCallIds: dockerCommands.map((command) => command.callId),
        turnIndices: dockerCommands.map((command) => command.turnIndex),
        catalogEntryId: DOCKER_ENTRY.id,
        replaces: DOCKER_ENTRY.replaces,
        rationale: DOCKER_ENTRY.rationale,
      },
      metric: {
        serverId: DOCKER_ENTRY.id,
        serverLabel: DOCKER_ENTRY.label,
        hitCount: 2,
        binaries: ["docker"],
        httpHitCount: 0,
        targetHosts: [],
      },
    });
    expect(result.findings[0].evidence.externalCommands).toHaveLength(2);
    expect(
      result.findings[0].evidence.externalCommands?.every(
        (raw, index) => raw === dockerCommands[index].raw
      )
    ).toBe(true);
  });

  it("never raises baseline confidence above medium", () => {
    const result = detectMcpCandidates(baselineReport, [DOCKER_ENTRY]);

    expect(result.findings.every((finding) => finding.confidence === "medium"))
      .toBe(true);
    expect(result.findings.some((finding) => finding.confidence === "high"))
      .toBe(false);
  });

  it("records an unavailable reason for an absent catalogue", () => {
    expect(detectMcpCandidates(baselineReport, undefined)).toEqual({
      findings: [],
      unavailableMetrics: [MCP_CATALOG_ABSENT],
    });
  });

  it("degrades safely for invalid JSON or malformed entries", () => {
    expect(() => detectMcpCandidates(baselineReport, "{ broken json"))
      .not.toThrow();
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

  it("does not emit when minHits is not reached", () => {
    const dockerCommand = baselineReport.tasks[0].externalCommands.find(
      (command) => command.binaries.includes("docker")
    );
    if (!dockerCommand) {
      throw new Error("Baseline Docker command not found");
    }
    const report = withCommands(baselineReport, [dockerCommand]);

    expect(detectMcpCandidates(report, [DOCKER_ENTRY]).findings).toEqual([]);
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
      binaries: ["curl"],
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

  it("emits one finding per server and task", () => {
    const report = structuredClone(baselineReport);
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
    const report = structuredClone(baselineReport);
    const catalog = [structuredClone(DOCKER_ENTRY)];
    const originalCommands = report.tasks[0].externalCommands.map((command) => ({
      callId: command.callId,
      raw: command.raw,
      binaries: [...command.binaries],
    }));
    const originalCatalog = structuredClone(catalog);

    const first = detectMcpCandidates(report, catalog);
    const second = detectMcpCandidates(report, catalog);

    expect(first.findings.map((finding) => finding.id)).toEqual(
      second.findings.map((finding) => finding.id)
    );
    expect(first.findings.map((finding) => finding.metric)).toEqual(
      second.findings.map((finding) => finding.metric)
    );
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
