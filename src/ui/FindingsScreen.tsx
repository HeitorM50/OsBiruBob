/**
 * FindingsScreen — presentation-only rendering for detector output.
 *
 * The component never classifies, recalculates, or changes findings. Evidence
 * is rendered as untrusted text and sensitive excerpts stay scoped and hidden
 * until the user confirms a reveal for that finding.
 */

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import type {
  ConfidenceLevel,
  Finding,
  FindingEvidence,
  FindingKind,
  Prescription,
} from "../domain/types";
import {
  CORE_FINDING_KINDS,
  findTargetPrescription,
  findingGroupLabel,
  findingKindLabel,
} from "./finding-labels";
import { formatEstimatedCost, formatInteger, formatTokens } from "./format";
import {
  SensitiveRevealControl,
  containsAbsolutePath,
  isSensitiveEvidence,
  plainText,
} from "./SensitiveReveal";
import styles from "./FindingsScreen.module.css";

const ZERO_DESCRIPTIONS: Readonly<Record<string, string>> = {
  "redundant-read":
    "Every path appears exactly once across the tool calls. The agent did not re-read any file.",
  "retry-after-error":
    "No isError: true was reported. There was no retry after a failure.",
  "human-intervention":
    "No human intervention after the initial prompt was reported.",
};

const LEVEL_ORDER: Readonly<Record<ConfidenceLevel, number>> = {
  high: 0,
  medium: 1,
  low: 2,
};

const CONFIDENCE_LABELS: Readonly<Record<ConfidenceLevel, string>> = {
  high: "HIGH ●●●",
  medium: "MEDIUM ●●○",
  low: "LOW ●○○",
};

type SeverityLevel = ConfidenceLevel;
type FindingWithOptionalSeverity = Finding & { severity?: unknown };

interface FindingGroup {
  kind: FindingKind;
  findings: Finding[];
  bestSeverity: SeverityLevel | null;
}

function suppliedSeverity(finding: Finding): SeverityLevel | null {
  const value = (finding as FindingWithOptionalSeverity).severity;
  return value === "high" || value === "medium" || value === "low" ? value : null;
}

function kindOrder(kind: FindingKind): number {
  const index = CORE_FINDING_KINDS.indexOf(kind);
  return index === -1 ? CORE_FINDING_KINDS.length : index;
}

function compareBySuppliedSeverity(a: Finding, b: Finding): number {
  const aSeverity = suppliedSeverity(a);
  const bSeverity = suppliedSeverity(b);

  if (aSeverity !== null && bSeverity !== null) {
    const severityDelta = LEVEL_ORDER[aSeverity] - LEVEL_ORDER[bSeverity];
    if (severityDelta !== 0) return severityDelta;
  } else if (aSeverity !== null) {
    return -1;
  } else if (bSeverity !== null) {
    return 1;
  }

  return a.id.localeCompare(b.id);
}

function groupFindings(findings: readonly Finding[]): FindingGroup[] {
  const byKind = new Map<FindingKind, Finding[]>();

  for (const finding of findings) {
    const group = byKind.get(finding.kind) ?? [];
    group.push(finding);
    byKind.set(finding.kind, group);
  }

  const groups = [...byKind.entries()].map(([kind, items]) => {
    const sorted = [...items].sort(compareBySuppliedSeverity);
    return {
      kind,
      findings: sorted,
      bestSeverity:
        sorted.map(suppliedSeverity).find((value) => value !== null) ?? null,
    };
  });

  return groups.sort((a, b) => {
    if (a.bestSeverity !== null && b.bestSeverity !== null) {
      const severityDelta =
        LEVEL_ORDER[a.bestSeverity] - LEVEL_ORDER[b.bestSeverity];
      if (severityDelta !== 0) return severityDelta;
    } else if (a.bestSeverity !== null) {
      return -1;
    } else if (b.bestSeverity !== null) {
      return 1;
    }

    const kindDelta = kindOrder(a.kind) - kindOrder(b.kind);
    return kindDelta !== 0
      ? kindDelta
      : String(a.kind).localeCompare(String(b.kind));
  });
}

function isFindingTokenImpactMeasured(finding: Finding): boolean {
  if (finding.tokenImpactIsEstimate === false) return true;
  if (finding.tokenImpactIsEstimate === true) return false;
  if (finding.metric.tokenImpactIsEstimate === true) return false;
  const metricImpact = finding.metric.tokenImpact;
  if (
    typeof metricImpact === "object" &&
    metricImpact !== null &&
    (metricImpact as Record<string, unknown>).estimated === false
  ) {
    return true;
  }
  return false;
}

