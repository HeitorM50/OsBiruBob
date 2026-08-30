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
 * Format a token count with a period as thousands separator (pt-BR style,
 * matching the prototype: "10.439", "5.403").
 */
function fmtTokens(n: number): string {
  return n.toLocaleString("pt-BR");
}

/**
 * Format a percentage to one decimal place (pt-BR comma: "51,8%").
 */
function fmtPct(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
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
      ? `${fmtPct(pressure * 100)} de uma janela de ${Math.round(maxContextWindow / 1000)}k`
      : "Pressão indisponível — janela máxima não informada";

  return (
    <div className={styles.aggregates}>
      <div className={styles.aggregateItem}>
        <div className={styles.aggregateLabel}>Overhead fixo</div>
        <div
          className={styles.aggregateValue}
          data-testid="fixed-overhead"
        >
          {fmtTokens(fixedOverhead)}
        </div>
        <div className={styles.aggregateSub}>carregado antes do trabalho</div>
      </div>

      <div className={styles.aggregatePlus} aria-hidden="true">+</div>

      <div className={styles.aggregateItem}>
        <div className={styles.aggregateLabel}>Conversa</div>
        <div
          className={`${styles.aggregateValue} ${styles.aggregateValueMuted}`}
          data-testid="conversation-tokens"
        >
          {fmtTokens(conversationTokens)}
        </div>
        <div className={styles.aggregateSub}>o trabalho em si</div>
      </div>

      <div className={styles.aggregatePlus} aria-hidden="true">=</div>

      <div className={styles.aggregateItem}>
        <div className={styles.aggregateLabel}>Contexto reportado</div>
        <div
          className={styles.aggregateValue}
          data-testid="reported-total"
        >
          {fmtTokens(reportedTotal)}
        </div>
        <div
          className={styles.aggregateSub}
          data-testid="pressure-label"
          aria-label={`Pressão de contexto: ${pressureLabel}`}
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
        Overhead zerado — sem dados para visualizar
      </div>
    );
  }

  // Only show labels for segments >= 5% (the top ones) in the bar itself
  const MIN_LABEL_PCT = 5;

  return (
    <div className={styles.barOuter} role="img" aria-label="Decomposição da janela de contexto">
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
          Não existe AGENTS.md neste projeto
        </h3>
        <p className={styles.projectRulesAlertText}>
          A fatia da janela que carregaria o conhecimento do projeto veio zerada.
          O agente redescobre a estrutura, as convenções e os comandos do zero em
          cada sessão nova — e paga por essa redescoberta toda vez.
        </p>
        <div className={styles.projectRulesAlertMeta}>
          <span className={styles.badgeHigh}>CONFIANÇA ALTA</span>
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
      <h2 className={styles.tableSectionTitle}>As dez origens</h2>
      <p className={styles.tableSectionSub}>
        Origens em zero permanecem na lista — o zero é o achado.
      </p>
      <div className={styles.tableScroll}>
        <div className={styles.tableInner}>
          <div className={styles.tableHeader}>
            <div>Origem</div>
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
                    <span className={styles.findingBadge}>ACHADO</span>
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
                    <span className={styles.mcpNote}>nenhum servidor MCP conectado</span>
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
        Diagnóstico · janela de contexto
      </div>
      <h1 className={styles.heading}>
        Dez mil tokens foram gastos antes de o agente ler uma linha de código.
      </h1>
      <p className={styles.lead}>
        Esse é o overhead fixo: instruções, definições de ferramenta e Skills
        carregados no início de toda sessão. Ele não aparece em nenhuma tela do
        agente.
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
          Cada faixa tem preenchimento próprio — hachura ou sólido — e não
          depende de cor para ser lida.
        </span>
      </div>

      {/* projectRules = 0 alert */}
      <ProjectRulesAlert tokens={projectRulesTokens} />

      {/* Full breakdown table */}
      <BreakdownTable segments={segments} />
    </div>
  );
}
