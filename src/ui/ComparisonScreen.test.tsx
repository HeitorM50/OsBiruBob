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

    expect(screen.getByText("Experimento válido")).toBeTruthy();
    const table = screen.getByRole("table", {
      name: "Métricas calculadas pelo Hindsight",
    });
    const body = within(table);

    for (const label of [
      "Overhead fixo",
      "Ferramentas ociosas",
      "API Cost (USD)",
      "Contexto reportado",
      "Tokens de conversa",
      "Skill paga sem uso",
      "projectRules",
      "Turnos",
      "Intervenções humanas",
      "Tool calls com erro",
      "Comandos externos",
      "Duração",
    ]) {
      expect(body.getByRole("rowheader", { name: label })).toBeTruthy();
    }

    expect(body.getByText(/−2\.699 · −25,9% · melhora/)).toBeTruthy();
    expect(body.getByText(/\+1 · \+20,0% · piora/)).toBeTruthy();
    expect(body.getAllByText(/sem mudança/).length).toBeGreaterThan(0);
    expect(body.getByText(/\+121 · base zero · aumento intencional/)).toBeTruthy();
    expect(body.getByText("18 de 23")).toBeTruthy();
    expect(body.getByText("12 de 17")).toBeTruthy();
  });

  it("keeps screenshot-only metrics separate and unavailable, never zero-filled", () => {
    renderComparison(compare(reportA, reportB));

    const manual = screen.getByRole("table", {
      name: "Métricas preenchidas manualmente",
    });
    expect(within(manual).getByRole("rowheader", { name: "Tokens ↑" })).toBeTruthy();
    expect(within(manual).getByRole("rowheader", { name: "Tokens ↓" })).toBeTruthy();
    expect(within(manual).getByRole("rowheader", { name: "Cache ↓/↑ (razão)" })).toBeTruthy();
    expect(within(manual).getByRole("rowheader", { name: "Context Length %" })).toBeTruthy();
    expect(within(manual).getByRole("rowheader", { name: "Falhas de build" })).toBeTruthy();
    expect(within(manual).getAllByText("indisponível")).toHaveLength(10);
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
      name: "Métricas calculadas pelo Hindsight",
    });
    expect(alert.textContent).toContain("Comparação experimental inválida");
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

    expect(container.textContent).toContain("base zero");
    expect(container.textContent).not.toContain("Infinity");
    expect(container.textContent).not.toContain("NaN");
  });

  it("rounds monetary display while retaining the exact domain number", () => {
    const comparison = compare(reportA, reportB);
    const { container } = renderComparison(comparison);
    const exact = String(comparison.metrics.costDelta);

    expect(screen.getAllByText(/US\$/).length).toBeGreaterThan(0);
    expect(container.querySelector(`data[data-exact="${exact}"]`)).toBeTruthy();
  });

  it("treats the missing Round B state as normal and exposes both next actions", () => {
    const add = vi.fn();
    const prescribe = vi.fn();
    renderComparison(null, add, prescribe);

    expect(screen.getByRole("heading", { name: "A Rodada B ainda não foi carregada." })).toBeTruthy();
    expect(screen.getByText(/Isso é o caminho normal, não um erro/)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Adicionar Rodada B" }));
    fireEvent.click(screen.getByRole("button", { name: "Ver o que aplicar" }));
    expect(add).toHaveBeenCalledOnce();
    expect(prescribe).toHaveBeenCalledOnce();
  });
});