function sourceExcerpt(evidence: FindingEvidence, fallback?: string): string {
  if (evidence.breakdownField !== undefined) {
    return `"${evidence.breakdownField}": ${evidence.breakdownValue ?? "?"}`;
  }
  if (evidence.unusedTools !== undefined && evidence.unusedTools.length > 0) {
    return evidence.unusedTools.join("\n");
  }
  if (
    evidence.externalCommands !== undefined &&
    evidence.externalCommands.length > 0
  ) {
    return evidence.externalCommands.map((command) => `$ ${command}`).join("\n");
  }
  if (evidence.rawValue !== undefined) return plainText(evidence.rawValue);
  if (fallback !== undefined && fallback.length > 0) return fallback;
  return "No source excerpt supplied by detector.";
}

function levelClass(level: SeverityLevel): string {
  if (level === "high") return styles.badgeHigh;
  if (level === "medium") return styles.badgeMedium;
  return styles.badgeLow;
}

interface EvidenceBlockProps {
  finding: Finding;
  revealed: boolean;
  pending: boolean;
  onRequestReveal: () => void;
  onConfirmReveal: () => void;
  onCancelReveal: () => void;
  onHide: () => void;
}

function EvidenceBlock({
  finding,
  revealed,
  pending,
  onRequestReveal,
  onConfirmReveal,
  onCancelReveal,
  onHide,
}: EvidenceBlockProps): React.JSX.Element {
  const { evidence } = finding;
  const sensitive = isSensitiveEvidence(evidence);
  const excerpt =
    sensitive && !revealed
      ? "[REDACTED]"
      : sourceExcerpt(evidence, finding.description);
  const fieldPath =
    sensitive && !revealed && containsAbsolutePath(evidence.fieldPath)
      ? "[REDACTED]"
      : evidence.fieldPath ?? "Not supplied by detector.";
  const basis = finding.tokenImpactEstimateBasis ?? finding.estimationBasis;

  return (
    <div className={styles.evidenceBlock}>
      <dl className={styles.evidenceMetaList}>
        <div className={styles.evidenceMeta}>
          <dt className={styles.evidenceMetaLabel} title="turnIndices">
            Assistant turns
          </dt>
          <dd className={styles.evidenceMetaValue}>
            {evidence.turnIndices?.length
              ? `[${evidence.turnIndices.join(", ")}]`
              : "Not supplied by detector."}
          </dd>
        </div>
        <div className={styles.evidenceMeta}>
          <dt className={styles.evidenceMetaLabel} title="fieldPath">
            Export field
          </dt>
          <dd className={styles.evidenceFieldPath}>{fieldPath}</dd>
        </div>
      </dl>

      {basis && <p className={styles.evidenceRationale}>{basis}</p>}

      <div>
        <p className={styles.excerptLabel}>Source excerpt</p>
        <pre className={styles.evidenceExcerpt} tabIndex={0}>
          <code>{excerpt}</code>
        </pre>
      </div>

      {evidence.rationale && (
        <p className={styles.evidenceRationale}>{evidence.rationale}</p>
      )}

      {sensitive && (
        <SensitiveRevealControl
          revealed={revealed}
          pending={pending}
          onRequestReveal={onRequestReveal}
          onConfirmReveal={onConfirmReveal}
          onCancelReveal={onCancelReveal}
          onHide={onHide}
        />
      )}
    </div>
  );
}

interface FindingRowProps {
  finding: Finding;
  expanded: boolean;
  focused: boolean;
  revealed: boolean;
  pending: boolean;
  targetPrescriptionId: string | null;
  onNavigateToPrescription?: (prescriptionId: string) => void;
  onToggle: () => void;
  onRequestReveal: () => void;
  onConfirmReveal: () => void;
  onCancelReveal: () => void;
  onHide: () => void;
  rowRef?: (el: HTMLElement | null) => void;
}

