import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import {
  MCP_CATALOG_ABSENT,
  TOOL_CATALOG_ABSENT,
} from "../catalog";
import type { Finding, ObserveReport, Session } from "../domain/types";
import { observe } from "../observe";
import { parseSession } from "../parser";
import { diagnoseWithCatalogs } from "./index";

function loadFixtureSession(relativePath: string): Session {
  const raw = readFileSync(resolve(__dirname, relativePath), "utf-8");
  const parsed = parseSession(raw);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

function loadBaselineReport(): ObserveReport {
  return observe(loadFixtureSession("../../benchmark/rodada-a.json"));
}

describe("diagnose — recommendation catalogs", () => {
  const baseline = loadBaselineReport();

  it("uses the bundled catalogs for MCP and unused-tool findings", () => {
    const result = diagnoseWithCatalogs(baseline);
    const mcpFinding = result.findings.find(
      (finding) => finding.kind === "mcp-candidate"
    );
    const unusedFinding = result.findings.find(
      (finding) => finding.kind === "unused-tool"
    );

    expect(result.unavailableMetrics).toEqual([]);
    expect(mcpFinding?.metric.serverId).toBe("docker-mcp");
    expect(mcpFinding?.metric.hitCount).toBe(2);
    expect(unusedFinding).toBeDefined();
    expect(unusedFinding?.metric.idleTools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "read_xlsx", group: "read" }),
      ])
    );
  });

  it("records reasons and emits no related findings for absent catalogs", () => {
    const result = diagnoseWithCatalogs(baseline, {
      mcp: null,
      tools: undefined,
    });

    expect(result.unavailableMetrics).toEqual([
      MCP_CATALOG_ABSENT,
      TOOL_CATALOG_ABSENT,
    ]);
    expect(
      result.findings.some(
        (finding) =>
          finding.kind === "mcp-candidate" || finding.kind === "unused-tool"
      )
    ).toBe(false);
  });

  it("keeps unknown tools visible under the other group", () => {
    const report = structuredClone(baseline);
    const inventory = report.tasks[0].toolInventory;
    if (inventory === null) throw new Error("Expected baseline tool inventory");
    inventory.available = ["future_tool"];
    inventory.used = [];
    inventory.idle = ["future_tool"];
    inventory.idleRatio = 1;

    const result = diagnoseWithCatalogs(report, { mcp: [] });
    const finding = result.findings.find(
      (candidate) => candidate.kind === "unused-tool"
    );

    expect(finding?.evidence.unusedTools).toEqual(["future_tool"]);
    expect(finding?.metric.idleTools).toEqual([
      {
        name: "future_tool",
        group: "other",
        purpose: null,
        essential: false,
      },
    ]);
  });

  it("does not recommend disabling an essential idle tool", () => {
    const report = structuredClone(baseline);
    const inventory = report.tasks[0].toolInventory;
    if (inventory === null) throw new Error("Expected baseline tool inventory");
    inventory.available = ["read_file"];
    inventory.used = [];
    inventory.idle = ["read_file"];
    inventory.idleRatio = 1;

    const result = diagnoseWithCatalogs(report, { mcp: [] });

    expect(
      result.findings.some((finding) => finding.kind === "unused-tool")
    ).toBe(false);
  });
});

function collectPublicFindingTexts(finding: Finding): string[] {
  const fields: string[] = [finding.id, JSON.stringify(finding.metric)];
  if (finding.description !== undefined) fields.push(finding.description);
  if (finding.prescription !== undefined) fields.push(finding.prescription);
  if (finding.evidence.fieldPath !== undefined) {
    fields.push(finding.evidence.fieldPath);
  }
  if (finding.evidence.rationale !== undefined) {
    fields.push(finding.evidence.rationale);
  }
  return fields;
}

function extractExportFilenames(session: Session): string[] {
  const filenames = new Set<string>();
  for (const turn of session.tasks) {
    for (const msg of turn.messages) {
      if (msg.role === "assistant" && msg.data.toolCalls) {
        for (const call of msg.data.toolCalls) {
          const pathArg = call.arguments.path;
          if (typeof pathArg === "string" && pathArg.includes("/")) {
            const basename = pathArg.split("/").filter(Boolean).pop();
            if (basename) filenames.add(basename);
          }
        }
      }
    }
  }
  return [...filenames];
}

function extractUserMessageExcerpts(session: Session): string[] {
  const excerpts = new Set<string>();
  for (const turn of session.tasks) {
    for (const msg of turn.messages) {
      if (msg.role === "user") {
        const trimmed = msg.data.content.trim();
        if (trimmed.length > 0) {
          excerpts.add(trimmed.slice(0, 40));
        }
      }
    }
  }
  return [...excerpts];
}

