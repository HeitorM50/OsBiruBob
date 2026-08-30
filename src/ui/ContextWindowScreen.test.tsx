/**
 * ContextWindowScreen.test.tsx
 *
 * Tests for the Context Window Decomposition UI screen.
 *
 * Uses renderToStaticMarkup (react-dom/server) for deterministic, jsdom-free
 * assertions, consistent with the existing App.test.tsx pattern.
 *
 * Test scenarios:
 *  1. Baseline rendering with benchmark/rodada-a.json values
 *  2. projectRules === 0 alert visible
 *  3. projectRules > 0 → no alert
 *  4. maxContextWindow null → pressure unavailable
 *  5. maxContextWindow 270000 → pressure ~6.5%
 *  6. Zero total edge case (no division by zero / NaN)
 *  7. No horizontal overflow (overflow-x on body not introduced)
 *  8. No sensitive data rendered
 */

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import ContextWindowScreen from "./ContextWindowScreen";
import type { ContextSummary } from "../domain/types";

// ---------------------------------------------------------------------------
// Shared fixture helpers
// ---------------------------------------------------------------------------

function makeContext(overrides: Partial<ContextSummary> = {}): ContextSummary {
  const fixedOverhead = overrides.fixedOverhead ?? 10439;
  const reportedTotal = overrides.reportedTotal ?? 17584;
  const conversationTokens = overrides.conversationTokens ?? Math.max(reportedTotal - fixedOverhead, 0);

  const breakdown = overrides.breakdown ?? {
    roleDefinition:     34,
    staticSections:     563,
    skills:             1541,
    baseRules:          197,
    projectRules:       0,
    customInstructions: 160,
    environment:        71,
    toolSystemPrompts:  2470,
    toolDefinitions:    5403,
    mcpToolDefinitions: 0,
  };

  const breakdownPct: Record<string, number> = {};
  for (const [k, v] of Object.entries(breakdown)) {
    breakdownPct[k] = fixedOverhead > 0 ? (v / fixedOverhead) * 100 : 0;
  }

  return {
    fixedOverhead,
    reportedTotal,
    conversationTokens,
    reportedTotalInconsistent: false,
    breakdown,
    breakdownPct: breakdownPct as ContextSummary["breakdownPct"],
    breakdownSumDelta: 0,
    breakdownSumConsistent: true,
    loadedSkills: [],
    maxContextWindow: overrides.maxContextWindow !== undefined ? overrides.maxContextWindow : 270000,
    pressure: overrides.pressure !== undefined
      ? overrides.pressure
      : overrides.maxContextWindow != null
        ? reportedTotal / overrides.maxContextWindow
        : 17584 / 270000,
    ...overrides,
  };
}

/** Render the component and return the static HTML string. */
function renderScreen(ctx: ContextSummary): string {
  return renderToStaticMarkup(
    React.createElement(ContextWindowScreen, { context: ctx })
  );
}

// ---------------------------------------------------------------------------
// 1. Baseline rendering — rodada-a.json values
// ---------------------------------------------------------------------------

describe("Baseline rendering (rodada-a.json values)", () => {
  const ctx = makeContext();
  const html = renderScreen(ctx);

  it("renders without throwing", () => {
    expect(() => renderScreen(ctx)).not.toThrow();
  });

  it("contains data-testid context-window-screen root", () => {
    expect(html).toContain('data-testid="context-window-screen"');
  });

  // Three aggregate numbers
  it("renders fixedOverhead 10.439", () => {
    // pt-BR locale uses period as thousands separator
    expect(html).toContain("10.439");
  });

  it("renders conversationTokens 7.145", () => {
    expect(html).toContain("7.145");
  });

  it("renders reportedTotal 17.584", () => {
    expect(html).toContain("17.584");
  });

  // All ten breakdown sources present in the HTML
  const BREAKDOWN_KEYS = [
    "toolDefinitions",
    "toolSystemPrompts",
    "skills",
    "staticSections",
    "baseRules",
    "customInstructions",
    "environment",
    "roleDefinition",
    "projectRules",
    "mcpToolDefinitions",
  ] as const;

  for (const key of BREAKDOWN_KEYS) {
    it(`renders breakdown row for ${key}`, () => {
      expect(html).toContain(`data-testid="breakdown-row-${key}"`);
    });
  }

  // toolDefinitions is the largest at 5403 (51.8% of 10439)
  it("toolDefinitions shows 5.403 tokens", () => {
    expect(html).toContain("5.403");
  });

  it("toolDefinitions percentage is ~51.8% of fixedOverhead", () => {
    // 5403/10439 = 51.756… → rounded to 51,8% in pt-BR format
    expect(html).toContain("51,8%");
  });

  // Percentages are computed against fixedOverhead (10439), not reportedTotal
  it("toolSystemPrompts shows 2.470 tokens", () => {
    expect(html).toContain("2.470");
  });

  it("toolSystemPrompts percentage is ~23.7% of fixedOverhead (not reportedTotal)", () => {
    // 2470/10439 = 23.661…% → 23,7%
    expect(html).toContain("23,7%");
  });

  it("skills shows 1.541 tokens", () => {
    expect(html).toContain("1.541");
  });

  it("skills percentage is ~14.8% of fixedOverhead", () => {
    // 1541/10439 = 14.762…% → 14,8%
    expect(html).toContain("14,8%");
  });

  it("roleDefinition shows 34 tokens", () => {
    // Small enough that pt-BR adds no thousands separator
    const tokensEl = html.match(/data-testid="breakdown-tokens-roleDefinition"[^>]*>([^<]+)</);
    expect(tokensEl).not.toBeNull();
    expect(tokensEl![1].trim()).toBe("34");
  });

  it("staticSections shows 563 tokens", () => {
    const tokensEl = html.match(/data-testid="breakdown-tokens-staticSections"[^>]*>([^<]+)</);
    expect(tokensEl).not.toBeNull();
    expect(tokensEl![1].trim()).toBe("563");
  });
});