function FindingRow({
  finding,
  expanded,
  focused,
  revealed,
  pending,
  targetPrescriptionId,
  onNavigateToPrescription,
  onToggle,
  onRequestReveal,
  onConfirmReveal,
  onCancelReveal,
  onHide,
  rowRef,
}: FindingRowProps): React.JSX.Element {
  const detailId = useId();
  const severity = suppliedSeverity(finding);
  const sensitive = isSensitiveEvidence(finding.evidence);
  const basis = finding.tokenImpactEstimateBasis ?? finding.estimationBasis;
  const hasImpact =
    finding.tokenImpact !== undefined || finding.costImpact !== undefined;
  const measured =
    hasImpact &&
    finding.costImpact === undefined &&
    isFindingTokenImpactMeasured(finding);
  const isEstimate =
    !measured &&
    (hasImpact ||
      finding.tokenImpactIsEstimate === true ||
      basis !== undefined);

  return (
    <article
      ref={rowRef}
      className={`${styles.findingRow} ${focused ? styles.findingRowFocused : ""}`}
      data-finding-id={finding.id}
      data-focused={focused ? "true" : undefined}
    >
      <div className={styles.findingHeaderBar}>
        <button
          type="button"
          className={styles.findingHeader}
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={detailId}
        >
          <span className={styles.caret} aria-hidden="true">
            {expanded ? "▼" : "▶"}
          </span>
          <span className={styles.findingHeaderContent}>
            <span className={styles.findingTitle}>
              {findingKindLabel(finding.kind)}
            </span>
            {finding.description && (
              <span className={styles.findingDescription}>
                {sensitive && !revealed && !finding.evidence.descriptionSafe
                  ? "[REDACTED]"
                  : finding.description}
              </span>
            )}
            {hasImpact && (
              <span className={styles.estimateHint}>
                {measured ? (
                  <>Measured: {formatTokens(finding.tokenImpact!)}</>
                ) : (
                  <>
                    Hypothesis/estimate — not a measured value:
                    {finding.tokenImpact !== undefined &&
                      ` ${formatInteger(finding.tokenImpact)} estimated tokens`}
                    {finding.costImpact !== undefined &&
                      ` · ${formatEstimatedCost(finding.costImpact)} estimated cost`}
                  </>
                )}
              </span>
            )}
          </span>
          <span className={styles.badges}>
            {(hasImpact || isEstimate) && (
              <span
                className={styles.badgeEstimate}
                title={basis}
                aria-label={
                  measured
                    ? `Measured impact: ${formatTokens(finding.tokenImpact!)}`
                    : basis
                      ? `Estimate: ${basis}`
                      : "Estimate"
                }
              >
                {measured
                  ? `MEASURED · ${formatTokens(finding.tokenImpact!)}`
                  : finding.tokenImpact !== undefined
                    ? `ESTIMATE · ~${formatTokens(finding.tokenImpact)}`
                    : "ESTIMATE"}
              </span>
            )}
            <span
              className={`${styles.badge} ${levelClass(finding.confidence)}`}
              aria-label={`Confidence: ${finding.confidence}`}
            >
              CONFIDENCE {CONFIDENCE_LABELS[finding.confidence]}
            </span>
            {severity && (
              <span
                className={`${styles.badge} ${levelClass(severity)}`}
                aria-label={`Severity: ${severity}`}
              >
                SEVERITY {severity.toUpperCase()}
              </span>
            )}
          </span>
        </button>

        {targetPrescriptionId && onNavigateToPrescription && (
          <div className={styles.findingActions}>
            <button
              type="button"
              className={styles.seeFixButton}
              onClick={() => onNavigateToPrescription(targetPrescriptionId)}
            >
              See fix →
            </button>
          </div>
        )}
      </div>

      {expanded && (
        <div id={detailId} className={styles.findingDetail}>
          <EvidenceBlock
            finding={finding}
            revealed={revealed}
            pending={pending}
            onRequestReveal={onRequestReveal}
            onConfirmReveal={onConfirmReveal}
            onCancelReveal={onCancelReveal}
            onHide={onHide}
          />
        </div>
      )}
    </article>
  );
}

function ZeroDetectorCard({ kind }: { kind: FindingKind }): React.JSX.Element {
  return (
    <article className={styles.zeroCard} data-finding-kind={kind}>
      <div className={styles.zeroCardHeader}>
        <span className={styles.zeroCount}>0</span>
        <span className={styles.zeroHeadline}>{findingKindLabel(kind)}</span>
      </div>
      <p className={styles.zeroEmpty}>No findings of this type.</p>
      <p className={styles.zeroDetail}>
        {ZERO_DESCRIPTIONS[kind] ?? "The detector ran and returned zero findings."}
      </p>
      <p className={styles.zeroPositive}>✓ Positive outcome</p>
    </article>
  );
}

export interface FindingsScreenProps {
  findings: readonly Finding[];
  /** Prescriptions used to render "See fix →" links on each finding. */
  prescriptions?: readonly Prescription[];
  /** Called when the user clicks "See fix →" on a finding. */
  onNavigateToPrescription?: (prescriptionId: string) => void;
  /** Optional finding ID to auto-expand and highlight (e.g. from Fix back-link). */
  focusedFindingId?: string | null;
  /** When true, renders as a <section> inside DiagnoseScreen without outer page chrome. */
  embedded?: boolean;
}