describe("diagnose — redaction & core invariants", () => {
  it("removes the obsolete run-all-detectors module", () => {
    expect(existsSync(resolve(__dirname, "run-all-detectors.ts"))).toBe(false);
    expect(existsSync(resolve(__dirname, "run-all-detectors.test.ts"))).toBe(false);
  });

  it("never leaks export file paths or user message content on fixtures/sample-export.json", () => {
    const sampleSession = loadFixtureSession("../../fixtures/sample-export.json");
    const sampleReport = observe(sampleSession);
    const { findings } = diagnoseWithCatalogs(sampleReport);

    const exportFilenames = extractExportFilenames(sampleSession);
    const userExcerpts = extractUserMessageExcerpts(sampleSession);

    expect(findings.length).toBeGreaterThan(0);
    expect(exportFilenames.length).toBeGreaterThan(0);
    expect(userExcerpts.length).toBeGreaterThan(0);

    for (const finding of findings) {
      expect(Number.isInteger(finding.detectedAt)).toBe(true);
      expect(finding.detectedAt).toBeGreaterThan(1_000_000_000_000);

      for (const text of collectPublicFindingTexts(finding)) {
        for (const filename of exportFilenames) {
          expect(text).not.toContain(`/${filename}`);
          expect(text).not.toContain(filename);
        }
        for (const excerpt of userExcerpts) {
          expect(text).not.toContain(excerpt);
        }
      }
    }
  });

  it("never leaks paths or user content even when redundant-read, human-intervention, and retry-after-error fire", () => {
    const sampleSession = loadFixtureSession("../../fixtures/sample-export.json");
    const augmentedReport = structuredClone(observe(sampleSession));
    const rootTask = augmentedReport.tasks[0];

    const secretPath = "bob-get-started/express-todo-api-modern/src/index.ts";
    const secretUserContent =
      "Use internal credentials from /etc/private-secrets.env with token ZZZ-999";

    // Trigger redundant-read on a real export path
    rootTask.toolCalls.push(
      {
        callId: "tooluse_extra_read_1",
        name: "read_file",
        arguments: { path: secretPath },
        turnIndex: 10,
        assistantMessageId: "asst-10",
        resultMessageId: "res-10",
        isError: false,
        errorMessage: null,
        permission: "read",
        durationMs: 12,
        isOutsideWorkspace: false,
      },
      {
        callId: "tooluse_extra_read_2",
        name: "read_file",
        arguments: { path: secretPath },
        turnIndex: 12,
        assistantMessageId: "asst-12",
        resultMessageId: "res-12",
        isError: false,
        errorMessage: null,
        permission: "read",
        durationMs: 12,
        isOutsideWorkspace: false,
      },
      // Trigger retry-after-error with sensitive error text
      {
        callId: "tooluse_err_1",
        name: "write_file",
        arguments: { path: secretPath },
        turnIndex: 13,
        assistantMessageId: "asst-13",
        resultMessageId: "res-13",
        isError: true,
        errorMessage: `Permission denied writing ${secretPath}`,
        permission: "edit",
        durationMs: 15,
        isOutsideWorkspace: false,
      },
      {
        callId: "tooluse_err_2",
        name: "write_file",
        arguments: { path: secretPath },
        turnIndex: 14,
        assistantMessageId: "asst-14",
        resultMessageId: "res-14",
        isError: false,
        errorMessage: null,
        permission: "edit",
        durationMs: 15,
        isOutsideWorkspace: false,
      }
    );

    // Trigger human-intervention with sensitive user content
    rootTask.humanInterventions.push({
      messageId: "user-extra-1",
      afterTurnIndex: 4,
      timestamp: rootTask.createdAt + 5000,
      content: secretUserContent,
    });

    const { findings } = diagnoseWithCatalogs(augmentedReport);
    const kinds = new Set(findings.map((f) => f.kind));

    expect(kinds.has("redundant-read")).toBe(true);
    expect(kinds.has("human-intervention")).toBe(true);
    expect(kinds.has("retry-after-error")).toBe(true);
    expect(kinds.has("project-rules-absent")).toBe(true);

    for (const finding of findings) {
      for (const text of collectPublicFindingTexts(finding)) {
        expect(text).not.toContain("/index.ts");
        expect(text).not.toContain("index.ts");
        expect(text).not.toContain("bob-get-started");
        expect(text).not.toContain("/private-secrets.env");
        expect(text).not.toContain("private-secrets.env");
        expect(text).not.toContain("ZZZ-999");
        expect(text).not.toContain(secretUserContent.slice(0, 30));
      }
    }
  });
});
