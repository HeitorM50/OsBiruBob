// @vitest-environment jsdom

import { readFileSync } from "fs";
import { resolve } from "path";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { diagnoseWithCatalogs } from "../diagnose";
import type { Finding, FindingEvidence } from "../domain/types";
import { observe } from "../observe";
import { parseSession } from "../parser";
import { FindingsScreen } from "./FindingsScreen";

afterEach(cleanup);

function loadBaselineFindings(): Finding[] {
  const raw = readFileSync(resolve(__dirname, "../../benchmark/rodada-a.json"), "utf8");
  const parsed = parseSession(raw);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return diagnoseWithCatalogs(observe(parsed.value)).findings;
}

function makeEvidence(overrides: Partial<FindingEvidence> = {}): FindingEvidence {
  return { type: "breakdown", redactable: false, ...overrides };
}

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "finding-1",
    sessionId: "session",
    taskId: "task",
    kind: "project-rules-absent",
    detectedAt: 1,
    evidence: makeEvidence(),
    confidence: "high",
    metric: {},
    prescriptionHint: "agents-md-file",
    ...overrides,
  };
}

function expandFinding(name: RegExp): void {
  fireEvent.click(screen.getByRole("button", { name }));
}

describe("FindingsScreen baseline", () => {
  it("renders the four expected configuration findings from rodada-a.json", () => {
    const findings = loadBaselineFindings();
    expect(findings.map((finding) => finding.kind).sort()).toEqual([
      "mcp-candidate",
      "project-rules-absent",
      "skill-overhead",
      "unused-tool",
    ]);

    render(<FindingsScreen findings={findings} />);
    expect(screen.getByText("Project rules missing")).toBeTruthy();
    expect(screen.getByText("Idle tools")).toBeTruthy();
    expect(screen.getByText("Undeclared skill overhead")).toBeTruthy();
    expect(screen.getByText("MCP server candidate")).toBeTruthy();
  });

  it("shows the MCP description while keeping its commands redacted", () => {
    render(<FindingsScreen findings={loadBaselineFindings()} />);

    // The description is built from catalogue metadata and a count, so it is
    // safe to show. Redacting it left the most novel finding reading only
    // "[REDACTED]" in the demo.
    expect(
      screen.getByText(/could replace repeated shell commands/)
    ).toBeTruthy();

    // The commands behind it stay hidden until explicitly revealed.
    expandFinding(/MCP server candidate/);
    expect(
      screen.getByRole("button", { name: /Show raw content/ })
    ).toBeTruthy();
  });

  it("shows explicit empty states for rereads, retries, and interventions", () => {
    render(<FindingsScreen findings={loadBaselineFindings()} />);
    for (const kind of ["redundant-read", "retry-after-error", "human-intervention"]) {
      const card = document.querySelector(`[data-finding-kind="${kind}"]`);
      expect(card).not.toBeNull();
      expect(within(card as HTMLElement).getByText("No findings of this type.")).toBeTruthy();
    }
  });
});

