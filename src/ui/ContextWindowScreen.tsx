/**
 * ContextWindowScreen — Hindsight
 *
 * Renders the context window summary (fixed overhead, conversation, reported
 * total & pressure) and stacked bar decomposition with legend extracted during
 * the Observe phase (ObserveReport → TaskReport → ContextSummary).
 *
 * Rules enforced here:
 *  - percentages always use fixedOverhead as denominator (never reportedTotal)
 *  - fixedOverhead, conversationTokens, reportedTotal are distinct and labelled
 *  - pressure shown only when maxContextWindow is explicitly non-null
 *  - all ten breakdown sources are always rendered (zero is not hidden)
 *  - no duplicate projectRules = 0 alert card (the Finding covers that)
 *  - no sensitive data is rendered (no message content, paths, titles)
 */

import React from "react";
import type { ContextSummary } from "../domain/types";
import styles from "./ContextWindowScreen.module.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContextWindowScreenProps {
  context: ContextSummary;
  /** When true, renders as a <section> inside DiagnoseScreen without outer page chrome. */
  embedded?: boolean;
}

// ---------------------------------------------------------------------------
// Bar segment definitions (visual order: largest first by prototype)
// ---------------------------------------------------------------------------

type BarPattern =
  | "solid-1"
  | "hatch-2"
  | "solid-3"
  | "hatch-4"
  | "solid-5"
  | "hatch-6"
  | "solid-7"
  | "solid-8"
  | "solid-acc"
  | "solid-muted";

interface SegmentDef {
  key: keyof ContextSummary["breakdown"];
  label: string;
  pattern: BarPattern;
}

const SEGMENT_DEFS: SegmentDef[] = [
  { key: "toolDefinitions",    label: "toolDefinitions",    pattern: "solid-1"  },
  { key: "toolSystemPrompts",  label: "toolSystemPrompts",  pattern: "hatch-2"  },
  { key: "skills",             label: "skills",             pattern: "solid-3"  },
  { key: "staticSections",     label: "staticSections",     pattern: "hatch-4"  },
  { key: "baseRules",          label: "baseRules",          pattern: "solid-5"  },
  { key: "customInstructions", label: "customInstructions", pattern: "hatch-6"  },
  { key: "environment",        label: "environment",        pattern: "solid-7"  },
  { key: "roleDefinition",     label: "roleDefinition",     pattern: "solid-8"  },
  { key: "projectRules",       label: "projectRules",       pattern: "solid-acc"},
  { key: "mcpToolDefinitions", label: "mcpToolDefinitions", pattern: "solid-muted"},
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtTokens(n: number): string {
  return n.toLocaleString("en-US");
}

function fmtPct(n: number): string {
  return (
    n.toLocaleString("en-US", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }) + "%"
  );
}

