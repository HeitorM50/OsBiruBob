// @vitest-environment jsdom

import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import sampleExport from "../../fixtures/sample-export.json?raw";
import roundBExport from "../../benchmark/rodada-b.json?raw";
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

    expect(screen.getByRole("heading", { name: "The retrospective your agent session never had" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /See an example/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Select files" })).toBeTruthy();
    expect(screen.getByText("100% local processing")).toBeTruthy();
    expect(screen.getByText(/No file is uploaded/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "2 · Diagnosis" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });

  it("loads the bundled baseline through the full pipeline without network", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /See an example/ }));

    expect(await screen.findByText("Round A")).toBeTruthy();
    expect(screen.getAllByText("Example").length).toBeGreaterThan(0);
    expect(screen.getByText(/1 task · 5 turns · 4 findings/)).toBeTruthy();
    expect(screen.getByText(/comparison is enabled/)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("automatically advances to the diagnosis screen after a successful analysis", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /See an example/ }));

    expect(await screen.findByTestId("context-window-screen")).toBeTruthy();
    expect(screen.getByTestId("project-rules-alert")).toBeTruthy();
  });

  it("treats a comparison with only Round A as a normal next step", async () => {
    const readText = vi.fn(async () => sampleExport);
    render(<App readText={readText} />);

    fireEvent.drop(screen.getByTestId("dropzone"), {
      dataTransfer: { files: [exportFile("round-a.json")] },
    });
    expect(await screen.findByText("Round A")).toBeTruthy();

    const comparisonStep = screen.getByRole("button", {
      name: "5 · Comparison",
    }) as HTMLButtonElement;
    expect(comparisonStep.disabled).toBe(false);
    fireEvent.click(comparisonStep);

    expect(
      screen.getByRole("heading", {
        name: "Round B has not been loaded yet.",
      })
    ).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("compares the first two accepted exports through the application flow", async () => {
    const readText = vi.fn(async (file: File) =>
      file.name === "round-b.json" ? roundBExport : sampleExport
    );
    render(<App readText={readText} />);

    fireEvent.drop(screen.getByTestId("dropzone"), {
      dataTransfer: {
        files: [exportFile("round-a.json"), exportFile("round-b.json")],
      },
    });

    expect(await screen.findByText("Round B")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "5 · Comparison" }));

    expect(screen.getByText("Valid export metrics")).toBeTruthy();
    expect(
      screen.getByRole("table", { name: "Metrics calculated by Hindsight" })
    ).toBeTruthy();
    expect(screen.getByText("18 of 23")).toBeTruthy();
    expect(screen.getByText("12 of 17")).toBeTruthy();
  });

  it("opens the context breakdown screen with the projectRules finding", async () => {
    render(<App />);
    const diagnosisStep = screen.getByRole("button", {
      name: "2 · Diagnosis",
    }) as HTMLButtonElement;
    expect(diagnosisStep.disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /See an example/ }));
    expect(await screen.findByText("Round A")).toBeTruthy();
    expect(diagnosisStep.disabled).toBe(false);

    fireEvent.click(diagnosisStep);

    // The centrepiece of the pitch must be reachable from the demo in one click.
    expect(screen.getByTestId("context-window-screen")).toBeTruthy();
    expect(screen.getByTestId("project-rules-alert")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "This project has no AGENTS.md" })
    ).toBeTruthy();

    // Baseline aggregates, kept distinct from one another.
    expect(screen.getByTestId("fixed-overhead").textContent).toBe("10,439");
    expect(screen.getByTestId("conversation-tokens").textContent).toBe("7,145");
    expect(screen.getByTestId("reported-total").textContent).toBe("17,584");

    // Zero sources stay listed — the zero is the finding.
    expect(screen.getByTestId("breakdown-tokens-projectRules").textContent).toBe("0");
  });

  it("scrolls back to the top when the active step changes", async () => {
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /See an example/ }));
    expect(await screen.findByText("Round A")).toBeTruthy();

    scrollTo.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "2 · Diagnosis" }));

    // Each step is a page of its own: opening one while the previous page was
    // scrolled down must not land the reader on blank space.
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
  });

  it("opens the traceable prescriptions screen for the analyzed baseline", async () => {
    render(<App />);
    const prescriptionsStep = screen.getByRole("button", {
      name: "4 · Prescriptions",
    }) as HTMLButtonElement;
    expect(prescriptionsStep.disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /See an example/ }));
    expect(await screen.findByText("Round A")).toBeTruthy();
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

    fireEvent.click(screen.getByRole("button", { name: "1 · Input" }));
    expect(
      screen.getByRole("heading", {
        name: "The retrospective your agent session never had",
      })
    ).toBeTruthy();
  });

  it("opens Findings with detector output from the analyzed export", async () => {
    render(<App />);
    const findingsStep = screen.getByRole("button", {
      name: "3 · Findings",
    }) as HTMLButtonElement;
    expect(findingsStep.disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /See an example/ }));
    expect(await screen.findByText("Round A")).toBeTruthy();
    expect(findingsStep.disabled).toBe(false);

    fireEvent.click(findingsStep);
    expect(
      screen.getByRole("heading", {
        name: "4 findings, each traceable to a field in the export.",
      })
    ).toBeTruthy();
    expect(screen.getByText("Project rules missing")).toBeTruthy();
    expect(screen.getByText("Idle tools")).toBeTruthy();
    expect(screen.getByText("Undeclared skill overhead")).toBeTruthy();
    expect(screen.getByText("MCP server candidate")).toBeTruthy();
    expect(screen.getAllByText("No findings of this type.")).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "1 · Input" }));
    expect(screen.getByText("Round A")).toBeTruthy();
  });

  it("accepts files through the selector and drag-and-drop, assigning A and B", async () => {
    const readText = vi.fn(async () => sampleExport);
    render(<App readText={readText} />);

    const selector = screen.getByLabelText("Select JSON exports from IBM Bob");
    fireEvent.change(selector, { target: { files: [exportFile("round-a.json")] } });

    expect(await screen.findByText("Round A")).toBeTruthy();
    expect(screen.getAllByText("round-a.json")).toHaveLength(2);
    expect(screen.getByText(/Add a Round B/)).toBeTruthy();

    const dropzone = screen.getByTestId("dropzone");
    fireEvent.dragEnter(dropzone);
    fireEvent.dragLeave(dropzone);
    fireEvent.drop(dropzone, { dataTransfer: { files: [exportFile("round-b.json")] } });

    expect(await screen.findByText("Round B")).toBeTruthy();
    expect(screen.getByText("round-b.json")).toBeTruthy();
    expect(screen.getByText(/comparison is enabled/)).toBeTruthy();
    expect(readText).toHaveBeenCalledTimes(2);
  });

  it("keeps N files and exposes the three-session capability without inventing a Skill", async () => {
    render(<App readText={async () => sampleExport} />);

    fireEvent.drop(screen.getByTestId("dropzone"), {
      dataTransfer: { files: [exportFile("a.json"), exportFile("b.json"), exportFile("c.json")] },
    });

    expect(await screen.findByText("Session 3")).toBeTruthy();
    expect(screen.getByText("3 sessions analyzed")).toBeTruthy();
    expect(screen.getByText(/future recurring analyses/)).toBeTruthy();
    expect(screen.queryByText(/Skill recomendada/)).toBeNull();
  });

  it("shows loading while FileReader is pending", async () => {
    let resolveRead: ((value: string) => void) | undefined;
    const pending = new Promise<string>((resolve) => { resolveRead = resolve; });
    render(<App readText={() => pending} />);

    fireEvent.drop(screen.getByTestId("dropzone"), { dataTransfer: { files: [exportFile("large.json")] } });

    expect(screen.getByText(/Analyzing/)).toBeTruthy();
    expect(screen.getByText(/large.json/)).toBeTruthy();
    expect(screen.getByText("Not a single byte left your machine.")).toBeTruthy();

    await act(async () => resolveRead?.(sampleExport));
    expect(await screen.findByText("Round A")).toBeTruthy();
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

    expect(await screen.findByText("Round A")).toBeTruthy();
    expect(screen.getAllByText("valid.json")).toHaveLength(2);
    expect(screen.getByText(/broken.json/)).toBeTruthy();
    expect(screen.getByText(/package.json/)).toBeTruthy();
    expect(screen.getByText("Valid JSON, but not a Bob session export")).toBeTruthy();
  });

  it("turns read errors into a safe message", async () => {
    render(<App readText={async () => Promise.reject(new Error("private details"))} />);
    fireEvent.drop(screen.getByTestId("dropzone"), { dataTransfer: { files: [exportFile("unreadable.json")] } });

    expect(await screen.findByText(/The file could not be read/)).toBeTruthy();
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

    fireEvent.click(screen.getByRole("button", { name: /See an example/ }));

    expect(await screen.findByText("Round A")).toBeTruthy();
    expect(document.querySelector("script[data-export-xss='yes']")).toBeNull();
    expect(document.body.textContent).not.toContain(payload);
  });

  it("example replaces previous files and clear removes all in-memory state", async () => {
    render(<App readText={async () => sampleExport} />);
    fireEvent.drop(screen.getByTestId("dropzone"), { dataTransfer: { files: [exportFile("private-session.json")] } });
    expect(await screen.findByText("private-session.json")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /See an example/ }));
    expect((await screen.findAllByText(/sample-export\.json/)).length).toBeGreaterThan(0);
    expect(screen.queryByText("private-session.json")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Clear analyses" }));
    expect(screen.queryByLabelText("Analyzed files")).toBeNull();
    expect(screen.getAllByText("no file").length).toBeGreaterThan(0);
  });

  it("does not persist analyses across remounts and supports the ephemeral theme", async () => {
    const first = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle theme" }));
    expect(screen.getByRole("button", { name: "Toggle theme" }).textContent).toBe("Light theme");
    fireEvent.click(screen.getByRole("button", { name: /See an example/ }));
    expect(await screen.findByText("Round A")).toBeTruthy();
    first.unmount();

    render(<App />);
    expect(screen.queryByLabelText("Analyzed files")).toBeNull();
    expect(screen.getByRole("button", { name: "Toggle theme" }).textContent).toBe("Dark theme");
  });

  it("shows a controlled error when the embedded example is invalid", async () => {
    render(<App exampleContent="" exampleContentB="" />);
    fireEvent.click(screen.getByRole("button", { name: /See an example/ }));

    expect((await screen.findAllByText(/This file is empty/)).length).toBeGreaterThan(0);
    expect(screen.queryByText("Round A")).toBeNull();
  });

  it("ignores an empty selection", async () => {
    render(<App readText={async () => sampleExport} />);
    fireEvent.change(screen.getByLabelText("Select JSON exports from IBM Bob"), { target: { files: [] } });

    await waitFor(() => expect(screen.queryByLabelText("Analyzed files")).toBeNull());
  });
});
