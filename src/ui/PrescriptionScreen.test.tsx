// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Finding, Prescription } from "../domain/types";
import { diagnoseWithCatalogs } from "../diagnose";
import { observe } from "../observe";
import { parseSession } from "../parser";
import {
  prescribeAgentsMd,
  prescribeCustomMode,
  prescribeMcpEnablement,
  prescribeOverheadReduction,
} from "../prescribe";
import { PrescriptionScreen, type PrescriptionScreenProps } from "./PrescriptionScreen";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

interface MountedScreen {
  container: HTMLDivElement;
  root: Root;
}

const mounted: MountedScreen[] = [];

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "finding-1",
    sessionId: "session-1",
    taskId: "task-1",
    kind: "project-rules-absent",
    detectedAt: 1_700_000_000_000,
    evidence: {
      type: "breakdown",
      redactable: false,
      fieldPath: "tasks[0].context.breakdown.projectRules",
      breakdownField: "projectRules",
      breakdownValue: 0,
    },
    confidence: "high",
    metric: {},
    prescriptionHint: "agents-md-file",
    ...overrides,
  };
}

function prescription(overrides: Partial<Prescription> = {}): Prescription {
  return {
    id: "prescription-1",
    sessionId: "session-1",
    taskId: "task-1",
    findingIds: ["finding-1"],
    kind: "agents-md-file",
    status: "pending",
    createdAt: 1_700_000_000_000,
    content: "# AGENTS.md\n\n- Keep changes focused.",
    rationale: "Add stable project guidance.",
    ...overrides,
  };
}

function mcpFinding(): Finding {
  return finding({
    id: "finding-mcp",
    kind: "mcp-candidate",
    evidence: {
      type: "command",
      redactable: true,
      toolCallIds: ["call-1", "call-2"],
      turnIndices: [2, 5],
      externalCommands: [
        "docker build <script>alert('xss')</script>",
        "docker run --rm app",
      ],
      catalogEntryId: "docker-mcp",
      replaces: "Replaces Docker shell commands with structured MCP calls.",
      rationale: "Shell output is unstructured; MCP responses are structured data.",
    },
    confidence: "medium",
    metric: {
      serverLabel: "Docker MCP Server",
      hitCount: 2,
      binaries: ["docker"],
    },
    prescriptionHint: "enable-mcp",
  });
}

function mount(props: Partial<PrescriptionScreenProps> = {}): MountedScreen {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <PrescriptionScreen
        prescriptions={props.prescriptions ?? []}
        findings={props.findings ?? []}
        existingAgentsMd={props.existingAgentsMd ?? null}
        onNavigateToFinding={props.onNavigateToFinding}
        focusedPrescriptionId={props.focusedPrescriptionId}
      />
    );
  });
  const result = { container, root };
  mounted.push(result);
  return result;
}

function tab(container: HTMLElement, prefix: string): HTMLButtonElement {
  const match = [
    ...container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
  ].find((candidate) => candidate.textContent?.startsWith(prefix));
  if (!match) throw new Error(`Missing ${prefix} tab`);
  return match;
}