describe("evidence interaction", () => {
  it("expands with turnIndices, fieldPath, and source excerpt", () => {
    render(
      <FindingsScreen findings={[makeFinding({ evidence: makeEvidence({
        turnIndices: [2, 4],
        fieldPath: "tasks[0].context.projectRules",
        breakdownField: "projectRules",
        breakdownValue: 0,
      }) })]} />
    );

    expect(screen.queryByText("[2, 4]")).toBeNull();
    expandFinding(/Project rules missing/);
    expect(screen.getByText("[2, 4]")).toBeTruthy();
    expect(screen.getByText("tasks[0].context.projectRules")).toBeTruthy();
    expect(screen.getByText("Source excerpt")).toBeTruthy();
    expect(screen.getByText(/projectRules.*0/)).toBeTruthy();
  });

  it("reveals sensitive evidence only after a warning and only for that item", () => {
    const firstSecret = "first private command";
    const secondSecret = "second private command";
    render(<FindingsScreen findings={[
      makeFinding({
        id: "first",
        kind: "mcp-candidate",
        description: firstSecret,
        evidence: makeEvidence({ type: "command", redactable: true, externalCommands: [firstSecret] }),
      }),
      makeFinding({
        id: "second",
        kind: "mcp-candidate",
        description: secondSecret,
        evidence: makeEvidence({ type: "command", redactable: true, externalCommands: [secondSecret] }),
      }),
    ]} />);

    expect(screen.queryByText(firstSecret)).toBeNull();
    const rows = document.querySelectorAll<HTMLElement>("[data-finding-id]");
    fireEvent.click(within(rows[0]).getByRole("button", { name: /candidate/ }));
    fireEvent.click(within(rows[1]).getByRole("button", { name: /candidate/ }));
    expect(screen.getAllByText("[REDACTED]").length).toBeGreaterThanOrEqual(2);

    fireEvent.click(within(rows[0]).getByRole("button", { name: /Show raw content/ }));
    const confirmation = within(rows[0]).getByRole("button", { name: /Understood — show this item/ });
    expect(within(rows[0]).getByRole("alert").textContent).toContain("absolute paths");
    expect(document.activeElement).toBe(confirmation);
    expect(screen.queryByText(firstSecret)).toBeNull();

    fireEvent.click(confirmation);
    expect(within(rows[0]).getAllByText(firstSecret).length).toBeGreaterThan(0);
    expect(within(rows[1]).queryByText(secondSecret)).toBeNull();
    expect(within(rows[1]).getAllByText("[REDACTED]").length).toBeGreaterThan(0);
  });

  it("always redacts message content and absolute paths even if the flag is false", () => {
    const messageSecret = "private message body";
    const absolutePath = "/etc/private-config";
    render(<FindingsScreen findings={[
      makeFinding({
        id: "message",
        evidence: makeEvidence({
          type: "message",
          redactable: false,
          fieldPath: "messages[0].data.content",
          rawValue: messageSecret,
        }),
      }),
      makeFinding({
        id: "path",
        kind: "redundant-read",
        evidence: makeEvidence({ redactable: false, rawValue: absolutePath }),
      }),
    ]} />);

    for (const button of screen.getAllByRole("button", { name: /Project|Redundant/ })) {
      fireEvent.click(button);
    }
    expect(screen.queryByText(messageSecret)).toBeNull();
    expect(screen.queryByText(absolutePath)).toBeNull();
    expect(screen.getAllByText("[REDACTED]").length).toBeGreaterThanOrEqual(2);
  });

  it("renders a script payload literally after reveal without creating a script node", () => {
    const payload = '<script>globalThis.__findingXss = true</script>';
    render(<FindingsScreen findings={[makeFinding({
      evidence: makeEvidence({ type: "message", redactable: true, rawValue: payload }),
    })]} />);
    expandFinding(/Project rules missing/);
    fireEvent.click(screen.getByRole("button", { name: /Show raw content/ }));
    fireEvent.click(screen.getByRole("button", { name: /Understood — show this item/ }));
    expect(screen.getByText(payload)).toBeTruthy();
    expect(document.querySelector("script")).toBeNull();
    expect((globalThis as { __findingXss?: boolean }).__findingXss).toBeUndefined();
  });
});

