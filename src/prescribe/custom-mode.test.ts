import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import { diagnoseWithCatalogs } from "../diagnose";
import type { BobToolGroup, Finding } from "../domain/types";
import { observe } from "../observe";
import { parseSession } from "../parser";
import {
  CANONICAL_BOB_GROUPS,
  prescribeCustomMode,
  renderCustomModesYaml,
} from "./custom-mode";

function loadBaseline() {
  const raw = readFileSync(
    resolve(__dirname, "../../benchmark/rodada-a.json"),
    "utf-8"
  );
  const parsed = parseSession(raw);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return observe(parsed.value);
}

function makeUnusedFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "unused-tool:session-1:task-1",
    sessionId: "session-1",
    taskId: "task-1",
    kind: "unused-tool",
    detectedAt: 1_700_000_000_000,
    evidence: {
      type: "breakdown",
      redactable: false,
      unusedTools: ["use_skill", "switch_mode"],
    },
    confidence: "high",
    metric: {
      retainedBobGroups: ["read", "edit", "execute", "todo"],
      disableableBobGroups: ["skill", "mode"],
      tokenImpactIsEstimate: true,
    },
    tokenImpact: 470,
    estimationBasis: "Estimated by Bob group.",
    prescriptionHint: "disable-tool",
    ...overrides,
  };
}

function makeMcpFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "mcp-candidate:session-1:task-1:docker-mcp",
    sessionId: "session-1",
    taskId: "task-1",
    kind: "mcp-candidate",
    detectedAt: 1_700_000_000_500,
    evidence: {
      type: "command",
      redactable: true,
      catalogEntryId: "docker-mcp",
      externalCommands: ["docker ps --secret=hunter2"],
    },
    confidence: "medium",
    metric: { serverLabel: "Docker MCP Server", hitCount: 3 },
    prescriptionHint: "enable-mcp",
    ...overrides,
  };
}

describe("renderCustomModesYaml", () => {
  it("emits valid IBM Bob custom_modes.yaml using only canonical Bob groups", () => {
    const yaml = renderCustomModesYaml([
      "todo",
      "read",
      "other" as BobToolGroup,
      "editing" as BobToolGroup,
      "execute",
      "edit",
    ]);

    expect(yaml).toContain("customModes:");
    expect(yaml).toContain("slug: hindsight-optimized");
    expect(yaml).toContain("groups:\n      - read\n      - edit\n      - execute\n      - todo");
    expect(yaml).not.toContain("- other");
    expect(yaml).not.toContain("- editing");
  });
});

describe("prescribeCustomMode", () => {
  it("generates a .bob/custom_modes.yaml matching benchmark/round-b-config groups for rodada-a.json (and adds mcp when mcp-candidate fires)", () => {
    const baseline = loadBaseline();
    const withoutMcp = diagnoseWithCatalogs(baseline, { mcp: [] });
    const prescriptionsWithoutMcp = prescribeCustomMode(withoutMcp.findings);

    expect(prescriptionsWithoutMcp).toHaveLength(1);
    const rx = prescriptionsWithoutMcp[0];

    expect(rx.kind).toBe("custom-mode");
    expect(rx.targetFile).toBe(".bob/custom_modes.yaml");
    expect(rx.groups).toEqual(["read", "edit", "execute", "todo"]);
    expect(rx.estimatedTokenSaving).toBe((5403 / 23) * 5);
    expect(rx.isEstimate).toBe(true);
    expect(rx.estimationBasis).toContain("5/23");
    expect(rx.steps?.length).toBeGreaterThanOrEqual(3);

    // Every emitted YAML group must belong to CANONICAL_BOB_GROUPS
    const yamlGroups = (rx.content ?? "")
      .split("\n")
      .filter((line) => line.startsWith("      - "))
      .map((line) => line.slice("      - ".length).trim());

    expect(yamlGroups).toEqual(["read", "edit", "execute", "todo"]);
    for (const group of yamlGroups) {
      expect(CANONICAL_BOB_GROUPS).toContain(group);
    }

    // Compare directly against benchmark/round-b-config/.bob/custom_modes.yaml groups
    const roundBYaml = readFileSync(
      resolve(__dirname, "../../benchmark/round-b-config/.bob/custom_modes.yaml"),
      "utf-8"
    );
    const roundBGroups = roundBYaml
      .split("\n")
      .filter((line) => line.startsWith("      - "))
      .map((line) => line.slice("      - ".length).trim());
    expect(yamlGroups).toEqual(roundBGroups);

    // With bundled MCP catalog (docker-mcp fires on rodada-a.json), 'mcp' is included for consistency
    const withBundledMcp = diagnoseWithCatalogs(baseline);
    const [rxWithMcp] = prescribeCustomMode(withBundledMcp.findings);
    expect(rxWithMcp.groups).toEqual(["read", "edit", "execute", "todo", "mcp"]);
    expect(rxWithMcp.content).toContain("      - mcp");
  });

  it("includes 'mcp' automatically when an mcp-candidate finding exists for the same task", () => {
    const unused = makeUnusedFinding();
    const mcp = makeMcpFinding();

    const [rx] = prescribeCustomMode([unused, mcp]);
    expect(rx.groups).toEqual(["read", "edit", "execute", "todo", "mcp"]);
    expect(rx.content).toContain("      - mcp");
    expect(rx.findingIds).toEqual([mcp.id, unused.id]);
    expect(rx.rationale).toContain("mcp");
    // Never leaks command secrets
    expect(rx.content).not.toContain("hunter2");
    expect(rx.rationale).not.toContain("hunter2");
  });

  it("is deterministic regardless of finding order and deduplicates repeated IDs", () => {
    const unused = makeUnusedFinding();
    const mcp = makeMcpFinding();

    expect(prescribeCustomMode([unused, mcp, unused])).toEqual(
      prescribeCustomMode([mcp, unused])
    );
  });

  it("returns an empty array when there are no unused-tool findings", () => {
    expect(prescribeCustomMode([])).toEqual([]);
    expect(prescribeCustomMode([makeMcpFinding()])).toEqual([]);
  });
});
