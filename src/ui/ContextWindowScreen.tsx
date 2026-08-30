/**
 * ContextWindowScreen — Hindsight
 *
 * Renders the full context window token breakdown extracted during the Observe
 * phase (ObserveReport → TaskReport → ContextSummary).
 *
 * Rules enforced here:
 *  - percentages always use fixedOverhead as denominator (never reportedTotal)
 *  - fixedOverhead, conversationTokens, reportedTotal are distinct and labelled
 *  - pressure shown only when maxContextWindow is explicitly non-null
 *  - projectRules === 0 triggers a highlighted alert treatment
 *  - all ten breakdown sources are always rendered (zero is not hidden)
 *  - no sensitive data is rendered (no message content, paths, titles)
 */

import React from "react";
import type { ContextSummary } from "../domain/types";
import styles from "./ContextWindowScreen.module.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContextWindowScreenProps {
  context: ContextSummary;
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

// Ordered by prototype visual priority (largest first in the baseline)
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

/**
 * Format a token count with a comma as thousands separator ("10,439", "5,403").
 */
function fmtTokens(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * Format a percentage to one decimal place ("51.8%").
 */
function fmtPct(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
}

/**
 * Build a sorted list of segments (largest first) from the breakdown.
 * Segments with zero tokens are kept (zero is the finding).
 */
function sortedSegments(
  breakdown: ContextSummary["breakdown"],
  fixedOverhead: number
): Array<SegmentDef & { tokens: number; pct: number }> {
  return SEGMENT_DEFS
    .map((def) => {
      const tokens = breakdown[def.key] ?? 0;
      const pct = fixedOverhead > 0 ? (tokens / fixedOverhead) * 100 : 0;
      return { ...def, tokens, pct };
    })
    .sort((a, b) => b.tokens - a.tokens);
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
    <div className={styles.aggregates}>
      <div className={styles.aggregateItem}>
        <div className={styles.aggregateLabel}>Fixed overhead</div>
        <div
          className={styles.aggregateValue}
          data-testid="fixed-overhead"
        >
          {fmtTokens(fixedOverhead)}
        </div>
        <div className={styles.aggregateSub}>loaded before any work</div>
      </div>

      <div className={styles.aggregatePlus} aria-hidden="true">+</div>

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

      <div className={styles.aggregatePlus} aria-hidden="true">=</div>

      <div className={styles.aggregateItem}>
        <div className={styles.aggregateLabel}>Reported context</div>
        <div
          className={styles.aggregateValue}
          data-testid="reported-total"
        >
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

function StackedBar({ segments, fixedOverhead }: StackedBarProps): React.JSX.Element {
  if (fixedOverhead === 0) {
    return (
      <div className={styles.barEmpty} data-testid="bar-empty">
        Zero overhead — nothing to visualize
      </div>
    );
  }

  // Only show labels for segments >= 5% (the top ones) in the bar itself
  const MIN_LABEL_PCT = 5;

  return (
    <div className={styles.barOuter} role="img" aria-label="Context window breakdown">
      {segments.map((seg) => {
        if (seg.pct <= 0 && fixedOverhead > 0) {
          // Zero-width segments are not rendered in the visual bar but appear in legend
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
// projectRules alert card
// ---------------------------------------------------------------------------

interface ProjectRulesAlertProps {
  tokens: number;
}

function ProjectRulesAlert({ tokens }: ProjectRulesAlertProps): React.JSX.Element | null {
  if (tokens !== 0) return null;

  return (
    <div
      className={styles.projectRulesAlert}
      role="alert"
      data-testid="project-rules-alert"
    >
      <div className={styles.projectRulesAlertSide}>
        <div
          className={styles.projectRulesZero}
          aria-label="projectRules: 0 tokens"
        >
          0
        </div>
        <div className={styles.projectRulesKey}>projectRules</div>
      </div>
      <div className={styles.projectRulesAlertBody}>
        <h3 className={styles.projectRulesAlertTitle}>
          This project has no AGENTS.md
        </h3>
        <p className={styles.projectRulesAlertText}>
          The slice of the window that would carry project knowledge came back
          empty. The agent rediscovers the structure, the conventions and the
          commands from scratch in every new session — and pays for that
          rediscovery every time.
        </p>
        <div className={styles.projectRulesAlertMeta}>
          <span className={styles.badgeHigh}>HIGH CONFIDENCE</span>
          <code className={styles.fieldPath}>breakdown.projectRules</code>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Breakdown table
// ---------------------------------------------------------------------------

interface BreakdownTableProps {
  segments: ReturnType<typeof sortedSegments>;
}

function BreakdownTable({ segments }: BreakdownTableProps): React.JSX.Element {
  return (
    <div className={styles.tableSection}>
      <h2 className={styles.tableSectionTitle}>The ten sources</h2>
      <p className={styles.tableSectionSub}>
        Sources at zero stay in the list — the zero is the finding.
      </p>
      <div className={styles.tableScroll}>
        <div className={styles.tableInner}>
          <div className={styles.tableHeader}>
            <div>Source</div>
            <div className={styles.tableRight}>Tokens</div>
            <div className={styles.tableRight}>Share</div>
          </div>
          {segments.map((seg) => {
            const isProjectRulesZero = seg.key === "projectRules" && seg.tokens === 0;
            const isMcpZero = seg.key === "mcpToolDefinitions" && seg.tokens === 0;
            const isTopThree = seg.pct >= 10;

            if (isProjectRulesZero) {
              return (
                <div
                  key={seg.key}
                  className={styles.tableRowAlert}
                  data-testid={`breakdown-row-${seg.key}`}
                >
                  <div className={styles.tableRowAlertName}>
                    <span>{seg.label}</span>
                    <span className={styles.findingBadge}>FINDING</span>
                  </div>
                  <div className={`${styles.tableRight} ${styles.tableAlertValue}`} data-testid={`breakdown-tokens-${seg.key}`}>
                    {fmtTokens(seg.tokens)}
                  </div>
                  <div className={`${styles.tableRight} ${styles.tableAlertValue}`} data-testid={`breakdown-pct-${seg.key}`}>
                    {fmtPct(seg.pct)}
                  </div>
                </div>
              );
            }

            if (isMcpZero) {
              return (
                <div
                  key={seg.key}
                  className={styles.tableRowMuted}
                  data-testid={`breakdown-row-${seg.key}`}
                >
                  <div className={styles.tableRowMutedName}>
                    <span>{seg.label}</span>
                    <span className={styles.mcpNote}>no MCP server connected</span>
                  </div>
                  <div className={styles.tableRight} data-testid={`breakdown-tokens-${seg.key}`}>
                    {fmtTokens(seg.tokens)}
                  </div>
                  <div className={styles.tableRight} data-testid={`breakdown-pct-${seg.key}`}>
                    {fmtPct(seg.pct)}
                  </div>
                </div>
              );
            }

            return (
              <div
                key={seg.key}
                className={styles.tableRow}
                data-testid={`breakdown-row-${seg.key}`}
              >
                <div className={isTopThree ? styles.tableRowNameBold : styles.tableRowName}>
                  {seg.label}
                </div>
                <div
                  className={`${styles.tableRight} ${isTopThree ? styles.tableRowValueBold : ""}`}
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
// Main screen
// ---------------------------------------------------------------------------

export default function ContextWindowScreen({
  context,
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
  const projectRulesTokens = breakdown.projectRules ?? 0;

  return (
    <div className={styles.screen} data-testid="context-window-screen">
      {/* Section header */}
      <div className={styles.sectionLabel}>
        Diagnosis · context window
      </div>
      <h1 className={styles.heading}>
        Ten thousand tokens were spent before the agent read a single line of code.
      </h1>
      <p className={styles.lead}>
        This is the fixed overhead: instructions, tool definitions and Skills
        loaded at the start of every session. It never appears on any screen the
        agent shows you.
      </p>

      {/* Three aggregate numbers */}
      <AggregateRow
        fixedOverhead={fixedOverhead}
        conversationTokens={conversationTokens}
        reportedTotal={reportedTotal}
        pressure={pressure}
        maxContextWindow={maxContextWindow}
      />

      {/* Stacked bar */}
      <StackedBar segments={segments} fixedOverhead={fixedOverhead} />

      <div className={styles.barNote}>
        <span>
          Every band has its own fill — hatched or solid — so it never relies
          on colour alone to be read.
        </span>
      </div>

      {/* projectRules = 0 alert */}
      <ProjectRulesAlert tokens={projectRulesTokens} />

      {/* Full breakdown table */}
      <BreakdownTable segments={segments} />
    </div>
  );
}