describe("states, badges, and ordering", () => {
  it("renders an overall empty state and an empty state for every core type", () => {
    render(<FindingsScreen findings={[]} />);
    expect(screen.getByText("No findings to display.")).toBeTruthy();
    expect(screen.getAllByText("No findings of this type.")).toHaveLength(7);
  });

  it("labels token and cost impacts as hypotheses or estimates, never measurements", () => {
    render(<FindingsScreen findings={[makeFinding({ tokenImpact: 1000, costImpact: 0.42 })]} />);
    const label = screen.getByText(/Hypothesis\/estimate/);
    expect(label.textContent).toContain("not a measured value");
    expect(label.textContent).toContain("1000 estimated tokens");
    expect(label.textContent).toContain("$0.42 estimated cost");
  });

  it("shows confidence and explicit unavailable severity on every baseline finding", () => {
    const findings = loadBaselineFindings();
    render(<FindingsScreen findings={findings} />);
    expect(screen.getAllByLabelText(/^Confidence:/)).toHaveLength(findings.length);
    expect(screen.getAllByLabelText("Severity: unavailable")).toHaveLength(findings.length);
  });

  it("orders by supplied severity without mutating the input", () => {
    type WithSeverity = Finding & { severity: "high" | "medium" | "low" };
    const low = { ...makeFinding({ id: "low" }), severity: "low" } as WithSeverity;
    const high = { ...makeFinding({ id: "high" }), severity: "high" } as WithSeverity;
    const medium = { ...makeFinding({ id: "medium" }), severity: "medium" } as WithSeverity;
    const findings: Finding[] = [low, high, medium];
    const originalOrder = findings.map((finding) => finding.id);

    render(<FindingsScreen findings={findings} />);
    expect([...document.querySelectorAll<HTMLElement>("[data-finding-id]")]
      .map((node) => node.dataset.findingId)).toEqual(["high", "medium", "low"]);
    expect(findings.map((finding) => finding.id)).toEqual(originalOrder);
    expect(screen.getByLabelText("Severity: high")).toBeTruthy();
  });

  it("keeps long lists navigable with links to finding groups", () => {
    render(<FindingsScreen findings={[
      makeFinding(),
      makeFinding({ id: "other", kind: "unused-tool" }),
    ]} />);
    expect(screen.getByRole("navigation", { name: "Finding types" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Project rules missing/ })).toBeTruthy();
  });
});

describe("regressions and architecture", () => {
  it("contains wide excerpts in their own keyboard-scrollable element", () => {
    const css = readFileSync(resolve(__dirname, "FindingsScreen.module.css"), "utf8");
    expect(css).toMatch(/\.evidenceExcerpt\s*\{[^}]*overflow-x:\s*auto/s);
    expect(css).toMatch(/\.evidenceExcerpt\s*\{[^}]*max-width:\s*100%/s);

    render(<FindingsScreen findings={[makeFinding({
      evidence: makeEvidence({ rawValue: "x".repeat(1000) }),
    })]} />);
    expandFinding(/Project rules missing/);
    const excerpt = screen.getByText("x".repeat(1000)).closest("pre");
    expect(excerpt?.tabIndex).toBe(0);
  });

  it("does not leak a sensitive description while evidence is redacted", () => {
    const secret = "verbatim user prompt";
    render(<FindingsScreen findings={[makeFinding({
      description: secret,
      evidence: makeEvidence({ type: "message", redactable: true, rawValue: secret }),
    })]} />);
    expect(screen.queryByText(secret)).toBeNull();
    expect(screen.getByText("[REDACTED]")).toBeTruthy();
  });

  it("uses no HTML injection API or detector/prescription import", () => {
    const source = readFileSync(resolve(__dirname, "FindingsScreen.tsx"), "utf8");
    expect(source).not.toContain("dangerouslySetInnerHTML");
    expect(source).not.toContain("innerHTML");
    expect(source).not.toContain("eval(");
    expect(source).not.toMatch(/from ["']\.\.\/(?:observe|diagnose|prescribe)/);
  });

  it("renders missing detector evidence explicitly instead of inventing it", () => {
    render(<FindingsScreen findings={[makeFinding({ evidence: makeEvidence() })]} />);
    expandFinding(/Project rules missing/);
    expect(screen.getAllByText("Not supplied by detector.")).toHaveLength(2);
    expect(screen.getByText("No source excerpt supplied by detector.")).toBeTruthy();
  });
});
