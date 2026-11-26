// @vitest-environment jsdom

import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sampleExport from "../../fixtures/sample-export.json?raw";
import roundBExport from "../../benchmark/rodada-b.json?raw";
import App from "./App";

beforeEach(() => {
  vi.stubGlobal("scrollTo", vi.fn());
  delete document.documentElement.dataset.theme;
  document.documentElement.style.colorScheme = "";
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function exportFile(name: string): File {
  return new File([sampleExport], name, { type: "application/json" });
}

async function returnToLoadAfterAnalysis(): Promise<void> {
  await screen.findByTestId("diagnose-screen");
  fireEvent.click(screen.getByRole("button", { name: "1 · Load" }));
}

describe("App Load → Diagnose → Fix → Compare flow", () => {
  it("renders the 4-step navigation and permanent privacy guarantee", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", {
        name: "The retrospective your agent session never had",
      })
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /See an example/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Select files" })).toBeTruthy();
    expect(screen.getByText("100% local processing")).toBeTruthy();
    expect(screen.getByText(/No file is uploaded/)).toBeTruthy();

    expect(screen.getByRole("button", { name: "1 · Load" })).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "2 · Diagnose" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "3 · Fix" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "4 · Compare" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });

  it("loads the bundled example (Round A and Round B) through the full pipeline without network", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /See an example/ }));
    await returnToLoadAfterAnalysis();

    expect(screen.getByText("Round A")).toBeTruthy();
    expect(screen.getByText("Round B")).toBeTruthy();
    expect(screen.getAllByText("Example").length).toBeGreaterThan(0);
    expect(screen.getByText(/1 task · 5 turns · 4 findings/)).toBeTruthy();
    expect(screen.getByText(/comparison is enabled/)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("advances to unified Diagnose with summary, context bar+legend, and findings without duplicate projectRules alert", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /See an example/ }));

    expect(await screen.findByTestId("diagnose-screen")).toBeTruthy();
    expect(screen.getByTestId("context-summary-row")).toBeTruthy();
    expect(screen.getByTestId("context-legend")).toBeTruthy();

    // No separate projectRules = 0 alert card; the Finding fulfills that role
    expect(screen.queryByTestId("project-rules-alert")).toBeNull();

    // Baseline aggregates, kept distinct from one another
    expect(screen.getByTestId("fixed-overhead").textContent).toBe("10,439");
    expect(screen.getByTestId("conversation-tokens").textContent).toBe("7,145");
    expect(screen.getByTestId("reported-total").textContent).toBe("17,584");
    expect(screen.getByTestId("breakdown-tokens-projectRules").textContent).toBe("0");

    // Findings are rendered directly on Diagnose with shared labels
    expect(screen.getByText("Project rules missing")).toBeTruthy();
    expect(screen.getByText("Idle tools")).toBeTruthy();
    expect(screen.getByText("Undeclared skill overhead")).toBeTruthy();
    expect(screen.getByText("MCP server candidate")).toBeTruthy();
    expect(screen.getAllByText("No findings of this type.")).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: "See fix →" })).toHaveLength(4);
  });

  it("navigates bidirectionally between Diagnose findings and Fix prescriptions", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /See an example/ }));
    expect(await screen.findByTestId("diagnose-screen")).toBeTruthy();

    // Click "See fix →" on the MCP server candidate finding
    const mcpRow = screen
      .getByText("MCP server candidate")
      .closest("[data-finding-id]") as HTMLElement;
    const seeFixBtn = within(mcpRow).getByRole("button", { name: "See fix →" });
    fireEvent.click(seeFixBtn);

    // Lands on Fix with the MCPs tab active and Docker MCP Server visible
    expect(screen.getByTestId("fix-screen")).toBeTruthy();
    expect(
      screen.getByRole("tab", { name: /^MCPs/ }).getAttribute("aria-selected")
    ).toBe("true");
    expect(screen.getAllByText(/Docker MCP Server/).length).toBeGreaterThan(0);

    // Click back-link "← View finding" to return to Diagnose with that finding expanded & focused
    fireEvent.click(
      screen.getByRole("button", { name: "View finding: MCP server candidate" })
    );
    expect(screen.getByTestId("diagnose-screen")).toBeTruthy();
    const focusedRow = document.querySelector('[data-focused="true"]');
    expect(focusedRow).not.toBeNull();
    expect(focusedRow?.textContent).toContain("MCP server candidate");
    expect(focusedRow?.textContent).toContain("Source excerpt");
  });

  it("opens Fix with only non-empty tabs (no Subagents) and new core fields", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /See an example/ }));
    expect(await screen.findByTestId("diagnose-screen")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "3 · Fix" }));
    expect(
      screen.getByRole("heading", {
        name: "Corrected configuration, ready to copy.",
      })
    ).toBeTruthy();
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    expect(screen.queryByRole("tab", { name: /Subagents/ })).toBeNull();

    // Tools tab has custom_modes.yaml
    fireEvent.click(screen.getByRole("tab", { name: /^Tools/ }));
    expect(screen.getByText(".bob/custom_modes.yaml")).toBeTruthy();

    // AGENTS.md tab has new file
    fireEvent.click(screen.getByRole("tab", { name: /^AGENTS\.md/ }));
    expect(screen.getByText("new file")).toBeTruthy();

    // MCPs tab has Docker MCP Server
    fireEvent.click(screen.getByRole("tab", { name: /^MCPs/ }));
    const mcpPanel = document.querySelector("#panel-mcps") as HTMLElement;
    expect(within(mcpPanel).getAllByText(/Docker MCP Server/).length).toBeGreaterThan(0);
    expect(within(mcpPanel).getByText(/2 matching commands/)).toBeTruthy();
  });

  it("treats a comparison with only Round A as a normal next step", async () => {
    const readText = vi.fn(async () => sampleExport);
    render(<App readText={readText} />);

    fireEvent.drop(screen.getByTestId("dropzone"), {
      dataTransfer: { files: [exportFile("round-a.json")] },
    });
    await returnToLoadAfterAnalysis();
    expect(screen.getByText("Round A")).toBeTruthy();

    const compareStep = screen.getByRole("button", {
      name: "4 · Compare",
    }) as HTMLButtonElement;
    expect(compareStep.disabled).toBe(false);
    fireEvent.click(compareStep);

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

    await returnToLoadAfterAnalysis();
    expect(screen.getByText("Round B")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "4 · Compare" }));

    expect(screen.getByText("Valid export metrics")).toBeTruthy();
    expect(
      screen.getByRole("table", { name: "Metrics calculated by Hindsight" })
    ).toBeTruthy();
    expect(screen.getByText("Undeclared skill overhead")).toBeTruthy();
    expect(screen.getByText("18 of 23")).toBeTruthy();
    expect(screen.getByText("12 of 17")).toBeTruthy();
  });

  it("excludes subtasks (parentId !== null) from AGENTS.md via rootTaskIds", async () => {
    const parsed = JSON.parse(sampleExport) as {
      tasks: Array<{
        task: { id: string; parentId?: string | null };
        messages: unknown[];
      }>;
    };
    // Clone the root task as a subtask with a distinct task ID
    const subtask = JSON.parse(JSON.stringify(parsed.tasks[0])) as {
      task: { id: string; parentId: string | null };
      messages: unknown[];
    };
    subtask.task.id = "subtask-excluded-1";
    subtask.task.parentId = parsed.tasks[0].task.id;
    parsed.tasks.push(subtask);

    render(<App readText={async () => JSON.stringify(parsed)} />);
    fireEvent.drop(screen.getByTestId("dropzone"), {
      dataTransfer: { files: [exportFile("with-subtask.json")] },
    });
    expect(await screen.findByTestId("diagnose-screen")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "3 · Fix" }));
    fireEvent.click(screen.getByRole("tab", { name: /^AGENTS\.md/ }));
    const diffText =
      screen.getByLabelText("AGENTS.md diff").textContent ?? "";
    // Should still have ×1 per finding kind from the single root task, never doubled by subtask
    expect(diffText).toContain("<!-- hindsight: project-rules-absent ×1 -->");
    expect(diffText).not.toContain("×2");
  });

  it("scrolls back to the top when the active step changes", async () => {
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /See an example/ }));
    expect(await screen.findByTestId("diagnose-screen")).toBeTruthy();

    scrollTo.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "1 · Load" }));

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
  });

  it("replaces previous files on new upload and assigns Round A and Round B from the new batch", async () => {
    const readText = vi.fn(async () => sampleExport);
    render(<App readText={readText} />);

    fireEvent.click(screen.getByRole("button", { name: /See an example/ }));
    await returnToLoadAfterAnalysis();
    expect(screen.getAllByText("sample-export.json").length).toBeGreaterThan(0);

    const selector = screen.getByLabelText("Select JSON exports from IBM Bob");
    fireEvent.change(selector, { target: { files: [exportFile("custom-a.json")] } });

    await returnToLoadAfterAnalysis();
    expect(screen.getByText("Round A")).toBeTruthy();
    expect(screen.getAllByText("custom-a.json")).toHaveLength(2);
    expect(screen.queryByText("sample-export.json")).toBeNull();
    expect(screen.getByText(/Add a Round B/)).toBeTruthy();

    const dropzone = screen.getByTestId("dropzone");
    fireEvent.dragEnter(dropzone);
    fireEvent.dragLeave(dropzone);
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [exportFile("round-a.json"), exportFile("round-b.json")] },
    });

    await returnToLoadAfterAnalysis();
    expect(screen.getByText("Round A")).toBeTruthy();
    expect(screen.getByText("Round B")).toBeTruthy();
    expect(screen.getAllByText("round-a.json").length).toBeGreaterThan(0);
    expect(screen.getByText("round-b.json")).toBeTruthy();
    expect(screen.queryByText("custom-a.json")).toBeNull();
    expect(screen.getByText(/comparison is enabled/)).toBeTruthy();
    expect(readText).toHaveBeenCalledTimes(3);
  });

  it("opens the file picker synchronously from Add Round B and keeps Round A", async () => {
    const readText = vi.fn(async (file: File) =>
      file.name === "round-b.json" ? roundBExport : sampleExport
    );
    render(<App readText={readText} />);

    fireEvent.drop(screen.getByTestId("dropzone"), {
      dataTransfer: { files: [exportFile("round-a.json")] },
    });
    await screen.findByTestId("diagnose-screen");

    fireEvent.click(screen.getByRole("button", { name: "4 · Compare" }));
    const fileInput = screen.getByLabelText(
      "Select JSON exports from IBM Bob"
    ) as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, "click");

    fireEvent.click(screen.getByRole("button", { name: "Add Round B" }));
    expect(clickSpy).toHaveBeenCalledOnce();

    fireEvent.change(fileInput, { target: { files: [exportFile("round-b.json")] } });
    expect(
      await screen.findByRole("table", { name: "Metrics calculated by Hindsight" })
    ).toBeTruthy();
  });

  it("keeps N files and exposes the three-session capability without inventing a Skill", async () => {
    render(<App readText={async () => sampleExport} />);

    fireEvent.drop(screen.getByTestId("dropzone"), {
      dataTransfer: {
        files: [exportFile("a.json"), exportFile("b.json"), exportFile("c.json")],
      },
    });

    await returnToLoadAfterAnalysis();
    expect(screen.getByText("Session 3")).toBeTruthy();
    expect(screen.getByText("3 sessions analyzed")).toBeTruthy();
    expect(screen.getByText(/future recurring analyses/)).toBeTruthy();
    expect(screen.queryByText(/Skill recomendada/)).toBeNull();
  });

  it("shows loading while FileReader is pending", async () => {
    let resolveRead: ((value: string) => void) | undefined;
    const pending = new Promise<string>((resolve) => {
      resolveRead = resolve;
    });
    render(<App readText={() => pending} />);

    fireEvent.drop(screen.getByTestId("dropzone"), {
      dataTransfer: { files: [exportFile("large.json")] },
    });

    expect(screen.getByText(/Analyzing/)).toBeTruthy();
    expect(screen.getByText(/large.json/)).toBeTruthy();
    expect(screen.getByText("Not a single byte left your machine.")).toBeTruthy();

    await act(async () => resolveRead?.(sampleExport));
    await returnToLoadAfterAnalysis();
    expect(screen.getByText("Round A")).toBeTruthy();
  });

  it("keeps previous analyses untouched and stays on Load when a batch has any rejected file", async () => {
    const readText = async (file: File): Promise<string> => {
      if (file.name === "existing-a.json") return sampleExport;
      if (file.name === "valid-b.json") return roundBExport;
      if (file.name === "broken.json") return "{";
      return JSON.stringify({ name: "hindsight" });
    };
    render(<App readText={readText} />);

    fireEvent.drop(screen.getByTestId("dropzone"), {
      dataTransfer: { files: [exportFile("existing-a.json")] },
    });
    await returnToLoadAfterAnalysis();
    expect(screen.getAllByText("existing-a.json")).toHaveLength(2);

    fireEvent.drop(screen.getByTestId("dropzone"), {
      dataTransfer: {
        files: [
          exportFile("broken.json"),
          exportFile("valid-b.json"),
          exportFile("package.json"),
        ],
      },
    });

    expect(
      await screen.findByText("Valid JSON, but not a Bob session export")
    ).toBeTruthy();
    expect(screen.queryByTestId("diagnose-screen")).toBeNull();
    expect(screen.getByText(/broken\.json/)).toBeTruthy();
    expect(screen.getByText(/package\.json/)).toBeTruthy();
    expect(screen.getAllByText("existing-a.json")).toHaveLength(2);
    expect(screen.queryByText("valid-b.json")).toBeNull();
  });

  it("keeps Round A intact and returns to Load with error when Add Round B receives an invalid file", async () => {
    const readText = async (file: File): Promise<string> => {
      if (file.name === "round-a.json") return sampleExport;
      return "{";
    };
    render(<App readText={readText} />);

    fireEvent.drop(screen.getByTestId("dropzone"), {
      dataTransfer: { files: [exportFile("round-a.json")] },
    });
    await screen.findByTestId("diagnose-screen");

    fireEvent.click(screen.getByRole("button", { name: "4 · Compare" }));
    const fileInput = screen.getByLabelText(
      "Select JSON exports from IBM Bob"
    ) as HTMLInputElement;
    fireEvent.click(screen.getByRole("button", { name: "Add Round B" }));
    fireEvent.change(fileInput, { target: { files: [exportFile("broken-b.json")] } });

    expect(await screen.findByText(/broken-b\.json/)).toBeTruthy();
    expect(screen.getByTestId("dropzone")).toBeTruthy();
    expect(screen.getAllByText("round-a.json")).toHaveLength(2);
    expect(screen.queryByText("Round B")).toBeNull();
  });

  it("stays on Load when one of the example exports fails validation", async () => {
    render(<App exampleContent={sampleExport} exampleContentB="{" />);
    fireEvent.click(screen.getByRole("button", { name: /See an example/ }));

    expect(await screen.findByText(/rodada-b\.json/)).toBeTruthy();
    expect(screen.queryByTestId("diagnose-screen")).toBeNull();
  });

  it("renders a context-unavailable notice on Diagnose while still showing Findings when no root task has a context breakdown", async () => {
    const noBreakdown = JSON.parse(sampleExport) as {
      tasks: Array<{ task: { costs: { contextWindowBreakdown?: unknown } } }>;
    };
    for (const entry of noBreakdown.tasks) {
      delete entry.task.costs.contextWindowBreakdown;
    }

    render(<App readText={async () => JSON.stringify(noBreakdown)} />);
    fireEvent.drop(screen.getByTestId("dropzone"), {
      dataTransfer: { files: [exportFile("completed-only.json")] },
    });

    expect(await screen.findByTestId("diagnosis-empty-state")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Context window breakdown unavailable" })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "2 · Diagnose" }).getAttribute("aria-current")
    ).toBe("step");
    expect(screen.queryByTestId("dropzone")).toBeNull();
  });

  it("turns read errors into a safe message", async () => {
    render(
      <App readText={async () => Promise.reject(new Error("private details"))} />
    );
    fireEvent.drop(screen.getByTestId("dropzone"), {
      dataTransfer: { files: [exportFile("unreadable.json")] },
    });

    expect(await screen.findByText(/The file could not be read/)).toBeTruthy();
    expect(screen.queryByText(/private details/)).toBeNull();
  });

  it("renders untrusted filenames as text and never as HTML", async () => {
    const maliciousName = '<script data-xss="yes">alert(1)</script>.json';
    render(<App readText={async () => sampleExport} />);
    fireEvent.drop(screen.getByTestId("dropzone"), {
      dataTransfer: { files: [exportFile(maliciousName)] },
    });

    await returnToLoadAfterAnalysis();
    expect(screen.getAllByText(maliciousName).length).toBeGreaterThan(0);
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

    expect(await screen.findByTestId("diagnose-screen")).toBeTruthy();
    expect(document.querySelector("script[data-export-xss='yes']")).toBeNull();
    expect(document.body.textContent).not.toContain(payload);
  });

  it("example replaces previous files and clear removes all in-memory state", async () => {
    render(<App readText={async () => sampleExport} />);
    fireEvent.drop(screen.getByTestId("dropzone"), {
      dataTransfer: { files: [exportFile("private-session.json")] },
    });
    await returnToLoadAfterAnalysis();
    expect(screen.getAllByText("private-session.json").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /See an example/ }));
    await returnToLoadAfterAnalysis();
    expect(screen.getAllByText(/sample-export\.json/).length).toBeGreaterThan(0);
    expect(screen.queryByText("private-session.json")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Clear analyses" }));
    expect(screen.queryByLabelText("Analyzed files")).toBeNull();
    expect(screen.getAllByText("no file").length).toBeGreaterThan(0);
  });

  it("does not persist analyses across remounts and supports the ephemeral theme", async () => {
    const first = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle theme" }));
    expect(screen.getByRole("button", { name: "Toggle theme" }).textContent).toBe(
      "Light theme"
    );
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    fireEvent.click(screen.getByRole("button", { name: /See an example/ }));
    expect(await screen.findByTestId("diagnose-screen")).toBeTruthy();
    first.unmount();

    render(<App />);
    expect(screen.queryByLabelText("Analyzed files")).toBeNull();
    expect(screen.getByRole("button", { name: "Toggle theme" }).textContent).toBe(
      "Dark theme"
    );
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("follows prefers-color-scheme on initial render", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query === "(prefers-color-scheme: dark)",
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    );

    render(<App />);
    expect(screen.getByRole("button", { name: "Toggle theme" }).textContent).toBe(
      "Light theme"
    );
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("shows a controlled error when the embedded example is invalid", async () => {
    render(<App exampleContent="" exampleContentB="" />);
    fireEvent.click(screen.getByRole("button", { name: /See an example/ }));

    expect((await screen.findAllByText(/This file is empty/)).length).toBeGreaterThan(0);
    expect(screen.queryByText("Round A")).toBeNull();
  });

  it("ignores an empty selection", async () => {
    render(<App readText={async () => sampleExport} />);
    fireEvent.change(screen.getByLabelText("Select JSON exports from IBM Bob"), {
      target: { files: [] },
    });

    await waitFor(() => expect(screen.queryByLabelText("Analyzed files")).toBeNull());
  });
});
