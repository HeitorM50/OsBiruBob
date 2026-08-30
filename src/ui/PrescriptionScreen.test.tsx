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
        contextPressure={props.contextPressure ?? null}
      />
    );
  });
  const result = { container, root };
  mounted.push(result);
  return result;
}

function tab(container: HTMLElement, label: string): HTMLButtonElement {
  const match = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
    (candidate) => candidate.textContent === label
  );
  if (!match) throw new Error(`Missing ${label} tab`);
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
  return {
    report,
    findings: diagnosed.findings,
    prescriptions: [
      ...prescribeAgentsMd(diagnosed.findings),
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
  it("renders all five tabs and supports real keyboard navigation", () => {
    const { container } = mount();
    const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs.map((item) => item.textContent)).toEqual([
      "AGENTS.md",
      "Tools",
      "Skills",
      "MCPs",
      "Subagents",
    ]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");

    act(() => {
      tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs[1]);
    expect(container.querySelector("#panel-agents-md")?.hasAttribute("hidden")).toBe(true);
    expect(container.querySelector("#panel-tools")?.hasAttribute("hidden")).toBe(false);

    act(() => {
      tabs[1].dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    });
    expect(document.activeElement).toBe(tabs[4]);
  });

  it("renders the real baseline with four populated families and 18 idle tools", () => {
    const baseline = loadBaseline();
    expect(baseline.prescriptions.some((item) => item.kind === "agents-md-file")).toBe(true);
    expect(baseline.prescriptions.some((item) => item.kind === "disable-skill")).toBe(true);
    expect(baseline.prescriptions.some((item) => item.kind === "enable-mcp")).toBe(true);

    const idleTools = baseline.prescriptions
      .filter((item) => item.kind === "disable-tool")
      .flatMap((item) => item.content?.split("\n").filter((line) => line.startsWith("- ")) ?? []);
    expect(idleTools).toHaveLength(18);

    const { container } = mount({
      prescriptions: baseline.prescriptions,
      findings: baseline.findings,
      existingAgentsMd: readFileSync(join(process.cwd(), "AGENTS.md"), "utf8"),
      contextPressure: baseline.report.tasks[0]?.context.pressure ?? null,
    });

    click(tab(container, "MCPs"));
    expect(container.querySelector("#panel-mcps")?.textContent).toContain("Docker MCP Server");
    expect(container.querySelector("#panel-mcps")?.textContent).toContain("2 matching commands");

    click(tab(container, "Subagents"));
    expect(container.querySelector("#panel-subagents")?.textContent).toContain("6.5%");
    expect(container.querySelector("#panel-subagents")?.textContent).toContain(
      "No traceable subagent prescription"
    );
  });

  it("shows a colored diff against an existing AGENTS.md and a new-file state", () => {
    const source = finding();
    const generated = prescription();
    const existing = mount({
      prescriptions: [generated],
      findings: [source],
      existingAgentsMd: "# OLD\n\n- obsolete",
    }).container;
    expect(existing.querySelector('[aria-label="AGENTS.md diff"]')?.textContent).toContain("- # OLD");
    expect(existing.querySelector('[aria-label="AGENTS.md diff"]')?.textContent).toContain("+ # AGENTS.md");

    const created = mount({ prescriptions: [generated], findings: [source] }).container;
    expect(created.textContent).toContain("new file");
    expect(created.querySelector('[aria-label="AGENTS.md diff"]')?.textContent).not.toContain("- #");
  });

  it("keeps every empty tab visible and explains the absence", () => {
    const { container } = mount();
    const expectations = new Map([
      ["AGENTS.md", "No AGENTS.md recommendation"],
      ["Tools", "No idle tool recommendations"],
      ["Skills", "No loaded-but-unused Skill recommendations"],
      ["MCPs", "No MCP server recommendations"],
      ["Subagents", "Not evaluable"],
    ]);

    for (const [label, message] of expectations) {
      click(tab(container, label));
      const panelId = tab(container, label).getAttribute("aria-controls");
      expect(container.querySelector(`#${panelId}`)?.textContent).toContain(message);
    }
  });

  it("copies the exact in-memory content", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const source = finding();
    const generated = prescription();
    const { container } = mount({ prescriptions: [generated], findings: [source] });

    click(container.querySelector('[aria-label="Copy AGENTS.md"]') as Element);
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(generated.content));
  });

  it("downloads a browser Blob without making a network request", () => {
    const createObjectURL = vi.fn(() => "blob:hindsight-test");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const source = finding();
    const generated = prescription();
    const { container } = mount({ prescriptions: [generated], findings: [source] });

    click(container.querySelector('[aria-label="Download AGENTS.md as AGENTS.md"]') as Element);
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(anchorClick).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:hindsight-test");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("labels token savings as estimates", () => {
    const source = finding({ id: "finding-tools", kind: "unused-tool", prescriptionHint: "disable-tool" });
    const recommendation = prescription({
      id: "prescription-tools",
      findingIds: [source.id],
      kind: "disable-tool",
      content: "Group: editing\n\n- apply_diff",
      estimatedTokenSaving: 300,
    });
    const { container } = mount({ prescriptions: [recommendation], findings: [source] });
    click(tab(container, "Tools"));
    expect(container.querySelector("#panel-tools")?.textContent).toContain("300 tokens");
    expect(container.querySelector("#panel-tools")?.textContent).toContain("estimate");
  });

  it("redacts MCP command evidence by default and reveals it only as escaped text", () => {
    const source = mcpFinding();
    const recommendation = prescription({
      id: "prescription-mcp",
      findingIds: [source.id],
      kind: "enable-mcp",
      content: "Docker MCP Server",
    });
    const { container } = mount({ prescriptions: [recommendation], findings: [source] });
    click(tab(container, "MCPs"));
    expect(container.textContent).not.toContain("docker run --rm app");
    expect(container.textContent).toContain("[REDACTED]");

    click(container.querySelector("[aria-pressed=\"false\"]") as Element);
    expect(container.textContent).toContain("docker run --rm app");
    expect(container.textContent).toContain("<script>alert('xss')</script>");
    expect(container.querySelector("script")).toBeNull();
  });

  it("does not render prescriptions with missing origin findings", () => {
    const { container } = mount({ prescriptions: [prescription()], findings: [] });
    expect(container.textContent).toContain("No AGENTS.md recommendation");
    expect(container.textContent).not.toContain("Add stable project guidance");
  });

  it("treats pressure as a ratio and does not infer a subagent prescription", () => {
    const low = mount({ contextPressure: 0.065 }).container;
    click(tab(low, "Subagents"));
    expect(low.querySelector("#panel-subagents")?.textContent).toContain("6.5%");
    expect(low.querySelector("#panel-subagents")?.textContent).not.toContain(
      "Split the work into subagents"
    );

    const unavailable = mount({ contextPressure: null }).container;
    click(tab(unavailable, "Subagents"));
    expect(unavailable.querySelector("#panel-subagents")?.textContent).toContain("Not evaluable");
  });

  it("renders a traceable split-subagent prescription when one is supplied", () => {
    const source = finding({
      id: "finding-subagent",
      kind: "subagent-candidate",
      prescriptionHint: "split-subagent",
    });
    const recommendation = prescription({
      id: "prescription-subagent",
      findingIds: [source.id],
      kind: "split-subagent",
      content: "Delegate independent research tasks.",
    });
    const { container } = mount({
      prescriptions: [recommendation],
      findings: [source],
      contextPressure: 0.9,
    });
    click(tab(container, "Subagents"));
    expect(container.querySelector("#panel-subagents")?.textContent).toContain(
      "Delegate independent research tasks."
    );
    expect(container.querySelector("#panel-subagents")?.textContent).toContain(source.id);
  });
});
