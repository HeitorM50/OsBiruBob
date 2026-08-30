import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import { analyzeExport } from "./analysis";

const baseline = readFileSync(resolve(__dirname, "../../fixtures/sample-export.json"), "utf8");

describe("analyzeExport", () => {
  it("runs parse, observe and diagnose over the real baseline", () => {
    const result = analyzeExport(baseline, "baseline.json", "demo");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.fileName).toBe("baseline.json");
    expect(result.value.source).toBe("demo");
    expect(result.value.report.totals).toMatchObject({ taskCount: 1, assistantTurns: 5, cost: 0.336902 });
    expect(result.value.diagnosis.findings.map((finding) => finding.kind)).toEqual([
      "project-rules-absent",
      "skill-overhead",
      "mcp-candidate",
      "unused-tool",
    ]);
  });

  it.each([
    ["", "empty-file"],
    ["{", "invalid-json"],
    [JSON.stringify({ name: "hindsight" }), "not-bob-export"],
  ] as const)("returns a controlled error for %j", (raw, code) => {
    const result = analyzeExport(raw, "input.json", "file");
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe(code);
    expect(result.error.message).not.toContain("SyntaxError");
    expect(result.error.message).not.toContain("at JSON.parse");
  });
});