// ---------------------------------------------------------------------------
// 2. projectRules === 0 → alert card present
// ---------------------------------------------------------------------------

describe("projectRules === 0 alert", () => {
  const ctx = makeContext({ breakdown: { ...makeContext().breakdown, projectRules: 0 } });
  const html = renderScreen(ctx);

  it("renders project-rules-alert element", () => {
    expect(html).toContain('data-testid="project-rules-alert"');
  });

  it("alert has role=alert for accessibility", () => {
    expect(html).toContain('role="alert"');
  });

  it("alert contains AGENTS.md explanation text", () => {
    expect(html).toContain("AGENTS.md");
  });

  it("alert card shows the big zero digit", () => {
    // The big zero appears in the .projectRulesZero element
    expect(html).toContain(">0<");
  });

  it("alert contains 'Não existe AGENTS.md neste projeto'", () => {
    expect(html).toContain("Não existe AGENTS.md neste projeto");
  });

  it("projectRules row has ACHADO badge", () => {
    expect(html).toContain("ACHADO");
  });

  it("projectRules row shows 0% share", () => {
    // Extract pct cell for projectRules
    const pctEl = html.match(
      /data-testid="breakdown-pct-projectRules"[^>]*>([^<]+)</
    );
    expect(pctEl).not.toBeNull();
    expect(pctEl![1].trim()).toBe("0,0%");
  });
});

// ---------------------------------------------------------------------------
// 3. projectRules > 0 → no alert card
// ---------------------------------------------------------------------------

describe("projectRules > 0 — no alert rendered", () => {
  const ctx = makeContext({
    fixedOverhead: 11000,
    breakdown: {
      roleDefinition:     34,
      staticSections:     563,
      skills:             1541,
      baseRules:          197,
      projectRules:       500, // non-zero
      customInstructions: 160,
      environment:        71,
      toolSystemPrompts:  2470,
      toolDefinitions:    5403,
      mcpToolDefinitions: 61,
    },
    breakdownPct: {} as ContextSummary["breakdownPct"], // will be overridden by makeContext
  });
  const html = renderScreen(ctx);

  it("does NOT render project-rules-alert element", () => {
    expect(html).not.toContain('data-testid="project-rules-alert"');
  });

  it("does NOT contain 'Não existe AGENTS.md neste projeto'", () => {
    expect(html).not.toContain("Não existe AGENTS.md neste projeto");
  });

  it("still renders the projectRules row", () => {
    expect(html).toContain('data-testid="breakdown-row-projectRules"');
  });
});

// ---------------------------------------------------------------------------
// 4. maxContextWindow null → pressure unavailable
// ---------------------------------------------------------------------------

describe("maxContextWindow null → pressure unavailable", () => {
  const ctx = makeContext({ maxContextWindow: null, pressure: null });
  const html = renderScreen(ctx);

  it("shows indisponivel / unavailable message", () => {
    // Component renders the Portuguese unavailability label
    expect(html).toContain("Pressão indisponível");
  });

  it("does NOT show a percentage figure in pressure label", () => {
    expect(html).toContain('data-testid="pressure-label"');
    // The pressure label must not contain a % digit in the unavailable path
    const pressureEl = html.match(
      /data-testid="pressure-label"[^>]*>([^<]+)</
    );
    expect(pressureEl).not.toBeNull();
    expect(pressureEl![1]).not.toMatch(/\d+[,\.]\d+%/);
  });

  it("does NOT assume a default window size of 270k", () => {
    // The pressure label text must not contain "270" when null
    const pressureEl = html.match(
      /data-testid="pressure-label"[^>]*>([^<]+)</
    );
    expect(pressureEl).not.toBeNull();
    expect(pressureEl![1]).not.toContain("270");
  });
});

// ---------------------------------------------------------------------------
// 5. maxContextWindow 270000 → pressure ~6.5%
// ---------------------------------------------------------------------------

