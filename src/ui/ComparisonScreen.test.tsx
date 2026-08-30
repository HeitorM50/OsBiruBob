// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import sampleExport from "../../fixtures/sample-export.json?raw";
import roundBExport from "../../benchmark/rodada-b.json?raw";
import type { Comparison, ObserveReport } from "../domain/types";
import { compare } from "../compare";
import { analyzeExport } from "./analysis";
import { ComparisonScreen } from "./ComparisonScreen";

afterEach(cleanup);

function report(raw: string, name: string): ObserveReport {
  const result = analyzeExport(raw, name, "file");
  if (!result.ok) throw new Error(result.error.message);
  return result.value.report;
}

const reportA = report(sampleExport, "rodada-a.json");
const reportB = report(roundBExport, "rodada-b.json");

function renderComparison(
  comparison: Comparison | null,
  onAddRoundB = vi.fn(),
  onViewPrescriptions = vi.fn()
) {
  return render(
    <ComparisonScreen
      comparison={comparison}
      roundA={reportA}
      onAddRoundB={onAddRoundB}
      onViewPrescriptions={onViewPrescriptions}
    />
  );
}

describe("ComparisonScreen", () => {
  it("renders the complete real A/B table with improvements, regressions and ties", () => {
    renderComparison(compare(reportA, reportB));

    expect(screen.getByText("Valid export metrics")).toBeTruthy();
    const table = screen.getByRole("table", {
      name: "Metrics calculated by Hindsight",
    });
    const body = within(table);

    for (const label of [
      "Fixed overhead",
      "Idle tools",
      "API Cost (USD)",
      "Reported context",
      "Conversation tokens",
      "Skill paid but unused",
      "projectRules",
      "Assistant turns",
      "Human interventions",
      "Errored tool calls",
      "External commands",
      "Duration",
    ]) {
      expect(body.getByRole("rowheader", { name: label })).toBeTruthy();
    }

    expect(body.getByText(/−2,699 · −25.9% · improvement/)).toBeTruthy();
    expect(body.getByText(/\+1 · \+20.0% · regression/)).toBeTruthy();
    expect(body.getAllByText(/no change/).length).toBeGreaterThan(0);
    expect(body.getByText(/\+121 · zero baseline · intentional increase/)).toBeTruthy();
    expect(body.getByText("18 of 23")).toBeTruthy();
    expect(body.getByText("12 of 17")).toBeTruthy();
  });

  it("keeps screenshot-only metrics separate and unavailable, never zero-filled", () => {
    renderComparison(compare(reportA, reportB));

    const manual = screen.getByRole("table", {
      name: "Manually filled metrics",
    });
    expect(within(manual).getByRole("rowheader", { name: "Tokens ↑" })).toBeTruthy();
    expect(within(manual).getByRole("rowheader", { name: "Tokens ↓" })).toBeTruthy();
    expect(within(manual).getByRole("rowheader", { name: "Cache ↓/↑ (ratio)" })).toBeTruthy();
    expect(within(manual).getByRole("rowheader", { name: "Context Length %" })).toBeTruthy();
    expect(within(manual).getByRole("rowheader", { name: "Build failures" })).toBeTruthy();
    expect(within(manual).getAllByText("unavailable")).toHaveLength(10);
    expect(manual.textContent).not.toContain(" 0 ");
  });

  it("shows an invalid-protocol warning and reason before the deltas", () => {
    const comparison = compare(reportA, reportB);
    const invalid: Comparison = {
      ...comparison,
      valid: false,
      invalidReason: "allowedPermissions set differs: A=[read], B=[edit,read]",
    };
    renderComparison(invalid);

    const alert = screen.getByRole("alert");
    const table = screen.getByRole("table", {
      name: "Metrics calculated by Hindsight",
    });
    expect(alert.textContent).toContain("Invalid experimental comparison");
    expect(alert.textContent).toContain("allowedPermissions set differs");
    expect(
      alert.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("handles a zero denominator without rendering Infinity or NaN", () => {
    const source = compare(reportA, reportB);
    const zeroBase: Comparison = {
      ...source,
      metrics: {
        ...source.metrics,
        costA: 0,
        costB: 1,
        costDelta: 1,
      },
    };
    const { container } = renderComparison(zeroBase);

    expect(container.textContent).toContain("zero baseline");
    expect(container.textContent).not.toContain("Infinity");
    expect(container.textContent).not.toContain("NaN");
  });

  it("rounds monetary display while retaining the exact domain number", () => {
    const comparison = compare(reportA, reportB);
    const { container } = renderComparison(comparison);
    const exact = String(comparison.metrics.costDelta);

    expect(screen.getAllByText(/\$/).length).toBeGreaterThan(0);
    expect(container.querySelector(`data[data-exact="${exact}"]`)).toBeTruthy();
  });

  it("treats the missing Round B state as normal and exposes both next actions", () => {
    const add = vi.fn();
    const prescribe = vi.fn();
    renderComparison(null, add, prescribe);

    expect(screen.getByRole("heading", { name: "Round B has not been loaded yet." })).toBeTruthy();
    expect(screen.getByText(/This is the normal path, not an error/)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Add Round B" }));
    fireEvent.click(screen.getByRole("button", { name: "See what to apply" }));
    expect(add).toHaveBeenCalledOnce();
    expect(prescribe).toHaveBeenCalledOnce();
  });
});
