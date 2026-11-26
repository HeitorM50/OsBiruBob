/**
 * ContextWindowScreen — Hindsight
 *
 * Renders the context window summary (fixed overhead, conversation, reported
 * total & pressure), an optional context window size input, and stacked bar
 * decomposition with legend extracted during the Observe phase.
 *
 * Rules enforced here:
 *  - percentages always use fixedOverhead as denominator (never reportedTotal)
 *  - fixedOverhead, conversationTokens, reportedTotal are distinct and labelled with units
 *  - pressure shown only when maxContextWindow is explicitly positive
 *  - all ten breakdown sources are always rendered (zero is not hidden)
 *  - readable field labels with raw export keys in `title`
 *  - bar segments < 10% include accessible screen-reader text
 *  - no sensitive data is rendered (no message content, paths, titles)
 */

import React, { useId, useState } from "react";
import type { ContextSummary } from "../domain/types";
import {
  formatInteger,
  formatPercent,
  formatTokens,
  formatWindowSize,
} from "./format";
import { BREAKDOWN_FIELD_LABELS } from "./Glossary";
import styles from "./ContextWindowScreen.module.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContextWindowScreenProps {
  context: ContextSummary;
  /** When true, renders as a <section> inside DiagnoseScreen without outer page chrome. */
  embedded?: boolean;
  /** Controlled numeric string for the context window size input (empty = unavailable). */
  maxContextWindowInput?: string;
  /** Called when the user edits the context window size input. */
  onMaxContextWindowChange?: (value: string) => void;
  /** True when the displayed context window size is an assumed demo value (e.g. 270k). */
  contextWindowAssumed?: boolean;
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
  { key: "toolDefinitions", label: BREAKDOWN_FIELD_LABELS.toolDefinitions, pattern: "solid-1" },
  { key: "toolSystemPrompts", label: BREAKDOWN_FIELD_LABELS.toolSystemPrompts, pattern: "hatch-2" },
  { key: "skills", label: BREAKDOWN_FIELD_LABELS.skills, pattern: "solid-3" },
  { key: "staticSections", label: BREAKDOWN_FIELD_LABELS.staticSections, pattern: "hatch-4" },
  { key: "baseRules", label: BREAKDOWN_FIELD_LABELS.baseRules, pattern: "solid-5" },
  { key: "customInstructions", label: BREAKDOWN_FIELD_LABELS.customInstructions, pattern: "hatch-6" },
  { key: "environment", label: BREAKDOWN_FIELD_LABELS.environment, pattern: "solid-7" },
  { key: "roleDefinition", label: BREAKDOWN_FIELD_LABELS.roleDefinition, pattern: "solid-8" },
  { key: "projectRules", label: BREAKDOWN_FIELD_LABELS.projectRules, pattern: "solid-acc" },
  { key: "mcpToolDefinitions", label: BREAKDOWN_FIELD_LABELS.mcpToolDefinitions, pattern: "solid-muted" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function parseMaxContextWindow(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
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
  assumed: boolean;
}

function AggregateRow({
  fixedOverhead,
  conversationTokens,
  reportedTotal,
  pressure,
  maxContextWindow,
  assumed,
}: AggregatesProps): React.JSX.Element {
  const pressureLabel =
    pressure !== null && maxContextWindow !== null
      ? `${formatPercent(pressure * 100)} of a ${formatWindowSize(maxContextWindow)} window${assumed ? " (assumed)" : ""}`
      : "Pressure unavailable — enter your model's context window size (tokens) to calculate pressure";

  return (
    <div className={styles.aggregates} data-testid="context-summary-row">
      <div className={styles.aggregateItem}>
        <div className={styles.aggregateLabel}>Fixed overhead</div>
        <div className={styles.aggregateValue} data-testid="fixed-overhead">
          {formatInteger(fixedOverhead)}{" "}
          <span className={styles.aggregateUnit}>tokens</span>
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
          {formatInteger(conversationTokens)}{" "}
          <span className={styles.aggregateUnit}>tokens</span>
        </div>
        <div className={styles.aggregateSub}>the work itself</div>
      </div>

      <div className={styles.aggregatePlus} aria-hidden="true">
        =
      </div>

      <div className={styles.aggregateItem}>
        <div className={styles.aggregateLabel}>Reported context</div>
        <div className={styles.aggregateValue} data-testid="reported-total">
          {formatInteger(reportedTotal)}{" "}
          <span className={styles.aggregateUnit}>tokens</span>
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
      role="group"
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
            title={`${seg.label} (${seg.key}): ${formatTokens(seg.tokens)} (${formatPercent(seg.pct)})`}
          >
            {showLabel ? (
              <>
                <span className={styles.barSegmentName}>{seg.label}</span>
                <span className={styles.barSegmentValue}>
                  {formatInteger(seg.tokens)}{" "}
                  <abbr className={styles.unitAbbr} title="tokens">
                    tok
                  </abbr>{" "}
                  · {formatPercent(seg.pct)}
                </span>
              </>
            ) : (
              <span className={styles.srOnly}>
                {seg.label}: {formatTokens(seg.tokens)} ({formatPercent(seg.pct)})
              </span>
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
            <div className={styles.tableRight}>Share (%)</div>
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
                  <div className={styles.tableRowLabel} title={seg.key}>
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
                  title={seg.key}
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
                  {formatTokens(seg.tokens)}
                </div>
                <div
                  className={`${styles.tableRight} ${styles.tableRowPct}`}
                  data-testid={`breakdown-pct-${seg.key}`}
                >
                  {formatPercent(seg.pct)}
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
  maxContextWindowInput,
  onMaxContextWindowChange,
  contextWindowAssumed = false,
}: ContextWindowScreenProps): React.JSX.Element {
  const windowInputId = useId();
  const isControlled =
    maxContextWindowInput !== undefined &&
    onMaxContextWindowChange !== undefined;

  const [localWindowInput, setLocalWindowInput] = useState<string>(() =>
    context.maxContextWindow !== null ? String(context.maxContextWindow) : ""
  );
  const [localTouched, setLocalTouched] = useState(false);

  const inputValue = isControlled ? maxContextWindowInput : localWindowInput;
  const parsedWindow = parseMaxContextWindow(inputValue);

  const effectiveMaxWindow = isControlled
    ? parsedWindow
    : localTouched
      ? parsedWindow
      : context.maxContextWindow;

  // Valores não finitos (ex.: 1e309 no JSON vira Infinity) tornam a pressão indisponível.
  const rawPressure =
    effectiveMaxWindow !== null && effectiveMaxWindow > 0
      ? context.reportedTotal / effectiveMaxWindow
      : null;
  const effectivePressure =
    rawPressure !== null && Number.isFinite(rawPressure) ? rawPressure : null;

  const assumed = isControlled
    ? contextWindowAssumed && effectiveMaxWindow !== null
    : contextWindowAssumed && !localTouched && effectiveMaxWindow !== null;

  const { fixedOverhead, conversationTokens, reportedTotal, breakdown } =
    context;

  const segments = sortedSegments(breakdown, fixedOverhead);

  function handleWindowChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const next = event.currentTarget.value;
    if (isControlled) {
      onMaxContextWindowChange(next);
    } else {
      setLocalTouched(true);
      setLocalWindowInput(next);
    }
  }

  const body = (
    <>
      {!embedded && (
        <>
          <div className={styles.sectionLabel}>Diagnose · context window</div>
          <h1 className={styles.heading}>
            {formatTokens(fixedOverhead)} of fixed overhead before work begins
          </h1>
        </>
      )}

      {/* Part 1: Summary row */}
      <AggregateRow
        fixedOverhead={fixedOverhead}
        conversationTokens={conversationTokens}
        reportedTotal={reportedTotal}
        pressure={effectivePressure}
        maxContextWindow={effectiveMaxWindow}
        assumed={assumed}
      />

      {/* Context window size control */}
      <div className={styles.windowControl}>
        <label htmlFor={windowInputId} className={styles.windowLabel}>
          Context window size (tokens)
        </label>
        <div className={styles.windowInputGroup}>
          <input
            id={windowInputId}
            type="number"
            min={1}
            step={1000}
            inputMode="numeric"
            placeholder="Optional, e.g. 200000"
            value={inputValue}
            onChange={handleWindowChange}
            className={styles.windowInput}
            data-testid="context-window-input"
          />
          {assumed && (
            <span className={styles.assumedBadge} data-testid="assumed-badge">
              assumed
            </span>
          )}
        </div>
        <span className={styles.windowHint}>
          IBM Bob exports do not include your model&apos;s limit. Leave blank if
          unknown.
        </span>
      </div>

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