export function FindingsScreen({
  findings,
  prescriptions = [],
  onNavigateToPrescription,
  focusedFindingId = null,
  embedded = false,
}: FindingsScreenProps): React.JSX.Element {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() =>
    focusedFindingId ? new Set([focusedFindingId]) : new Set()
  );
  const [revealedIds, setRevealedIds] = useState<Set<string>>(() => new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const rowRefs = useRef<Map<string, HTMLElement | null>>(new Map());

  useEffect(() => {
    if (!focusedFindingId) return;
    setExpandedIds((current) => {
      if (current.has(focusedFindingId)) return current;
      const next = new Set(current);
      next.add(focusedFindingId);
      return next;
    });
    const el = rowRefs.current.get(focusedFindingId);
    el?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, [focusedFindingId]);

  const groups = useMemo(() => groupFindings(findings), [findings]);
  const representedKinds = useMemo(
    () => new Set(findings.map((finding) => finding.kind)),
    [findings]
  );
  const zeroKinds = CORE_FINDING_KINDS.filter(
    (kind) => !representedKinds.has(kind)
  );

  function updateSet(
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    id: string,
    present: boolean
  ): void {
    setter((current) => {
      const next = new Set(current);
      if (present) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleExpanded(id: string): void {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const content = (
    <>
      {embedded ? (
        <header className={styles.embeddedHeader}>
          <h2 className={styles.embeddedTitle}>
            {findings.length === 0
              ? "No findings."
              : `${findings.length} ${findings.length === 1 ? "finding" : "findings"}`}
          </h2>
        </header>
      ) : (
        <header className={styles.header}>
          <p className={styles.headerSub}>
            Findings · {CORE_FINDING_KINDS.length} detectors
          </p>
          <h1 className={styles.headerTitle}>
            {findings.length === 0
              ? "No findings."
              : `${findings.length} ${findings.length === 1 ? "finding" : "findings"}, each traceable to a field in the export.`}
          </h1>
          <p className={styles.headerDesc}>
            This screen only presents the Findings it receives. Missing evidence
            is marked unavailable; no detector is re-run in the interface.
          </p>
        </header>
      )}

      <div className={styles.toolbar}>
        <span className={styles.toolbarStat}>
          {findings.length} fired · {zeroKinds.length} at zero
        </span>
        <span className={styles.toolbarDivider} aria-hidden="true" />
        <span className={styles.toolbarNote}>
          Sensitive content is redacted by default and revealed one item at a
          time.
        </span>
      </div>

      {groups.length > 0 && (
        <nav className={styles.typeNav} aria-label="Finding types">
          {groups.map((group) => (
            <a key={group.kind} href={`#finding-group-${group.kind}`}>
              {findingKindLabel(group.kind)} ({group.findings.length})
            </a>
          ))}
          {zeroKinds.length > 0 && (
            <a href="#finding-zero-groups">Detectors at zero</a>
          )}
        </nav>
      )}

      {findings.length === 0 && (
        <section className={styles.emptyState} aria-label="Overall empty state">
          <p className={styles.emptyStateText}>No findings to display.</p>
          <p className={styles.emptyStateHint}>
            Zero results is valid information; the per-type states continue
            below.
          </p>
        </section>
      )}

      {groups.map((group) => (
        <section
          id={`finding-group-${group.kind}`}
          key={group.kind}
          className={styles.group}
          aria-labelledby={`finding-group-title-${group.kind}`}
        >
          <h2
            id={`finding-group-title-${group.kind}`}
            className={styles.groupHeader}
          >
            {findingGroupLabel(group.kind)}
          </h2>
          {group.findings.map((finding) => {
            const target = findTargetPrescription(finding, prescriptions);
            return (
              <FindingRow
                key={finding.id}
                finding={finding}
                expanded={expandedIds.has(finding.id)}
                focused={focusedFindingId === finding.id}
                revealed={revealedIds.has(finding.id)}
                pending={pendingIds.has(finding.id)}
                targetPrescriptionId={target?.id ?? null}
                onNavigateToPrescription={onNavigateToPrescription}
                onToggle={() => toggleExpanded(finding.id)}
                onRequestReveal={() =>
                  updateSet(setPendingIds, finding.id, true)
                }
                onConfirmReveal={() => {
                  updateSet(setPendingIds, finding.id, false);
                  updateSet(setRevealedIds, finding.id, true);
                }}
                onCancelReveal={() =>
                  updateSet(setPendingIds, finding.id, false)
                }
                onHide={() => updateSet(setRevealedIds, finding.id, false)}
                rowRef={(el) => {
                  rowRefs.current.set(finding.id, el);
                }}
              />
            );
          })}
        </section>
      ))}

      {zeroKinds.length > 0 && (
        <section id="finding-zero-groups" aria-labelledby="zero-groups-title">
          <h2 id="zero-groups-title" className={styles.zeroSectionTitle}>
            Detectors that found nothing
          </h2>
          <div className={styles.zeroGrid}>
            {zeroKinds.map((kind) => (
              <ZeroDetectorCard key={kind} kind={kind} />
            ))}
          </div>
        </section>
      )}
    </>
  );

  if (embedded) {
    return (
      <section className={styles.embeddedSection} aria-label="Findings">
        {content}
      </section>
    );
  }

  return <main className={styles.wrapper}>{content}</main>;
}
