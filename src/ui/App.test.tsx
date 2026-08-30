// @vitest-environment jsdom

import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import sampleExport from "../../fixtures/sample-export.json?raw";
import App from "./App";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function exportFile(name: string): File {
  return new File([sampleExport], name, { type: "application/json" });
}

describe("App input screen", () => {
  it("renders the prototype-based entry and permanent privacy guarantee", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "A retrospectiva que sua sessão de agente nunca teve" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ver exemplo/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Selecionar arquivos" })).toBeTruthy();
    expect(screen.getByText("Processamento 100% local")).toBeTruthy();
    expect(screen.getByText(/Nenhum arquivo é enviado ou armazenado/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "2 · Diagnóstico" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });

  it("loads the bundled baseline through the full pipeline without network", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Ver exemplo/ }));

    expect(await screen.findByText("Rodada A")).toBeTruthy();
    expect(screen.getByText("Exemplo")).toBeTruthy();
    expect(screen.getByText(/1 task · 5 turnos · 4 achados/)).toBeTruthy();
    expect(screen.getByText(/Adicione uma Rodada B/)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("opens the traceable prescriptions screen for the analyzed baseline", async () => {
    render(<App />);
    const prescriptionsStep = screen.getByRole("button", {
      name: "4 · Prescrições",
    }) as HTMLButtonElement;
    expect(prescriptionsStep.disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Ver exemplo/ }));
    expect(await screen.findByText("Rodada A")).toBeTruthy();
    expect(prescriptionsStep.disabled).toBe(false);

    fireEvent.click(prescriptionsStep);
    expect(
      screen.getByRole("heading", {
        name: "Corrected configuration, ready to copy.",
      })
    ).toBeTruthy();
    expect(screen.getAllByRole("tab")).toHaveLength(5);
    expect(screen.getByText("new file")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "MCPs" }));
    expect(screen.getByText("Docker MCP Server")).toBeTruthy();
    expect(screen.getByText(/2 matching commands/)).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Subagents" }));
    expect(
      screen.getByRole("tabpanel", { name: "Subagents" }).textContent
    ).toContain("Context pressure is 6.5%");

    fireEvent.click(screen.getByRole("button", { name: "1 · Entrada" }));
    expect(
      screen.getByRole("heading", {
        name: "A retrospectiva que sua sessão de agente nunca teve",
      })
    ).toBeTruthy();
  });

  it("opens Findings with detector output from the analyzed export", async () => {
    render(<App />);
    const findingsStep = screen.getByRole("button", {
      name: "3 · Achados",
    }) as HTMLButtonElement;
    expect(findingsStep.disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Ver exemplo/ }));
    expect(await screen.findByText("Rodada A")).toBeTruthy();
    expect(findingsStep.disabled).toBe(false);

    fireEvent.click(findingsStep);
    expect(
      screen.getByRole("heading", {
        name: "4 achados, cada um rastreável até um campo do export.",
      })
    ).toBeTruthy();
    expect(screen.getByText("Regras de projeto ausentes")).toBeTruthy();
    expect(screen.getByText("Ferramentas ociosas")).toBeTruthy();
    expect(screen.getByText("Overhead de Skill")).toBeTruthy();
    expect(screen.getByText("Candidato a servidor MCP")).toBeTruthy();
    expect(screen.getAllByText("No findings of this type.")).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "1 · Entrada" }));
    expect(screen.getByText("Rodada A")).toBeTruthy();
  });

  it("accepts files through the selector and drag-and-drop, assigning A and B", async () => {
    const readText = vi.fn(async () => sampleExport);
    render(<App readText={readText} />);

    const selector = screen.getByLabelText("Selecionar exports JSON do IBM Bob");
    fireEvent.change(selector, { target: { files: [exportFile("round-a.json")] } });

    expect(await screen.findByText("Rodada A")).toBeTruthy();
    expect(screen.getAllByText("round-a.json")).toHaveLength(2);
    expect(screen.getByText(/Adicione uma Rodada B/)).toBeTruthy();

    const dropzone = screen.getByTestId("dropzone");
    fireEvent.dragEnter(dropzone);
    fireEvent.dragLeave(dropzone);
    fireEvent.drop(dropzone, { dataTransfer: { files: [exportFile("round-b.json")] } });

    expect(await screen.findByText("Rodada B")).toBeTruthy();
    expect(screen.getByText("round-b.json")).toBeTruthy();
    expect(screen.getByText(/comparativo está habilitado/)).toBeTruthy();
    expect(readText).toHaveBeenCalledTimes(2);
  });

  it("keeps N files and exposes the three-session capability without inventing a Skill", async () => {
    render(<App readText={async () => sampleExport} />);

    fireEvent.drop(screen.getByTestId("dropzone"), {
      dataTransfer: { files: [exportFile("a.json"), exportFile("b.json"), exportFile("c.json")] },
    });

    expect(await screen.findByText("Sessão 3")).toBeTruthy();
    expect(screen.getByText("3 sessões analisadas")).toBeTruthy();
    expect(screen.getByText(/análises recorrentes futuras/)).toBeTruthy();
    expect(screen.queryByText(/Skill recomendada/)).toBeNull();
  });

  it("shows loading while FileReader is pending", async () => {
    let resolveRead: ((value: string) => void) | undefined;
    const pending = new Promise<string>((resolve) => { resolveRead = resolve; });
    render(<App readText={() => pending} />);

    fireEvent.drop(screen.getByTestId("dropzone"), { dataTransfer: { files: [exportFile("large.json")] } });

    expect(screen.getByText(/Analisando/)).toBeTruthy();
    expect(screen.getByText(/large.json/)).toBeTruthy();
    expect(screen.getByText("Nenhum byte saiu da máquina.")).toBeTruthy();

    await act(async () => resolveRead?.(sampleExport));
    expect(await screen.findByText("Rodada A")).toBeTruthy();
  });

  it("keeps valid files from a mixed batch and reports each rejected file", async () => {
    const readText = async (file: File): Promise<string> => {
      if (file.name === "valid.json") return sampleExport;
      if (file.name === "broken.json") return "{";
      return JSON.stringify({ name: "hindsight" });
    };
    render(<App readText={readText} />);

    fireEvent.drop(screen.getByTestId("dropzone"), {
      dataTransfer: { files: [exportFile("valid.json"), exportFile("broken.json"), exportFile("package.json")] },
    });

    expect(await screen.findByText("Rodada A")).toBeTruthy();
    expect(screen.getAllByText("valid.json")).toHaveLength(2);
    expect(screen.getByText(/broken.json/)).toBeTruthy();
    expect(screen.getByText(/package.json/)).toBeTruthy();
    expect(screen.getByText("JSON válido, mas não é um export de sessão do Bob")).toBeTruthy();
  });

  it("turns read errors into a safe message", async () => {
    render(<App readText={async () => Promise.reject(new Error("private details"))} />);
    fireEvent.drop(screen.getByTestId("dropzone"), { dataTransfer: { files: [exportFile("unreadable.json")] } });

    expect(await screen.findByText(/Não foi possível ler o arquivo/)).toBeTruthy();
    expect(screen.queryByText(/private details/)).toBeNull();
  });

  it("renders untrusted filenames as text and never as HTML", async () => {
    const maliciousName = '<script data-xss="yes">alert(1)</script>.json';
    render(<App readText={async () => sampleExport} />);
    fireEvent.drop(screen.getByTestId("dropzone"), { dataTransfer: { files: [exportFile(maliciousName)] } });

    expect(await screen.findByText(maliciousName)).toBeTruthy();
    expect(document.querySelector("script[data-xss='yes']")).toBeNull();
  });

  it("never inserts untrusted export content into the document", async () => {
    const payload = '<script data-export-xss="yes">window.__xss = true</script>';
    const exportWithPayload = JSON.parse(sampleExport) as {
      tasks: Array<{ messages: Array<{ data: { content: string } }> }>;
    };
    exportWithPayload.tasks[0].messages[0].data.content = payload;
    render(<App exampleContent={JSON.stringify(exportWithPayload)} />);

    fireEvent.click(screen.getByRole("button", { name: /Ver exemplo/ }));

    expect(await screen.findByText("Rodada A")).toBeTruthy();
    expect(document.querySelector("script[data-export-xss='yes']")).toBeNull();
    expect(document.body.textContent).not.toContain(payload);
  });

  it("example replaces previous files and clear removes all in-memory state", async () => {
    render(<App readText={async () => sampleExport} />);
    fireEvent.drop(screen.getByTestId("dropzone"), { dataTransfer: { files: [exportFile("private-session.json")] } });
    expect(await screen.findByText("private-session.json")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Ver exemplo/ }));
    expect(await screen.findByText("sample-export.json")).toBeTruthy();
    expect(screen.queryByText("private-session.json")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Limpar análises" }));
    expect(screen.queryByLabelText("Arquivos analisados")).toBeNull();
    expect(screen.getAllByText("nenhum arquivo").length).toBeGreaterThan(0);
  });

  it("does not persist analyses across remounts and supports the ephemeral theme", async () => {
    const first = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Alternar tema" }));
    expect(screen.getByRole("button", { name: "Alternar tema" }).textContent).toBe("Tema claro");
    fireEvent.click(screen.getByRole("button", { name: /Ver exemplo/ }));
    expect(await screen.findByText("Rodada A")).toBeTruthy();
    first.unmount();

    render(<App />);
    expect(screen.queryByLabelText("Arquivos analisados")).toBeNull();
    expect(screen.getByRole("button", { name: "Alternar tema" }).textContent).toBe("Tema escuro");
  });

  it("shows a controlled error when the embedded example is invalid", async () => {
    render(<App exampleContent="" />);
    fireEvent.click(screen.getByRole("button", { name: /Ver exemplo/ }));

    expect(await screen.findByText(/O arquivo está vazio/)).toBeTruthy();
    expect(screen.queryByText("Rodada A")).toBeNull();
  });

  it("ignores an empty selection", async () => {
    render(<App readText={async () => sampleExport} />);
    fireEvent.change(screen.getByLabelText("Selecionar exports JSON do IBM Bob"), { target: { files: [] } });

    await waitFor(() => expect(screen.queryByLabelText("Arquivos analisados")).toBeNull());
  });
});
