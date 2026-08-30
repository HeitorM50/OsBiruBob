/**
 * PrescriptionScreen — F6 / Prescriptions UI
 *
 * Renders five always-visible tabs for the solution screen:
 *   AGENTS.md | Tools | Skills | MCPs | Subagents
 *
 * Rules (AGENTS.md):
 * - No raw export reads — consumes Prescription[] and Finding[] only.
 * - Export-derived content is rendered through React text nodes only.
 * - No network, no Node APIs, no LLM calls.
 * - Catalog fields (replaces, rationale) are trusted and rendered directly.
 * - Evidence with redactable:true is never shown in the clear.
 * - Estimates are always labelled as estimates (I-6).
 */

import React, { useState, useRef, useCallback } from "react";
import type { Finding, Prescription } from "../domain/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PrescriptionScreenProps {
  /** All prescriptions produced by prescribe*() functions. */
  prescriptions: Prescription[];
  /** All findings produced by diagnose(). */
  findings: Finding[];
  /** Content of the repository AGENTS.md, or null when absent. */
  existingAgentsMd: string | null;
  /**
   * Context pressure as a 0-1 ratio, or null when maxContextWindow is unavailable.
   * Derived from ObserveReport.tasks[*].context.pressure.
   */
  contextPressure: number | null;
}

// ---------------------------------------------------------------------------
// Diff helpers (AGENTS.md tab)
// ---------------------------------------------------------------------------

type DiffLine =
  | { kind: "context"; text: string }
  | { kind: "added"; text: string }
  | { kind: "removed"; text: string };

/**
 * Produce a unified-style line diff between two texts.
 * Pure function — no external library needed for this use case.
 */
