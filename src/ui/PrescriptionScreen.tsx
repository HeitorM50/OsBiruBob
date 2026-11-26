/**
 * PrescriptionScreen — Step 3 ("Fix") of Load → Diagnose → Fix → Compare.
 *
 * Rules (AGENTS.md):
 * - No raw export reads — consumes Prescription[] and Finding[] only.
 * - Export-derived content is rendered through React text nodes only.
 * - No network, no Node APIs, no LLM calls.
 * - Catalog fields (replaces, rationale, docsUrl, installSnippet, purpose) are
 *   trusted and rendered directly.
 * - Evidence with redactable:true stays hidden until per-item confirmation
 *   via the shared SensitiveReveal pattern.
 * - Estimates are always labelled as estimates (I-6).
 * - Only non-empty tabs are shown, ordered by estimated token saving descending.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Finding,
  PrescribedToolSummary,
  Prescription,
} from "../domain/types";
import { findingKindLabel } from "./finding-labels";
import { formatInteger, formatTokens } from "./format";
import { InlineSensitiveReveal, isSensitiveEvidence } from "./SensitiveReveal";
import styles from "./PrescriptionScreen.module.css";

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
  /** Called when the user clicks a back-link to inspect an origin finding in Diagnose. */
  onNavigateToFinding?: (findingId: string) => void;
  /** Optional prescription ID to focus when arriving from Diagnose's "See fix →". */
  focusedPrescriptionId?: string | null;
}

type TabId = "tools" | "skills" | "agents-md" | "mcps";

interface TabMeta {
  id: TabId;
  label: string;
  count: number;
  estimatedSaving: number;
  prescriptionIds: string[];
}

const CANONICAL_TAB_ORDER: readonly TabId[] = [
  "tools",
  "skills",
  "agents-md",
  "mcps",
];

// ---------------------------------------------------------------------------
// Diff helpers (AGENTS.md tab)
// ---------------------------------------------------------------------------

type DiffLine =
  | { kind: "context"; text: string }
  | { kind: "added"; text: string }
  | { kind: "removed"; text: string };

function diffLines(oldText: string | null, newText: string): DiffLine[] {
  const oldLines = oldText === null ? [] : oldText.split("\n");
  const newLines = newText.split("\n");

  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0)
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

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

async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
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
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

