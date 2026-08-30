import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import {
  MCP_CATALOG_ABSENT,
  TOOL_CATALOG_ABSENT,
} from "../catalog";
import type { ObserveReport } from "../domain/types";
import { observe } from "../observe";
import { parseSession } from "../parser";
import { diagnoseWithCatalogs } from "./index";

function loadBaselineReport(): ObserveReport {
  const raw = readFileSync(
    resolve(__dirname, "../../benchmark/rodada-a.json"),
    "utf-8"
  );
  const parsed = parseSession(raw);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return observe(parsed.value);
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
        expect.objectContaining({ name: "read_xlsx", group: "editing" }),
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

  it("keeps unknown tools visible under the outros group", () => {
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
        group: "outros",
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