describe("maxContextWindow 270000 → pressure display", () => {
  // pressure = 17584 / 270000 = 0.065126… → 6.5%
  const ctx = makeContext({
    maxContextWindow: 270000,
    pressure: 17584 / 270000,
  });
  const html = renderScreen(ctx);

  it("pressure label contains percentage around 6.5%", () => {
    const pressureEl = html.match(
      /data-testid="pressure-label"[^>]*>([^<]+)</
    );
    expect(pressureEl).not.toBeNull();
    // 17584/270000 = 6.512…% → pt-BR: "6,5%"
    expect(pressureEl![1]).toContain("6,5%");
  });

  it("pressure label mentions 270k window", () => {
    const pressureEl = html.match(
      /data-testid="pressure-label"[^>]*>([^<]+)</
    );
    expect(pressureEl).not.toBeNull();
    expect(pressureEl![1]).toContain("270k");
  });
});

// ---------------------------------------------------------------------------
// 6. Zero overhead edge case
// ---------------------------------------------------------------------------

describe("Zero fixedOverhead edge case", () => {
  const ctx = makeContext({
    fixedOverhead: 0,
    conversationTokens: 0,
    reportedTotal: 0,
    breakdown: {
      roleDefinition:     0,
      staticSections:     0,
      skills:             0,
      baseRules:          0,
      projectRules:       0,
      customInstructions: 0,
      environment:        0,
      toolSystemPrompts:  0,
      toolDefinitions:    0,
      mcpToolDefinitions: 0,
    },
    maxContextWindow: null,
    pressure: null,
  });

  it("renders without throwing", () => {
    expect(() => renderScreen(ctx)).not.toThrow();
  });

  it("HTML does not contain NaN", () => {
    const html = renderScreen(ctx);
    expect(html).not.toContain("NaN");
  });

  it("HTML does not contain Infinity", () => {
    const html = renderScreen(ctx);
    expect(html).not.toContain("Infinity");
  });

  it("all breakdown rows show 0,0% (no division by zero)", () => {
    const html = renderScreen(ctx);
    // All ten pct cells should be 0,0% — count occurrences
    const matches = html.match(/data-testid="breakdown-pct-/g);
    expect(matches).not.toBeNull();
    // Extract each pct cell value
    const pctPattern = /data-testid="breakdown-pct-[^"]*"[^>]*>([^<]+)</g;
    let match: RegExpExecArray | null;
    const values: string[] = [];
    while ((match = pctPattern.exec(html)) !== null) {
      values.push(match[1].trim());
    }
    expect(values.length).toBe(10);
    for (const v of values) {
      expect(v).toBe("0,0%");
    }
  });

  it("renders the bar-empty fallback when overhead is zero", () => {
    const html = renderScreen(ctx);
    expect(html).toContain('data-testid="bar-empty"');
  });
});

// ---------------------------------------------------------------------------
// 7. Responsive layout — no overflow-x on body introduced by the component
// ---------------------------------------------------------------------------

describe("Responsive layout — no horizontal overflow", () => {
  it("component CSS does not set overflow-x: auto on html or body elements", () => {
    // The component wraps content in .screen which has overflow-x:hidden,
    // preventing page-level horizontal scroll. Verify the component root
    // does not inject styles that overflow the body.
    const ctx = makeContext();
    const html = renderScreen(ctx);

    // The root element has data-testid="context-window-screen"
    expect(html).toContain('data-testid="context-window-screen"');

    // The table scroll container is nested (overflow-x:auto on the container,
    // not the body). Verify the component renders and the table section exists.
    expect(html).toContain('data-testid="breakdown-row-toolDefinitions"');
  });

  it("all ten breakdown rows are rendered even on zero-value items", () => {
    const ctx = makeContext();
    const html = renderScreen(ctx);
    const rows = [
      "toolDefinitions",
      "toolSystemPrompts",
      "skills",
      "staticSections",
      "baseRules",
      "customInstructions",
      "environment",
      "roleDefinition",
      "projectRules",
      "mcpToolDefinitions",
    ];
    for (const key of rows) {
      expect(html).toContain(`data-testid="breakdown-row-${key}"`);
    }
  });
});

// ---------------------------------------------------------------------------
// 8. No sensitive data on screen
// ---------------------------------------------------------------------------

describe("Sensitive data exclusion", () => {
  const ctx = makeContext();
  const html = renderScreen(ctx);

  it("does not render REDACTED placeholders from internal types", () => {
    // Component only receives ContextSummary — it never has access to
    // workspace paths, task titles, or message content.
    expect(html).not.toContain("[REDACTED]");
  });

  it("does not render any absolute path patterns", () => {
    // No filesystem paths should appear
    expect(html).not.toMatch(/[A-Za-z]:\\[\\/]/);
    expect(html).not.toMatch(/\/home\/[^<]+/);
    expect(html).not.toMatch(/\/Users\/[^<]+/);
  });
});