function sortedSegments(
  breakdown: ContextSummary["breakdown"],
  fixedOverhead: number
): Array<SegmentDef & { tokens: number | undefined; pct: number | undefined }> {
  return SEGMENT_DEFS.map((def) => {
    const raw = (breakdown as Record<string, number | undefined>)[def.key];
    const tokens =
      typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
    const pct =
      tokens === undefined
        ? undefined
        : fixedOverhead > 0
          ? (tokens / fixedOverhead) * 100
          : 0;
    return { ...def, tokens, pct };
  }).sort((a, b) => (b.tokens ?? -1) - (a.tokens ?? -1));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface AggregatesProps {
  fixedOverhead: number;
  conversationTokens: number;
  reportedTotal: number;
  pressure: number | null;
  maxContextWindow: number | null;
}

function AggregateRow({
  fixedOverhead,
  conversationTokens,
  reportedTotal,
  pressure,
  maxContextWindow,
}: AggregatesProps): React.JSX.Element {
  const pressureLabel =
    pressure !== null && maxContextWindow !== null
      ? `${fmtPct(pressure * 100)} of a ${Math.round(maxContextWindow / 1000)}k window`
      : "Pressure unavailable — maximum window not provided";

  return (
    <div className={styles.aggregates} data-testid="context-summary-row">
      <div className={styles.aggregateItem}>
        <div className={styles.aggregateLabel}>Fixed overhead</div>
        <div className={styles.aggregateValue} data-testid="fixed-overhead">
          {fmtTokens(fixedOverhead)}
        </div>
        <div className={styles.aggregateSub}>loaded before any work</div>
      </div>

      <div className={styles.aggregatePlus} aria-hidden="true">
        +
      </div>

      <div className={styles.aggregateItem}>
        <div className={styles.aggregateLabel}>Conversation</div>
        <div
          className={`${styles.aggregateValue} ${styles.aggregateValueMuted}`}
          data-testid="conversation-tokens"
        >
          {fmtTokens(conversationTokens)}
        </div>
        <div className={styles.aggregateSub}>the work itself</div>
      </div>

      <div className={styles.aggregatePlus} aria-hidden="true">
        =
      </div>

      <div className={styles.aggregateItem}>
        <div className={styles.aggregateLabel}>Reported context</div>
        <div className={styles.aggregateValue} data-testid="reported-total">
          {fmtTokens(reportedTotal)}
        </div>
        <div
          className={styles.aggregateSub}
          data-testid="pressure-label"
          aria-label={`Context pressure: ${pressureLabel}`}
        >
          {pressureLabel}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stacked bar visualization
// ---------------------------------------------------------------------------

interface StackedBarProps {
  segments: ReturnType<typeof sortedSegments>;
  fixedOverhead: number;
}

function StackedBar({
  segments,
  fixedOverhead,
}: StackedBarProps): React.JSX.Element {
  if (fixedOverhead === 0) {
    return (
      <div className={styles.barEmpty} data-testid="bar-empty">
        Zero overhead — nothing to visualize
      </div>
    );
  }

  const MIN_LABEL_PCT = 10;

  return (
    <div
      className={styles.barOuter}
      role="img"
      aria-label="Context window breakdown"
    >
      {segments.map((seg) => {
        if (
          seg.tokens === undefined ||
          seg.pct === undefined ||
          (seg.pct <= 0 && fixedOverhead > 0)
        ) {
          return null;
        }
        const widthPct = seg.pct;
        const showLabel = widthPct >= MIN_LABEL_PCT;
        return (
          <div
            key={seg.key}
            className={`${styles.barSegment} ${styles[`bar-${seg.pattern}`]}`}
            style={{ width: `${widthPct}%` }}
            role="presentation"
            aria-hidden="true"
            title={`${seg.label}: ${fmtTokens(seg.tokens)} tokens (${fmtPct(seg.pct)})`}
          >
            {showLabel && (
              <>
                <span className={styles.barSegmentName}>{seg.label}</span>
                <span className={styles.barSegmentValue}>
                  {fmtTokens(seg.tokens)} · {fmtPct(seg.pct)}
                </span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legend / Breakdown table
// ---------------------------------------------------------------------------

interface BreakdownTableProps {
  segments: ReturnType<typeof sortedSegments>;
}

function BreakdownTable({ segments }: BreakdownTableProps): React.JSX.Element {
  return (
    <div className={styles.tableSection} data-testid="context-legend">
      <h2 className={styles.tableSectionTitle}>Context composition</h2>
      <div className={styles.tableScroll}>
        <div className={styles.tableInner}>
          <div className={styles.tableHeader}>
            <div>Source</div>
            <div className={styles.tableRight}>Tokens</div>
            <div className={styles.tableRight}>Share</div>
          </div>
          {segments.map((seg) => {
            const swatch = (
              <span
                className={`${styles.legendSwatch} ${styles[`bar-${seg.pattern}`]}`}
                aria-hidden="true"
              />
            );

            if (seg.tokens === undefined || seg.pct === undefined) {
              return (
                <div
                  key={seg.key}
                  className={styles.tableRowMuted}
                  data-testid={`breakdown-row-${seg.key}`}
                >
                  <div className={styles.tableRowLabel}>
                    {swatch}
                    <span>{seg.label}</span>
                  </div>
                  <div
                    className={styles.tableRight}
                    data-testid={`breakdown-tokens-${seg.key}`}
                  >
                    unavailable
                  </div>
                  <div
                    className={styles.tableRight}
                    data-testid={`breakdown-pct-${seg.key}`}
                  >
                    —
                  </div>
                </div>
              );
            }

            const isZero = seg.tokens === 0;
            const isTopThree = seg.pct >= 10;

            return (
              <div
                key={seg.key}
                className={isZero ? styles.tableRowMuted : styles.tableRow}
                data-testid={`breakdown-row-${seg.key}`}
              >
                <div
                  className={`${styles.tableRowLabel} ${
                    isTopThree ? styles.tableRowNameBold : styles.tableRowName
                  }`}
                >
                  {swatch}
                  <span>{seg.label}</span>
                </div>
                <div
                  className={`${styles.tableRight} ${
                    isTopThree ? styles.tableRowValueBold : ""
                  }`}
                  data-testid={`breakdown-tokens-${seg.key}`}
                >
                  {fmtTokens(seg.tokens)}
                </div>
                <div
                  className={`${styles.tableRight} ${styles.tableRowPct}`}
                  data-testid={`breakdown-pct-${seg.key}`}
                >
                  {fmtPct(seg.pct)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ContextWindowScreen({
  context,
  embedded = false,
}: ContextWindowScreenProps): React.JSX.Element {
  const {
    fixedOverhead,
    conversationTokens,
    reportedTotal,
    breakdown,
    pressure,
    maxContextWindow,
  } = context;

  const segments = sortedSegments(breakdown, fixedOverhead);

  const body = (
    <>
      {!embedded && (
        <>
          <div className={styles.sectionLabel}>Diagnose · context window</div>
          <h1 className={styles.heading}>Context window breakdown</h1>
        </>
      )}

      {/* Part 1: Summary row */}
      <AggregateRow
        fixedOverhead={fixedOverhead}
        conversationTokens={conversationTokens}
        reportedTotal={reportedTotal}
        pressure={pressure}
        maxContextWindow={maxContextWindow}
      />

      {/* Part 2: Context composition bar + legend */}
      <StackedBar segments={segments} fixedOverhead={fixedOverhead} />
      <BreakdownTable segments={segments} />
    </>
  );

  if (embedded) {
    return (
      <section
        className={styles.embeddedSection}
        data-testid="context-window-screen"
        aria-label="Context window breakdown"
      >
        {body}
      </section>
    );
  }

  return (
    <main className={styles.screen} data-testid="context-window-screen">
      {body}
    </main>
  );
}