function isSafeHttpUrl(url: string | null | undefined): url is string {
  if (typeof url !== "string" || url.length === 0) return false;
  return /^https?:\/\//i.test(url);
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

function sumSavings(prescriptions: readonly Prescription[]): number {
  return prescriptions.reduce(
    (sum, p) =>
      typeof p.estimatedTokenSaving === "number" &&
      Number.isFinite(p.estimatedTokenSaving)
        ? sum + p.estimatedTokenSaving
        : sum,
    0
  );
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function ActionBar({
  text,
  filename,
  label,
  showDownload = true,
}: {
  text: string;
  filename?: string;
  label: string;
  showDownload?: boolean;
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">(
    "idle"
  );
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  async function handleCopy(): Promise<void> {
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
    }
    const ok = await copyToClipboard(text);
    setCopyStatus(ok ? "copied" : "error");
    resetTimerRef.current = window.setTimeout(() => {
      setCopyStatus("idle");
      resetTimerRef.current = null;
    }, 2500);
  }

  return (
    <div className={styles.actionBar}>
      <button
        type="button"
        className={styles.actionBtn}
        onClick={() => void handleCopy()}
        aria-label={`Copy ${label}`}
      >
        {copyStatus === "copied" ? "Copied" : "Copy"}
      </button>
      {showDownload && filename && (
        <button
          type="button"
          className={styles.actionBtn}
          onClick={() => downloadText(text, filename)}
          aria-label={`Download ${label} as ${filename}`}
        >
          Download
        </button>
      )}
      <span
        role="status"
        aria-live="polite"
        className={
          copyStatus === "error"
            ? styles.copyFeedbackError
            : styles.copyFeedback
        }
      >
        {copyStatus === "copied"
          ? "Copied"
          : copyStatus === "error"
            ? "Could not copy to clipboard"
            : ""}
      </span>
    </div>
  );
}

function EstimateBadge({
  label = "estimate",
  basis,
}: {
  label?: string;
  basis?: string;
}) {
  return (
    <span
      className={styles.chipEstimate}
      title={basis}
      aria-label={basis ? `${label}: ${basis}` : label}
    >
      {label}
    </span>
  );
}

function StepsList({
  steps,
  heading = "Steps in IBM Bob",
}: {
  steps?: readonly string[];
  heading?: string;
}) {
  if (!steps || steps.length === 0) return null;
  return (
    <div className={styles.stepsSection}>
      <strong className={styles.sectionHeading}>{heading}</strong>
      <ol className={styles.stepsList}>
        {steps.map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Single unified evidence & traceability section per prescription card.
 * Replaces the previous duplicate EvidenceList + FindingIds + inline blocks.
 */
function OriginFindings({
  findings,
  onNavigateToFinding,
}: {
  findings: readonly Finding[];
  onNavigateToFinding?: (findingId: string) => void;
}) {
  if (findings.length === 0) return null;

  return (
    <section className={styles.originSection} aria-label="Evidence">
      <strong className={styles.sectionHeading}>Origin finding</strong>
      <ul className={styles.originList}>
        {findings.map((finding) => {
          const sensitive = isSensitiveEvidence(finding.evidence);
          const turns = finding.evidence.turnIndices;
          const hitCount =
            typeof finding.metric.hitCount === "number"
              ? finding.metric.hitCount
              : null;
          const binaries = Array.isArray(finding.metric.binaries)
            ? (finding.metric.binaries as string[])
            : [];
          const safeField =
            !sensitive && finding.evidence.fieldPath
              ? finding.evidence.fieldPath
              : !sensitive && finding.evidence.breakdownField
                ? String(finding.evidence.breakdownField)
                : null;
          const commands = finding.evidence.externalCommands ?? [];

          return (
            <li key={finding.id} className={styles.originItem}>
              <div className={styles.originRow}>
                <span className={styles.originMeta}>
                  <strong>{findingKindLabel(finding.kind)}</strong>
                  <span>· {finding.confidence} confidence</span>
                  {hitCount !== null && (
                    <span>
                      · {hitCount} matching command{hitCount !== 1 ? "s" : ""}
                    </span>
                  )}
                  {binaries.length > 0 && (
                    <span>· binaries: {binaries.join(", ")}</span>
                  )}
                  {turns && turns.length > 0 && (
                    <span>· turns {turns.join(", ")}</span>
                  )}
                  {safeField && <span>· {safeField}</span>}
                </span>

                {onNavigateToFinding && (
                  <button
                    type="button"
                    className={styles.backLink}
                    onClick={() => onNavigateToFinding(finding.id)}
                    aria-label={`View finding: ${findingKindLabel(finding.kind)}`}
                  >
                    ← View finding
                  </button>
                )}
              </div>

              {sensitive && commands.length > 0 && (
                <InlineSensitiveReveal
                  renderRevealed={() => (
                    <ul className={styles.commandList}>
                      {commands.map((command, index) => (
                        <li key={`${finding.id}-command-${index}`}>
                          <code>{command}</code>
                        </li>
                      ))}
                    </ul>
                  )}
                />
              )}

              {sensitive && commands.length === 0 && (
                <span className={styles.basisNote}>[REDACTED]</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Tab — AGENTS.md (single file per session)
// ---------------------------------------------------------------------------

function AgentsMdTab({
  prescriptions,
  findings,
  existingAgentsMd,
  focusedPrescriptionId,
  onNavigateToFinding,
  cardRefs,
}: {
  prescriptions: readonly (Prescription & { content: string })[];
  findings: readonly Finding[];
  existingAgentsMd: string | null;
  focusedPrescriptionId: string | null;
  onNavigateToFinding?: (findingId: string) => void;
  cardRefs: React.MutableRefObject<Map<string, HTMLElement | null>>;
}) {
  return (
    <div>
      {prescriptions.map((p) => {
        const diff = diffLines(existingAgentsMd, p.content);
        const isNewFile = existingAgentsMd === null;
        const focused = focusedPrescriptionId === p.id;

        return (
          <article
            key={p.id}
            ref={(el) => {
              cardRefs.current.set(p.id, el);
            }}
            data-prescription-id={p.id}
            data-focused={focused ? "true" : undefined}
            className={`${styles.panel} ${focused ? styles.panelFocused : ""}`}
          >
            <div className={styles.panelHeader}>
              <div className={styles.panelHeaderLeft}>
                <strong className={styles.panelTitle}>AGENTS.md</strong>
                {isNewFile && <span className={styles.chipGood}>new file</span>}
              </div>
              {(p.estimatedTokenSaving !== undefined ||
                p.isEstimate === true ||
                p.estimationBasis !== undefined) && (
                <span className={styles.metricPill}>
                  {p.estimatedTokenSaving !== undefined &&
                    `~${formatTokens(p.estimatedTokenSaving)} `}
                  <EstimateBadge
                    label={p.isEstimate === false ? "measured" : "estimate"}
                    basis={p.estimationBasis}
                  />
                </span>
              )}
            </div>

            {p.rationale && <p className={styles.bodyText}>{p.rationale}</p>}

            <div className={styles.codeBlock} aria-label="AGENTS.md diff">
              {diff.map((line, idx) => (
                <div
                  key={idx}
                  className={
                    line.kind === "added"
                      ? styles.diffAdded
                      : line.kind === "removed"
                        ? styles.diffRemoved
                        : styles.diffContext
                  }
                >
                  {line.kind === "added"
                    ? "+ "
                    : line.kind === "removed"
                      ? "- "
                      : "  "}
                  {line.text}
                </div>
              ))}
            </div>

            <ActionBar text={p.content} filename="AGENTS.md" label="AGENTS.md" />
            <OriginFindings
              findings={relatedFindings(p, findings)}
              onNavigateToFinding={onNavigateToFinding}
            />
          </article>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab — Tools (custom-mode YAML + Bob tool groups with tool purposes)
// ---------------------------------------------------------------------------

interface ToolGroupCard {
  group: string;
  tools: PrescribedToolSummary[];
  prescription: Prescription;
}

function extractToolGroup(p: Prescription): ToolGroupCard | null {
  if (Array.isArray(p.tools) && p.tools.length > 0) {
    return {
      group: p.tools[0].group,
      tools: p.tools,
      prescription: p,
    };
  }
  if (!p.content) return null;

  const lines = p.content.split("\n");
  const groupLine = lines.find((l) => l.startsWith("Group: "));
  const group = groupLine ? groupLine.slice("Group: ".length).trim() : "other";
  const tools: PrescribedToolSummary[] = lines
    .filter((l) => l.startsWith("- "))
    .map((l) => {
      const entry = l.slice(2).trim();
      const sep = entry.indexOf(": ");
      if (sep !== -1) {
        return {
          name: entry.slice(0, sep).trim(),
          group,
          purpose: entry.slice(sep + 2).trim(),
        };
      }
      return { name: entry, group, purpose: null };
    });

  return tools.length > 0 ? { group, tools, prescription: p } : null;
}

function ToolsTab({
  customModes,
  disableToolGroups,
  findings,
  focusedPrescriptionId,
  onNavigateToFinding,
  cardRefs,
}: {
  customModes: readonly Prescription[];
  disableToolGroups: readonly ToolGroupCard[];
  findings: readonly Finding[];
  focusedPrescriptionId: string | null;
  onNavigateToFinding?: (findingId: string) => void;
  cardRefs: React.MutableRefObject<Map<string, HTMLElement | null>>;
}) {
  return (
    <div>
      {customModes.map((p) => {
        const focused = focusedPrescriptionId === p.id;
        return (
          <article
            key={p.id}
            ref={(el) => {
              cardRefs.current.set(p.id, el);
            }}
            data-prescription-id={p.id}
            data-focused={focused ? "true" : undefined}
            className={`${styles.panel} ${focused ? styles.panelFocused : ""}`}
          >
            <div className={styles.panelHeader}>
              <div className={styles.panelHeaderLeft}>
                <strong className={styles.panelTitle}>
                  {p.targetFile ?? ".bob/custom_modes.yaml"}
                </strong>
                <span className={styles.chipGood}>custom mode</span>
              </div>
              {(p.estimatedTokenSaving !== undefined ||
                p.isEstimate === true ||
                p.estimationBasis !== undefined) && (
                <span className={styles.metricPill}>
                  {p.estimatedTokenSaving !== undefined &&
                    `~${formatTokens(p.estimatedTokenSaving)} `}
                  <EstimateBadge
                    label={p.isEstimate === false ? "measured" : "estimate"}
                    basis={p.estimationBasis}
                  />
                </span>
              )}
            </div>

            {p.rationale && <p className={styles.bodyText}>{p.rationale}</p>}
            {p.estimationBasis && (
              <p className={styles.basisNote}>{p.estimationBasis}</p>
            )}

            {p.groups && p.groups.length > 0 && (
              <div>
                <strong className={styles.sectionHeading}>
                  Enabled Bob tool groups
                </strong>
                <ul className={styles.groupChips} aria-label="Enabled Bob tool groups">
                  {p.groups.map((group) => (
                    <li key={group} className={styles.groupChip}>
                      {group}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {p.content && (
              <>
                <pre
                  className={styles.codeBlock}
                  aria-label="custom_modes.yaml"
                >
                  <code>{p.content}</code>
                </pre>
                <ActionBar
                  text={p.content}
                  filename="custom_modes.yaml"
                  label="custom_modes.yaml"
                />
              </>
            )}

            <StepsList steps={p.steps} />
            <OriginFindings
              findings={relatedFindings(p, findings)}
              onNavigateToFinding={onNavigateToFinding}
            />
          </article>
        );
      })}

      {disableToolGroups.map((g) => {
        const saving = g.prescription.estimatedTokenSaving;
        const focused = focusedPrescriptionId === g.prescription.id;

        return (
          <article
            key={g.prescription.id}
            ref={(el) => {
              cardRefs.current.set(g.prescription.id, el);
            }}
            data-prescription-id={g.prescription.id}
            data-focused={focused ? "true" : undefined}
            className={`${styles.panel} ${focused ? styles.panelFocused : ""}`}
          >
            <div className={styles.panelHeader}>
              <div className={styles.panelHeaderLeft}>
                <strong className={styles.panelTitle}>
                  Bob group: {g.group}
                </strong>
                <span className={styles.chipNeutral}>
                  {g.tools.length} tool{g.tools.length !== 1 ? "s" : ""}
                </span>
              </div>
              {(saving !== undefined ||
                g.prescription.isEstimate === true ||
                g.prescription.estimationBasis !== undefined) && (
                <span className={styles.metricPill}>
                  {saving !== undefined && `~${formatTokens(saving)} `}
                  <EstimateBadge
                    label={
                      g.prescription.isEstimate === false
                        ? "measured"
                        : "estimate"
                    }
                    basis={g.prescription.estimationBasis}
                  />
                </span>
              )}
            </div>

            {g.prescription.rationale && (
              <p className={styles.bodyText}>{g.prescription.rationale}</p>
            )}

            <ul className={styles.toolList}>
              {g.tools.map((t) => (
                <li key={t.name} className={styles.toolItem}>
                  <code className={styles.toolName}>{t.name}</code>
                  {t.purpose && (
                    <span className={styles.toolPurpose}> — {t.purpose}</span>
                  )}
                </li>
              ))}
            </ul>

            <StepsList steps={g.prescription.steps} />
            <OriginFindings
              findings={relatedFindings(g.prescription, findings)}
              onNavigateToFinding={onNavigateToFinding}
            />
          </article>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab — Skills (single measured/estimated label + steps in Bob)
// ---------------------------------------------------------------------------

function SkillsTab({
  prescriptions,
  findings,
  focusedPrescriptionId,
  onNavigateToFinding,
  cardRefs,
}: {
  prescriptions: readonly Prescription[];
  findings: readonly Finding[];
  focusedPrescriptionId: string | null;
  onNavigateToFinding?: (findingId: string) => void;
  cardRefs: React.MutableRefObject<Map<string, HTMLElement | null>>;
}) {
  return (
    <div>
      {prescriptions.map((p) => {
        const focused = focusedPrescriptionId === p.id;
        const isMeasured = p.isEstimate === false;

        return (
          <article
            key={p.id}
            ref={(el) => {
              cardRefs.current.set(p.id, el);
            }}
            data-prescription-id={p.id}
            data-focused={focused ? "true" : undefined}
            className={`${styles.panel} ${focused ? styles.panelFocused : ""}`}
          >
            <div className={styles.panelHeader}>
              <strong className={styles.panelTitle}>
                {findingKindLabel("skill-overhead")}
              </strong>
              {(p.estimatedTokenSaving !== undefined ||
                p.isEstimate === true ||
                p.estimationBasis !== undefined) && (
                <span className={styles.metricPill}>
                  {p.estimatedTokenSaving !== undefined &&
                    (isMeasured
                      ? `${formatTokens(p.estimatedTokenSaving)} `
                      : `~${formatTokens(p.estimatedTokenSaving)} `)}
                  <EstimateBadge
                    label={isMeasured ? "measured" : "estimate"}
                    basis={p.estimationBasis}
                  />
                </span>
              )}
            </div>

            {p.rationale && <p className={styles.bodyText}>{p.rationale}</p>}
            {p.estimationBasis && (
              <p className={styles.basisNote}>{p.estimationBasis}</p>
            )}

            {p.steps && p.steps.length > 0 ? (
              <StepsList steps={p.steps} />
            ) : (
              p.content && <p className={styles.bodyText}>{p.content}</p>
            )}

            <OriginFindings
              findings={relatedFindings(p, findings)}
              onNavigateToFinding={onNavigateToFinding}
            />
          </article>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab — MCPs (docsUrl when non-null, installSnippet + Copy, estimatedTokenCost)
// ---------------------------------------------------------------------------

function mcpServerTitle(
  prescription: Prescription,
  sourceFindings: readonly Finding[]
): string {
  const fromMetric = sourceFindings[0]?.metric.serverLabel;
  if (typeof fromMetric === "string" && fromMetric.length > 0) {
    return fromMetric;
  }
  if (prescription.content) {
    const firstLine = prescription.content.split("\n")[0]?.trim();
    if (firstLine) return firstLine;
  }
  return "MCP Server";
}

function McpsTab({
  prescriptions,
  findings,
  focusedPrescriptionId,
  onNavigateToFinding,
  cardRefs,
}: {
  prescriptions: readonly Prescription[];
  findings: readonly Finding[];
  focusedPrescriptionId: string | null;
  onNavigateToFinding?: (findingId: string) => void;
  cardRefs: React.MutableRefObject<Map<string, HTMLElement | null>>;
}) {
  return (
    <div>
      {prescriptions.map((p) => {
        const sourceFindings = relatedFindings(p, findings);
        const title = mcpServerTitle(p, sourceFindings);
        const replaces = sourceFindings[0]?.evidence.replaces;
        const focused = focusedPrescriptionId === p.id;

        return (
          <article
            key={p.id}
            ref={(el) => {
              cardRefs.current.set(p.id, el);
            }}
            data-prescription-id={p.id}
            data-focused={focused ? "true" : undefined}
            className={`${styles.panel} ${focused ? styles.panelFocused : ""}`}
          >
            <div className={styles.panelHeader}>
              <div className={styles.panelHeaderLeft}>
                <strong className={styles.panelTitle}>{title}</strong>
                <span className={styles.chipNeutral}>
                  {sourceFindings[0]?.confidence ?? "unknown"} confidence
                </span>
              </div>
              {(p.estimatedTokenCost !== undefined ||
                p.isEstimate === true ||
                p.estimationBasis !== undefined) && (
                <span className={styles.metricPill}>
                  {p.estimatedTokenCost !== undefined &&
                    `+~${formatInteger(p.estimatedTokenCost)} tokens/turn `}
                  <EstimateBadge
                    label={p.isEstimate === false ? "measured" : "estimate"}
                    basis={p.estimationBasis}
                  />
                </span>
              )}
            </div>

            {isSafeHttpUrl(p.docsUrl) && (
              <div>
                <a
                  href={p.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.docsLink}
                >
                  Documentation ↗
                </a>
              </div>
            )}

            {replaces && (
              <p className={styles.bodyText}>
                <strong>Replaces:</strong> {replaces}
              </p>
            )}

            {p.rationale && <p className={styles.bodyText}>{p.rationale}</p>}
            {p.estimationBasis && (
              <p className={styles.basisNote}>{p.estimationBasis}</p>
            )}

            {p.installSnippet && (
              <div>
                <strong className={styles.sectionHeading}>
                  {p.targetFile ?? ".bob/mcp.json"}
                </strong>
                <pre
                  className={styles.codeBlock}
                  aria-label={`${title} MCP snippet`}
                >
                  <code>{p.installSnippet}</code>
                </pre>
                <ActionBar
                  text={p.installSnippet}
                  label={`${title} MCP snippet`}
                  showDownload={false}
                />
              </div>
            )}

            <StepsList steps={p.steps} />
            <OriginFindings
              findings={sourceFindings}
              onNavigateToFinding={onNavigateToFinding}
            />
          </article>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PrescriptionScreen
// ---------------------------------------------------------------------------

export function PrescriptionScreen({
  prescriptions,
  findings,
  existingAgentsMd,
  onNavigateToFinding,
  focusedPrescriptionId = null,
}: PrescriptionScreenProps): React.JSX.Element {
  const tabRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});
  const cardRefs = useRef<Map<string, HTMLElement | null>>(new Map());

  const {
    agentsMdFiles,
    customModes,
    disableToolGroups,
    skillPrescriptions,
    mcpPrescriptions,
    visibleTabs,
  } = useMemo(() => {
    const traceable = prescriptions.filter((p) =>
      hasTraceableOrigin(p, findings)
    );

    const agentsFiles = traceable.filter(
      (p): p is Prescription & { content: string } =>
        p.kind === "agents-md-file" && typeof p.content === "string"
    );
    const modes = traceable.filter((p) => p.kind === "custom-mode");
    const toolGroups = traceable
      .filter((p) => p.kind === "disable-tool")
      .map(extractToolGroup)
      .filter((g): g is ToolGroupCard => g !== null);
    const skills = traceable.filter((p) => p.kind === "disable-skill");
    const mcps = traceable.filter((p) => p.kind === "enable-mcp");

    // Avoid double-counting custom-mode saving and disable-tool group sum.
    const toolsSaving = Math.max(
      sumSavings(modes),
      sumSavings(toolGroups.map((g) => g.prescription))
    );

    const allTabs: TabMeta[] = [
      {
        id: "tools",
        label: "Tools",
        count: modes.length + toolGroups.length,
        estimatedSaving: toolsSaving,
        prescriptionIds: [
          ...modes.map((p) => p.id),
          ...toolGroups.map((g) => g.prescription.id),
        ],
      },
      {
        id: "skills",
        label: "Skills",
        count: skills.length,
        estimatedSaving: sumSavings(skills),
        prescriptionIds: skills.map((p) => p.id),
      },
      {
        id: "agents-md",
        label: "AGENTS.md",
        count: agentsFiles.length,
        estimatedSaving: sumSavings(agentsFiles),
        prescriptionIds: agentsFiles.map((p) => p.id),
      },
      {
        id: "mcps",
        label: "MCPs",
        count: mcps.length,
        estimatedSaving: 0,
        prescriptionIds: mcps.map((p) => p.id),
      },
    ];

    const nonEmpty = allTabs
      .filter((tab) => tab.count > 0)
      .sort((a, b) => {
        const diff = b.estimatedSaving - a.estimatedSaving;
        if (diff !== 0) return diff;
        return (
          CANONICAL_TAB_ORDER.indexOf(a.id) - CANONICAL_TAB_ORDER.indexOf(b.id)
        );
      });

    return {
      agentsMdFiles: agentsFiles,
      customModes: modes,
      disableToolGroups: toolGroups,
      skillPrescriptions: skills,
      mcpPrescriptions: mcps,
      visibleTabs: nonEmpty,
    };
  }, [prescriptions, findings]);

  const initialTab = useMemo<TabId | null>(() => {
    if (focusedPrescriptionId) {
      const targetTab = visibleTabs.find((tab) =>
        tab.prescriptionIds.includes(focusedPrescriptionId)
      );
      if (targetTab) return targetTab.id;
    }
    return visibleTabs[0]?.id ?? null;
  }, [focusedPrescriptionId, visibleTabs]);

  const [selectedTab, setSelectedTab] = useState<TabId | null>(initialTab);

  // Keep selectedTab valid when visibleTabs or focusedPrescriptionId changes.
  useEffect(() => {
    if (focusedPrescriptionId) {
      const targetTab = visibleTabs.find((tab) =>
        tab.prescriptionIds.includes(focusedPrescriptionId)
      );
      if (targetTab) {
        setSelectedTab(targetTab.id);
        const el = cardRefs.current.get(focusedPrescriptionId);
        el?.scrollIntoView?.({ behavior: "smooth", block: "center" });
        return;
      }
    }
    if (
      selectedTab === null ||
      !visibleTabs.some((tab) => tab.id === selectedTab)
    ) {
      setSelectedTab(visibleTabs[0]?.id ?? null);
    }
  }, [focusedPrescriptionId, visibleTabs, selectedTab]);

  const activeTab: TabId | null =
    selectedTab !== null && visibleTabs.some((tab) => tab.id === selectedTab)
      ? selectedTab
      : (visibleTabs[0]?.id ?? null);

  const activateTab = useCallback((id: TabId) => {
    setSelectedTab(id);
    tabRefs.current[id]?.focus();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent, currentId: TabId) {
    const idx = visibleTabs.findIndex((t) => t.id === currentId);
    if (idx === -1 || visibleTabs.length === 0) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      activateTab(visibleTabs[(idx + 1) % visibleTabs.length].id);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      activateTab(
        visibleTabs[(idx + visibleTabs.length - 1) % visibleTabs.length].id
      );
    } else if (e.key === "Home") {
      e.preventDefault();
      activateTab(visibleTabs[0].id);
    } else if (e.key === "End") {
      e.preventDefault();
      activateTab(visibleTabs[visibleTabs.length - 1].id);
    }
  }

  return (
    <div className={styles.screen} data-testid="fix-screen">
      <header className={styles.header}>
        <div className={styles.eyebrow}>Fix</div>
        <h1 className={styles.title}>
          Corrected configuration, ready to copy.
        </h1>
        <p className={styles.lead}>
          Every item explains what to change, why it helps, and links back to
          the finding that produced it.
        </p>
      </header>

      {visibleTabs.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No configuration recommendations for this session.</p>
        </div>
      ) : (
        <>
          <div
            role="tablist"
            aria-label="Prescription categories"
            className={styles.tablist}
          >
            {visibleTabs.map((tab) => {
              const selected = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  id={`tab-${tab.id}`}
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`panel-${tab.id}`}
                  tabIndex={selected ? 0 : -1}
                  ref={(el) => {
                    tabRefs.current[tab.id] = el;
                  }}
                  onClick={() => activateTab(tab.id)}
                  onKeyDown={(e) => handleKeyDown(e, tab.id)}
                  type="button"
                  className={selected ? styles.tabActive : styles.tab}
                >
                  {tab.label} ({tab.count})
                </button>
              );
            })}
          </div>

          <p className={styles.tabHint}>
            Use Left and Right Arrow keys to navigate the tabs.
          </p>

          <div className={styles.panels}>
            {visibleTabs.map((tab) => (
              <div
                key={tab.id}
                id={`panel-${tab.id}`}
                role="tabpanel"
                aria-labelledby={`tab-${tab.id}`}
                hidden={activeTab !== tab.id}
              >
                {tab.id === "agents-md" && (
                  <AgentsMdTab
                    prescriptions={agentsMdFiles}
                    findings={findings}
                    existingAgentsMd={existingAgentsMd}
                    focusedPrescriptionId={focusedPrescriptionId}
                    onNavigateToFinding={onNavigateToFinding}
                    cardRefs={cardRefs}
                  />
                )}
                {tab.id === "tools" && (
                  <ToolsTab
                    customModes={customModes}
                    disableToolGroups={disableToolGroups}
                    findings={findings}
                    focusedPrescriptionId={focusedPrescriptionId}
                    onNavigateToFinding={onNavigateToFinding}
                    cardRefs={cardRefs}
                  />
                )}
                {tab.id === "skills" && (
                  <SkillsTab
                    prescriptions={skillPrescriptions}
                    findings={findings}
                    focusedPrescriptionId={focusedPrescriptionId}
                    onNavigateToFinding={onNavigateToFinding}
                    cardRefs={cardRefs}
                  />
                )}
                {tab.id === "mcps" && (
                  <McpsTab
                    prescriptions={mcpPrescriptions}
                    findings={findings}
                    focusedPrescriptionId={focusedPrescriptionId}
                    onNavigateToFinding={onNavigateToFinding}
                    cardRefs={cardRefs}
                  />
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