function diffLines(oldText: string | null, newText: string): DiffLine[] {
  const oldLines = oldText === null ? [] : oldText.split("\n");
  const newLines = newText.split("\n");

  // Build LCS table
  const m = oldLines.length;
  const n = newLines.length;
  // dp[i][j] = LCS length of oldLines[0..i-1] vs newLines[0..j-1]
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Traceback
  const result: DiffLine[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ kind: "context", text: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ kind: "added", text: newLines[j - 1] });
      j--;
    } else {
      result.unshift({ kind: "removed", text: oldLines[i - 1] });
      i--;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Browser action helpers (Copy / Download)
// ---------------------------------------------------------------------------

function copyToClipboard(text: string): void {
  // Clipboard API is browser-only — safe here (no Node import).
  void navigator.clipboard.writeText(text);
}

function downloadText(text: string, filename: string): void {
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function relatedFindings(
  prescription: Prescription,
  findings: readonly Finding[]
): Finding[] {
  const byId = new Map(findings.map((finding) => [finding.id, finding]));
  return prescription.findingIds.flatMap((id) => {
    const finding = byId.get(id);
    return finding ? [finding] : [];
  });
}

function hasTraceableOrigin(
  prescription: Prescription,
  findings: readonly Finding[]
): boolean {
  if (prescription.findingIds.length === 0) return false;
  const knownIds = new Set(findings.map((finding) => finding.id));
  return prescription.findingIds.every((id) => knownIds.has(id));
}

// ---------------------------------------------------------------------------
// Small shared components
// ---------------------------------------------------------------------------

const STYLES = {
  panel: {
    background: "var(--panel, #fff)",
    border: "1px solid var(--line2, #dcdfe3)",
    borderRadius: 8,
    padding: "20px 24px",
    marginBottom: 16,
  } as React.CSSProperties,

  chip: (color: string) =>
    ({
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 10,
      fontSize: 12,
      fontWeight: 600,
      background: color,
      marginRight: 6,
      color: "#fff",
    }) as React.CSSProperties,

  codeBlock: {
    fontFamily: "ui-monospace, monospace",
    fontSize: 13,
    lineHeight: 1.55,
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
  } as React.CSSProperties,

  emptyState: {
    padding: "32px 0",
    textAlign: "center" as const,
    color: "var(--ink3, #7b838c)",
    fontSize: 14,
  } as React.CSSProperties,

  actionBtn: {
    padding: "5px 12px",
    fontSize: 12,
    border: "1px solid var(--line2, #dcdfe3)",
    borderRadius: 6,
    background: "var(--soft, #f4f6f8)",
    color: "var(--ink2, #4a525b)",
    cursor: "pointer",
    fontFamily: "inherit",
  } as React.CSSProperties,

  findingIdRow: {
    fontSize: 11,
    fontFamily: "ui-monospace, monospace",
    color: "var(--ink3, #7b838c)",
    marginTop: 8,
    wordBreak: "break-all" as const,
  } as React.CSSProperties,
} as const;

function ActionBar({
  text,
  filename,
  label,
}: {
  text: string;
  filename: string;
  label: string;
}) {
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
      <button
        type="button"
        style={STYLES.actionBtn}
        onClick={() => copyToClipboard(text)}
        aria-label={`Copy ${label}`}
      >
        Copy
      </button>
      <button
        type="button"
        style={STYLES.actionBtn}
        onClick={() => downloadText(text, filename)}
        aria-label={`Download ${label} as ${filename}`}
      >
        Download
      </button>
    </div>
  );
}

function FindingIds({ ids }: { ids: string[] }) {
  return (
    <div style={STYLES.findingIdRow}>
      <span style={{ marginRight: 8 }}>Origin:</span>
      {ids.map((id) => (
        <span key={id} style={{ marginRight: 8 }}>
          {id}
        </span>
      ))}
    </div>
  );
}

function EvidenceList({
  findings,
  revealSensitive,
}: {
  findings: readonly Finding[];
  revealSensitive: boolean;
}) {
  return (
    <section aria-label="Evidence" style={{ marginTop: 14 }}>
      <strong style={{ display: "block", fontSize: 12, marginBottom: 6 }}>Evidence</strong>
      <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: "var(--ink2, #4a525b)" }}>
        {findings.map((finding) => {
          const turns = finding.evidence.turnIndices;
          const safeDetail =
            !finding.evidence.redactable && finding.evidence.fieldPath
              ? finding.evidence.fieldPath
              : !finding.evidence.redactable && finding.evidence.breakdownField
                ? String(finding.evidence.breakdownField)
                : null;
          const commands =
            revealSensitive && finding.evidence.redactable
              ? finding.evidence.externalCommands ?? []
              : [];

          return (
            <li key={finding.id} style={{ marginBottom: 6 }}>
              <span>
                {finding.kind} · {finding.confidence} confidence
                {turns && turns.length > 0 ? ` · turns ${turns.join(", ")}` : ""}
                {safeDetail ? ` · ${safeDetail}` : ""}
              </span>
              {finding.evidence.redactable && commands.length === 0 && (
                <span> · [REDACTED]</span>
              )}
              {commands.length > 0 && (
                <ul style={{ marginTop: 5, paddingLeft: 18 }}>
                  {commands.map((command, index) => (
                    <li key={`${finding.id}-command-${index}`}>
                      <code style={{ fontFamily: "ui-monospace, monospace" }}>{command}</code>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function EstimateLabel() {
  return (
    <span
      style={{
        ...STYLES.chip("var(--bar2, #4d5762)"),
        fontSize: 11,
        background: "transparent",
        border: "1px solid var(--line2, #dcdfe3)",
        color: "var(--ink3, #7b838c)",
        padding: "1px 6px",
      }}
    >
      estimate
    </span>
  );
}

// ---------------------------------------------------------------------------
// Tab 1 — AGENTS.md
// ---------------------------------------------------------------------------

function AgentsMdTab({
  prescriptions,
  findings,
  existingAgentsMd,
  revealSensitive,
}: {
  prescriptions: Prescription[];
  findings: Finding[];
  existingAgentsMd: string | null;
  revealSensitive: boolean;
}) {
  const filePrescriptions = prescriptions.filter(
    (p): p is Prescription & { content: string } =>
      p.kind === "agents-md-file" &&
      hasTraceableOrigin(p, findings) &&
      typeof p.content === "string"
  );

  if (filePrescriptions.length === 0) {
    return (
      <div style={STYLES.emptyState}>
        <p>No AGENTS.md recommendation for this session.</p>
        <p style={{ marginTop: 8, fontSize: 12 }}>
          Recommendations require at least one qualifying finding (project-rules-absent,
          human-intervention, redundant-read, or retry-after-error).
        </p>
      </div>
    );
  }

  return (
    <div>
      {filePrescriptions.map((p) => {
        const diff = diffLines(existingAgentsMd, p.content);
        const isNewFile = existingAgentsMd === null;

        return (
          <div key={p.id} style={STYLES.panel}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <strong style={{ fontSize: 15 }}>AGENTS.md</strong>
              {isNewFile && (
                <span style={STYLES.chip("var(--good, #1f6b45)")}>new file</span>
              )}
            </div>

            <p style={{ fontSize: 13, color: "var(--ink2, #4a525b)", marginBottom: 12 }}>
              {p.rationale}
            </p>

            {/* Color-coded diff */}
            <div
              style={{
                ...STYLES.codeBlock,
                background: "var(--soft, #f4f6f8)",
                border: "1px solid var(--line2, #dcdfe3)",
                borderRadius: 6,
                padding: "12px 14px",
                overflowX: "auto",
                maxHeight: 520,
                overflowY: "auto",
              }}
              aria-label="AGENTS.md diff"
            >
              {diff.map((line, idx) => (
                <div
                  key={idx}
                  style={{
                    color:
                      line.kind === "added"
                        ? "var(--good, #1f6b45)"
                        : line.kind === "removed"
                          ? "var(--acc, #a3401f)"
                          : "var(--ink, #14181c)",
                    background:
                      line.kind === "added"
                        ? "var(--goodsoft, #eff6f2)"
                        : line.kind === "removed"
                          ? "var(--accsoft, #fbf3f0)"
                          : "transparent",
                    paddingLeft: 4,
                    userSelect: "text",
                  }}
                >
                  {line.kind === "added" ? "+ " : line.kind === "removed" ? "- " : "  "}
                  {line.text}
                </div>
              ))}
            </div>

            <ActionBar text={p.content} filename="AGENTS.md" label="AGENTS.md" />
            <EvidenceList
              findings={relatedFindings(p, findings)}
              revealSensitive={revealSensitive}
            />
            <FindingIds ids={p.findingIds} />
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 2 — Tools
// ---------------------------------------------------------------------------

interface ToolGroup {
  group: string;
  tools: Array<{ name: string; purpose: string | null }>;
  prescription: Prescription;
}

function groupToolPrescriptions(
  prescriptions: Prescription[],
  findings: Finding[]
): ToolGroup[] {
  const groups: ToolGroup[] = [];
  for (const p of prescriptions) {
    if (p.kind !== "disable-tool" || !hasTraceableOrigin(p, findings) || !p.content) continue;

    // Parse group name and tool list from content
    const lines = p.content.split("\n");
    const groupLine = lines.find((l) => l.startsWith("Group: "));
    const group = groupLine ? groupLine.slice("Group: ".length).trim() : "outros";
    const tools = lines
      .filter((l) => l.startsWith("- "))
      .map((l) => ({ name: l.slice(2).trim(), purpose: null }));

    if (tools.length > 0) {
      groups.push({ group, tools, prescription: p });
    }
  }
  return groups;
}

function ToolsTab({
  prescriptions,
  findings,
  revealSensitive,
}: {
  prescriptions: Prescription[];
  findings: Finding[];
  revealSensitive: boolean;
}) {
  const groups = groupToolPrescriptions(prescriptions, findings);

  const totalTools = groups.reduce((sum, g) => sum + g.tools.length, 0);

  if (groups.length === 0) {
    return (
      <div style={STYLES.emptyState}>
        <p>No idle tool recommendations for this session.</p>
        <p style={{ marginTop: 8, fontSize: 12 }}>
          Recommendations appear when tools were loaded but never called.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--ink2, #4a525b)", marginBottom: 16 }}>
        {totalTools} idle tool{totalTools !== 1 ? "s" : ""} grouped by catalog purpose.
        Savings are <EstimateLabel /> — individual per-tool costs are not measured.
      </p>

      {groups.map((g) => {
        const saving = g.prescription.estimatedTokenSaving;
        return (
          <div key={g.prescription.id} style={STYLES.panel}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <strong style={{ fontSize: 14 }}>{g.group}</strong>
              {saving !== undefined && (
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--ink3, #7b838c)",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  ~{Math.round(saving)} tokens <EstimateLabel />
                </span>
              )}
            </div>

            <p style={{ fontSize: 13, color: "var(--ink2, #4a525b)", marginBottom: 10 }}>
              {g.prescription.rationale}
            </p>

            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>
              {g.tools.map((t) => (
                <li key={t.name} style={{ marginBottom: 4 }}>
                  <code style={{ fontFamily: "ui-monospace, monospace" }}>{t.name}</code>
                </li>
              ))}
            </ul>

            <ActionBar
              text={g.prescription.content ?? ""}
              filename={`disable-tools-${g.group}.txt`}
              label={`${g.group} tools`}
            />
            <EvidenceList
              findings={relatedFindings(g.prescription, findings)}
              revealSensitive={revealSensitive}
            />
            <FindingIds ids={g.prescription.findingIds} />
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 3 — Skills
// ---------------------------------------------------------------------------

function SkillsTab({
  prescriptions,
  findings,
  revealSensitive,
}: {
  prescriptions: Prescription[];
  findings: Finding[];
  revealSensitive: boolean;
}) {
  const skillPrescriptions = prescriptions.filter(
    (p) => p.kind === "disable-skill" && hasTraceableOrigin(p, findings)
  );

  if (skillPrescriptions.length === 0) {
    return (
      <div style={STYLES.emptyState}>
        <p>No loaded-but-unused Skill recommendations for this session.</p>
        <p style={{ marginTop: 8, fontSize: 12 }}>
          This appears when Skills contribute tokens to the context window
          but no Skill is declared as loaded in the export.
        </p>
      </div>
    );
  }

  return (
    <div>
      {skillPrescriptions.map((p) => {
        const relatedFindings = findings.filter((f) => p.findingIds.includes(f.id));
        const totalSkillTokens = relatedFindings.reduce(
          (sum, f) =>
            typeof f.metric.skillTokens === "number" ? sum + f.metric.skillTokens : sum,
          0
        );

        return (
          <div key={p.id} style={STYLES.panel}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <strong style={{ fontSize: 14 }}>Skill overhead</strong>
              {p.estimatedTokenSaving !== undefined && (
                <span style={{ fontSize: 12, color: "var(--ink3, #7b838c)", display: "flex", alignItems: "center", gap: 4 }}>
                  ~{Math.round(p.estimatedTokenSaving)} tokens <EstimateLabel />
                </span>
              )}
            </div>

            <p style={{ fontSize: 13, color: "var(--ink2, #4a525b)", marginBottom: 10 }}>
              {p.content}
            </p>
            <p style={{ fontSize: 13, color: "var(--ink2, #4a525b)", marginBottom: 10 }}>
              {p.rationale}
            </p>

            {totalSkillTokens > 0 && (
              <div
                style={{
                  background: "var(--soft, #f4f6f8)",
                  border: "1px solid var(--line2, #dcdfe3)",
                  borderRadius: 6,
                  padding: "8px 12px",
                  fontSize: 12,
                  fontFamily: "ui-monospace, monospace",
                  marginBottom: 10,
                }}
              >
                Measured skill tokens: {totalSkillTokens}
              </div>
            )}

            {/* Evidence section — no redactable content */}
            {relatedFindings.map((f) =>
              !f.evidence.redactable &&
              f.evidence.breakdownField &&
              f.evidence.breakdownValue !== undefined ? (
                <div
                  key={f.id}
                  style={{
                    fontSize: 12,
                    color: "var(--ink3, #7b838c)",
                    marginBottom: 6,
                    fontFamily: "ui-monospace, monospace",
                  }}
                >
                  {f.evidence.fieldPath ?? f.evidence.breakdownField}: {f.evidence.breakdownValue}
                </div>
              ) : null
            )}

            <ActionBar
              text={[p.content ?? "", p.rationale ?? ""].filter(Boolean).join("\n\n")}
              filename="disable-skills.txt"
              label="Skill overhead"
            />
            <EvidenceList findings={relatedFindings} revealSensitive={revealSensitive} />
            <FindingIds ids={p.findingIds} />
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 4 — MCPs
// ---------------------------------------------------------------------------

function McpsTab({
  prescriptions,
  findings,
  revealSensitive,
}: {
  prescriptions: Prescription[];
  findings: Finding[];
  revealSensitive: boolean;
}) {
  const mcpPrescriptions = prescriptions.filter(
    (p) => p.kind === "enable-mcp" && hasTraceableOrigin(p, findings)
  );

  if (mcpPrescriptions.length === 0) {
    return (
      <div style={STYLES.emptyState}>
        <p>No MCP server recommendations for this session.</p>
        <p style={{ marginTop: 8, fontSize: 12 }}>
          Recommendations appear when shell commands match a known MCP server catalog entry
          (minimum 2 matching commands per entry).
        </p>
      </div>
    );
  }

  return (
    <div>
      {mcpPrescriptions.map((p) => {
        // Each MCP prescription is sourced from exactly one finding
        const sourceFindings = relatedFindings(p, findings);
        const rationaleAlreadyShown = sourceFindings.some(
          (finding) => finding.evidence.rationale === p.rationale
        );

        return (
          <div key={p.id} style={STYLES.panel}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <strong style={{ fontSize: 14 }}>{p.content ?? "MCP Server"}</strong>
              <span style={STYLES.chip("var(--bar2, #4d5762)")}>
                {sourceFindings[0]?.confidence ?? "unknown"} confidence
              </span>
            </div>

            {/* Trusted catalog fields — may be rendered directly per AGENTS.md */}
            {sourceFindings.map((f) => (
              <div key={f.id}>
                {f.evidence.replaces && (
                  <p style={{ fontSize: 13, color: "var(--ink2, #4a525b)", marginBottom: 8 }}>
                    <strong>Replaces:</strong> {f.evidence.replaces}
                  </p>
                )}
                {f.evidence.rationale && (
                  <p style={{ fontSize: 13, color: "var(--ink2, #4a525b)", marginBottom: 8 }}>
                    <strong>Why:</strong> {f.evidence.rationale}
                  </p>
                )}

                {/* Numeric evidence is always safe; raw command text requires explicit reveal. */}
                {typeof f.metric.hitCount === "number" && (
                  <div
                    style={{
                      background: "var(--soft, #f4f6f8)",
                      border: "1px solid var(--line2, #dcdfe3)",
                      borderRadius: 6,
                      padding: "8px 12px",
                      fontSize: 12,
                      marginBottom: 8,
                    }}
                  >
                    <span style={{ fontFamily: "ui-monospace, monospace" }}>
                      {f.metric.hitCount} matching command{(f.metric.hitCount as number) !== 1 ? "s" : ""}
                    </span>
                    {Array.isArray(f.evidence.turnIndices) && f.evidence.turnIndices.length > 0 && (
                      <span style={{ marginLeft: 12, color: "var(--ink3, #7b838c)" }}>
                        turns: {(f.evidence.turnIndices as number[]).join(", ")}
                      </span>
                    )}
                    {Array.isArray(f.metric.binaries) && (f.metric.binaries as string[]).length > 0 && (
                      <span style={{ marginLeft: 12 }}>
                        binaries: {(f.metric.binaries as string[]).join(", ")}
                      </span>
                    )}
                  </div>
                )}

              </div>
            ))}

            {p.rationale && !rationaleAlreadyShown && (
              <p style={{ fontSize: 13, color: "var(--ink2, #4a525b)", marginBottom: 8 }}>
                {p.rationale}
              </p>
            )}

            <ActionBar
              text={[p.content ?? "", p.rationale ?? ""].filter(Boolean).join("\n\n")}
              filename="enable-mcp.txt"
              label="MCP recommendation"
            />
            <EvidenceList findings={sourceFindings} revealSensitive={revealSensitive} />
            <FindingIds ids={p.findingIds} />
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 5 — Subagents
// ---------------------------------------------------------------------------

function SubagentsTab({
  prescriptions,
  findings,
  contextPressure,
  revealSensitive,
}: {
  prescriptions: Prescription[];
  findings: Finding[];
  contextPressure: number | null;
  revealSensitive: boolean;
}) {
  const splitPrescriptions = prescriptions.filter(
    (prescription) =>
      prescription.kind === "split-subagent" &&
      hasTraceableOrigin(prescription, findings)
  );

  if (splitPrescriptions.length > 0) {
    return (
      <div>
        {splitPrescriptions.map((prescription) => (
          <div key={prescription.id} style={STYLES.panel}>
            <strong style={{ fontSize: 14 }}>Split the work into subagents</strong>
            {prescription.content && (
              <p style={{ fontSize: 13, color: "var(--ink2, #4a525b)" }}>
                {prescription.content}
              </p>
            )}
            {prescription.rationale && (
              <p style={{ fontSize: 13, color: "var(--ink2, #4a525b)" }}>
                {prescription.rationale}
              </p>
            )}
            <ActionBar
              text={[prescription.content ?? "", prescription.rationale ?? ""]
                .filter(Boolean)
                .join("\n\n")}
              filename="split-subagents.txt"
              label="Subagent recommendation"
            />
            <EvidenceList
              findings={relatedFindings(prescription, findings)}
              revealSensitive={revealSensitive}
            />
            <FindingIds ids={prescription.findingIds} />
          </div>
        ))}
      </div>
    );
  }

  if (contextPressure === null) {
    return (
      <div style={STYLES.emptyState}>
        <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Not evaluable</p>
        <p style={{ fontSize: 13 }}>
          Context-window data is unavailable. The export does not provide the maximum
          context window size, so context pressure cannot be calculated.
        </p>
      </div>
    );
  }

  const pct = contextPressure * 100;
  return (
    <div style={STYLES.emptyState}>
      <p style={{ fontSize: 13 }}>
        Context pressure is <strong>{pct.toFixed(1)}%</strong>. No traceable subagent
        prescription was generated for this session.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab bar (keyboard-navigable ARIA tablist)
// ---------------------------------------------------------------------------

const TAB_IDS = ["agents-md", "tools", "skills", "mcps", "subagents"] as const;
type TabId = (typeof TAB_IDS)[number];

const TAB_LABELS: Record<TabId, string> = {
  "agents-md": "AGENTS.md",
  tools: "Tools",
  skills: "Skills",
  mcps: "MCPs",
  subagents: "Subagents",
};

// ---------------------------------------------------------------------------
// PrescriptionScreen
// ---------------------------------------------------------------------------

export function PrescriptionScreen({
  prescriptions,
  findings,
  existingAgentsMd,
  contextPressure,
}: PrescriptionScreenProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>("agents-md");
  const [revealSensitive, setRevealSensitive] = useState(false);
  const tabRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});
  const hasSensitiveEvidence = findings.some(
    (finding) => finding.evidence.redactable
  );

  const activateTab = useCallback((id: TabId) => {
    setActiveTab(id);
    tabRefs.current[id]?.focus();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent, currentId: TabId) {
    const idx = TAB_IDS.indexOf(currentId);
    if (e.key === "ArrowRight") {
      e.preventDefault();
      activateTab(TAB_IDS[(idx + 1) % TAB_IDS.length]);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      activateTab(TAB_IDS[(idx + TAB_IDS.length - 1) % TAB_IDS.length]);
    } else if (e.key === "Home") {
      e.preventDefault();
      activateTab(TAB_IDS[0]);
    } else if (e.key === "End") {
      e.preventDefault();
      activateTab(TAB_IDS[TAB_IDS.length - 1]);
    }
  }

  return (
    <div
      style={{
        background: "var(--bg, #f4f6f8)",
        color: "var(--ink, #14181c)",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif",
        minHeight: "100%",
        maxWidth: 1180,
        margin: "0 auto",
        padding: "44px 28px 56px",
      }}
    >
      <header style={{ maxWidth: 760, marginBottom: 28 }}>
        <div
          style={{
            fontSize: 12,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--ink3, #7b838c)",
            marginBottom: 14,
          }}
        >
          Prescriptions
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: 34,
            lineHeight: 1.12,
            fontWeight: 600,
            letterSpacing: "-0.035em",
          }}
        >
          Corrected configuration, ready to copy.
        </h1>
        <p style={{ margin: "14px 0 0", fontSize: 15, lineHeight: 1.6, color: "var(--ink2, #4a525b)" }}>
          Every item explains what to change, why it helps, and which finding produced it.
        </p>
        {hasSensitiveEvidence && (
          <button
            type="button"
            aria-pressed={revealSensitive}
            onClick={() => setRevealSensitive((value) => !value)}
            style={{ ...STYLES.actionBtn, marginTop: 14 }}
          >
            {revealSensitive ? "Redact sensitive evidence" : "Reveal sensitive evidence"}
          </button>
        )}
      </header>

      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Prescription categories"
        style={{
          display: "flex",
          gap: 0,
          borderBottom: "2px solid var(--line2, #dcdfe3)",
          background: "var(--panel, #fff)",
          overflowX: "auto",
        }}
      >
        {TAB_IDS.map((id) => {
          const selected = id === activeTab;
          return (
            <button
              key={id}
              id={`tab-${id}`}
              role="tab"
              aria-selected={selected}
              aria-controls={`panel-${id}`}
              tabIndex={selected ? 0 : -1}
              ref={(el) => {
                tabRefs.current[id] = el;
              }}
              onClick={() => activateTab(id)}
              onKeyDown={(e) => handleKeyDown(e, id)}
              type="button"
              style={{
                padding: "12px 20px",
                fontSize: 14,
                fontWeight: selected ? 600 : 400,
                border: "none",
                borderBottom: selected
                  ? "2px solid var(--acc, #a3401f)"
                  : "2px solid transparent",
                background: "transparent",
                color: selected ? "var(--acc, #a3401f)" : "var(--ink2, #4a525b)",
                cursor: "pointer",
                fontFamily: "inherit",
                marginBottom: -2,
                outline: "none",
              }}
            >
              {TAB_LABELS[id]}
            </button>
          );
        })}
      </div>

      {/* Tab panels */}
      <p style={{ margin: "10px 2px 0", fontSize: 12, color: "var(--ink3, #7b838c)" }}>
        Use Left and Right Arrow keys to navigate the tabs.
      </p>

      <div style={{ padding: "20px 0 0" }}>
        <div
          id="panel-agents-md"
          role="tabpanel"
          aria-labelledby="tab-agents-md"
          hidden={activeTab !== "agents-md"}
        >
          <AgentsMdTab
            prescriptions={prescriptions}
            findings={findings}
            existingAgentsMd={existingAgentsMd}
            revealSensitive={revealSensitive}
          />
        </div>

        <div
          id="panel-tools"
          role="tabpanel"
          aria-labelledby="tab-tools"
          hidden={activeTab !== "tools"}
        >
          <ToolsTab
            prescriptions={prescriptions}
            findings={findings}
            revealSensitive={revealSensitive}
          />
        </div>

        <div
          id="panel-skills"
          role="tabpanel"
          aria-labelledby="tab-skills"
          hidden={activeTab !== "skills"}
        >
          <SkillsTab
            prescriptions={prescriptions}
            findings={findings}
            revealSensitive={revealSensitive}
          />
        </div>

        <div
          id="panel-mcps"
          role="tabpanel"
          aria-labelledby="tab-mcps"
          hidden={activeTab !== "mcps"}
        >
          <McpsTab
            prescriptions={prescriptions}
            findings={findings}
            revealSensitive={revealSensitive}
          />
        </div>

        <div
          id="panel-subagents"
          role="tabpanel"
          aria-labelledby="tab-subagents"
          hidden={activeTab !== "subagents"}
        >
          <SubagentsTab
            prescriptions={prescriptions}
            findings={findings}
            contextPressure={contextPressure}
            revealSensitive={revealSensitive}
          />
        </div>
      </div>
    </div>
  );
}