function click(element: Element): void {
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function loadBaseline() {
  const raw = readFileSync(join(process.cwd(), "benchmark/rodada-a.json"), "utf8");
  const parsed = parseSession(raw);
  if (!parsed.ok) throw new Error(parsed.error.message);
  const report = observe(parsed.value, 270_000);
  const diagnosed = diagnoseWithCatalogs(report);
  const rootTaskIds = report.tasks
    .filter((t) => t.parentId === null)
    .map((t) => t.taskId);
  return {
    report,
    findings: diagnosed.findings,
    prescriptions: [
      ...prescribeAgentsMd(diagnosed.findings, { rootTaskIds }),
      ...prescribeCustomMode(diagnosed.findings),
      ...prescribeOverheadReduction(diagnosed.findings),
      ...prescribeMcpEnablement(diagnosed.findings),
    ],
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  while (mounted.length > 0) {
    const item = mounted.pop();
    if (!item) continue;
    act(() => item.root.unmount());
    item.container.remove();
  }
});

describe("PrescriptionScreen", () => {
  it("hides empty tabs, hides Subagents, and orders non-empty tabs by estimated token saving", () => {
    const baseline = loadBaseline();
    const { container } = mount({
      prescriptions: baseline.prescriptions,
      findings: baseline.findings,
    });

    const tabs = [
      ...container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    ];
    // Skills (1541) > Tools (~1409) > AGENTS.md (0) > MCPs (0); no Subagents tab
    expect(tabs.map((t) => t.textContent)).toEqual([
      "Skills (1)",
      expect.stringMatching(/^Tools \(\d+\)$/),
      "AGENTS.md (1)",
      "MCPs (1)",
    ]);
    expect(container.textContent).not.toContain("Subagents");
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");

    // Keyboard navigation works over visible tabs
    act(() => {
      tabs[0].dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
      );
    });
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs[1]);

    act(() => {
      tabs[1].dispatchEvent(
        new KeyboardEvent("keydown", { key: "End", bubbles: true })
      );
    });
    expect(document.activeElement).toBe(tabs[3]);
  });

  it("renders no tabs and an empty state when there are no traceable prescriptions", () => {
    const { container } = mount();
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(0);
    expect(container.textContent).toContain(
      "No configuration recommendations for this session."
    );
  });

  it("renders custom-mode YAML with Bob groups, Copy/Download custom_modes.yaml, and tool purposes", () => {
    const baseline = loadBaseline();
    const { container } = mount({
      prescriptions: baseline.prescriptions,
      findings: baseline.findings,
    });

    click(tab(container, "Tools"));
    const toolsPanel = container.querySelector("#panel-tools")!;
    expect(toolsPanel.hasAttribute("hidden")).toBe(false);
    expect(toolsPanel.textContent).toContain(".bob/custom_modes.yaml");
    expect(toolsPanel.textContent).toContain("Enabled Bob tool groups");
    expect(toolsPanel.textContent).toContain("customModes:");
    expect(
      toolsPanel.querySelector('[aria-label="Copy custom_modes.yaml"]')
    ).toBeTruthy();
    expect(
      toolsPanel.querySelector(
        '[aria-label="Download custom_modes.yaml as custom_modes.yaml"]'
      )
    ).toBeTruthy();

    // Tool purposes from structured `tools` are rendered (not null/missing)
    const disableTool = baseline.prescriptions.find(
      (p) => p.kind === "disable-tool" && p.tools?.some((t) => t.purpose !== null)
    );
    const sampleTool = disableTool?.tools?.find((t) => t.purpose !== null);
    expect(sampleTool?.purpose).toBeTruthy();
    expect(toolsPanel.textContent).toContain(sampleTool!.purpose!);
  });

  it("renders MCP docsUrl only when non-null, installSnippet with Copy, and estimatedTokenCost", () => {
    const sourceA = mcpFinding();
    const sourceB = finding({
      id: "finding-mcp-nodocs",
      kind: "mcp-candidate",
      evidence: {
        type: "command",
        redactable: true,
        externalCommands: ["gh pr list"],
        catalogEntryId: "github-mcp",
      },
      metric: { serverLabel: "GitHub MCP", hitCount: 2, binaries: ["gh"] },
      prescriptionHint: "enable-mcp",
    });

    const withDocs = prescription({
      id: "mcp-with-docs",
      findingIds: [sourceA.id],
      kind: "enable-mcp",
      content: "Docker MCP Server",
      docsUrl: "https://docs.docker.com/ai/mcp-catalog-and-toolkit/",
      installSnippet: '{\n  "mcpServers": { "docker": {} }\n}',
      estimatedTokenCost: 1200,
      isEstimate: true,
      steps: ["Open Settings -> MCP."],
    });
    const withoutDocs = prescription({
      id: "mcp-without-docs",
      findingIds: [sourceB.id],
      kind: "enable-mcp",
      content: "GitHub MCP",
      docsUrl: null,
      estimatedTokenCost: 900,
      isEstimate: true,
    });

    const { container } = mount({
      prescriptions: [withDocs, withoutDocs],
      findings: [sourceA, sourceB],
    });

    const mcpsPanel = container.querySelector("#panel-mcps")!;
    const links = [...mcpsPanel.querySelectorAll("a")];
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe(
      "https://docs.docker.com/ai/mcp-catalog-and-toolkit/"
    );
    expect(mcpsPanel.textContent).toContain("+~1200 tokens/turn");
    expect(mcpsPanel.textContent).toContain("estimate");
    expect(mcpsPanel.textContent).toContain('"mcpServers"');
    expect(
      mcpsPanel.querySelector('[aria-label="Copy Docker MCP Server MCP snippet"]')
    ).toBeTruthy();
    expect(mcpsPanel.textContent).toContain("Open Settings -> MCP.");
  });

  it("renders Skills with a single estimate/measured label and Bob steps", () => {
    const baseline = loadBaseline();
    const { container } = mount({
      prescriptions: baseline.prescriptions,
      findings: baseline.findings,
    });

    click(tab(container, "Skills"));
    const skillsPanel = container.querySelector("#panel-skills")!;
    expect(skillsPanel.textContent).toContain("1541 tokens");
    expect(skillsPanel.textContent).toContain("estimate");
    expect(skillsPanel.textContent).not.toContain("Measured skill tokens:");
    expect(skillsPanel.textContent).toContain("Settings → Skills");
  });

  it("shows a colored diff against an existing AGENTS.md and a new-file state", () => {
    const source = finding();
    const generated = prescription();
    const existing = mount({
      prescriptions: [generated],
      findings: [source],
      existingAgentsMd: "# OLD\n\n- obsolete",
    }).container;
    expect(
      existing.querySelector('[aria-label="AGENTS.md diff"]')?.textContent
    ).toContain("- # OLD");
    expect(
      existing.querySelector('[aria-label="AGENTS.md diff"]')?.textContent
    ).toContain("+ # AGENTS.md");

    const created = mount({
      prescriptions: [generated],
      findings: [source],
    }).container;
    expect(created.textContent).toContain("new file");
    expect(
      created.querySelector('[aria-label="AGENTS.md diff"]')?.textContent
    ).not.toContain("- #");
  });

  it("copies the exact in-memory content", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const source = finding();
    const generated = prescription();
    const { container } = mount({
      prescriptions: [generated],
      findings: [source],
    });

    click(container.querySelector('[aria-label="Copy AGENTS.md"]') as Element);
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(generated.content));
  });

  it("downloads a browser Blob without making a network request", () => {
    const createObjectURL = vi.fn(
      (_object: Blob | MediaSource): string => "blob:hindsight-test"
    );
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const source = finding();
    const generated = prescription();
    const { container } = mount({
      prescriptions: [generated],
      findings: [source],
    });

    click(
      container.querySelector(
        '[aria-label="Download AGENTS.md as AGENTS.md"]'
      ) as Element
    );
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(anchorClick).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:hindsight-test");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("redacts MCP command evidence by default and reveals per-item after warning as escaped text", () => {
    const source = mcpFinding();
    const recommendation = prescription({
      id: "prescription-mcp",
      findingIds: [source.id],
      kind: "enable-mcp",
      content: "Docker MCP Server",
    });
    const { container } = mount({
      prescriptions: [recommendation],
      findings: [source],
    });

    // No global reveal switch
    expect(container.querySelector("[aria-pressed]")).toBeNull();
    expect(container.textContent).not.toContain("docker run --rm app");
    expect(container.textContent).toContain("[REDACTED]");

    const showBtn = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Show raw content…"
    );
    expect(showBtn).toBeTruthy();
    click(showBtn!);

    // Still hidden until warning is confirmed
    expect(container.querySelector('[role="alert"]')).toBeTruthy();
    expect(container.textContent).not.toContain("docker run --rm app");

    const confirmBtn = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Understood — show this item"
    );
    click(confirmBtn!);

    expect(container.textContent).toContain("docker run --rm app");
    expect(container.textContent).toContain("<script>alert('xss')</script>");
    expect(container.querySelector("script")).toBeNull();
  });

  it("links back to origin findings and focuses focusedPrescriptionId", () => {
    const onNavigate = vi.fn();
    const source = mcpFinding();
    const mcp = prescription({
      id: "prescription-mcp",
      findingIds: [source.id],
      kind: "enable-mcp",
      content: "Docker MCP Server",
    });
    const agentsSource = finding();
    const agents = prescription({
      id: "prescription-agents",
      findingIds: [agentsSource.id],
      kind: "agents-md-file",
    });

    const { container } = mount({
      prescriptions: [agents, mcp],
      findings: [agentsSource, source],
      onNavigateToFinding: onNavigate,
      focusedPrescriptionId: "prescription-mcp",
    });

    expect(tab(container, "MCPs").getAttribute("aria-selected")).toBe("true");
    const card = container.querySelector('[data-prescription-id="prescription-mcp"]');
    expect(card?.getAttribute("data-focused")).toBe("true");

    const backBtn = card?.querySelector(
      '[aria-label="View finding: MCP server candidate"]'
    );
    expect(backBtn).toBeTruthy();
    click(backBtn!);
    expect(onNavigate).toHaveBeenCalledWith(source.id);
  });

  it("does not render prescriptions with missing origin findings", () => {
    const { container } = mount({
      prescriptions: [prescription()],
      findings: [],
    });
    expect(container.textContent).toContain(
      "No configuration recommendations for this session."
    );
    expect(container.textContent).not.toContain("Add stable project guidance");
  });
});
