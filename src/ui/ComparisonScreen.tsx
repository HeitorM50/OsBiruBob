import React from "react";
import type { Comparison, ObserveReport } from "../domain/types";
import { findingKindLabel } from "./finding-labels";
import {
  formatCurrency,
  formatDurationSeconds,
  formatInteger,
  formatPercent,
  formatTokens,
} from "./format";
import { BREAKDOWN_FIELD_LABELS } from "./Glossary";
import styles from "./ComparisonScreen.module.css";

type ValueKind = "currency" | "integer" | "tokens" | "duration";
type TrendRule = "lower-is-better" | "intentional-increase";

interface MetricRow {
  label: string;
  technicalKey?: string;
  valueA: number | null | undefined;
  valueB: number | null | undefined;
  delta: number | null | undefined;
  kind: ValueKind;
  trend: TrendRule;
  displayA?: string;
  displayB?: string;
  emphasis?: boolean;
}

export interface ComparisonScreenProps {
  comparison: Comparison | null;
  roundA: ObserveReport;
  onAddRoundB: () => void;
  onViewPrescriptions: () => void;
}

function rootTasks(report: ObserveReport): ObserveReport["tasks"] {
  return report.tasks.filter((task) => !task.isSubtask);
}

function roundAFixedOverhead(report: ObserveReport): number | null {
  const withContext = rootTasks(report).filter((task) => task.context !== null);
  if (withContext.length === 0) return null;
  return withContext.reduce(
    (total, task) => total + task.context!.fixedOverhead,
    0
  );
}

function formatValue(value: number, kind: ValueKind): string {
  if (kind === "currency") return formatCurrency(value);
  if (kind === "duration") return formatDurationSeconds(value);
  if (kind === "tokens") return formatTokens(value);
  return formatInteger(value);
}

function signedValue(value: number, kind: ValueKind): string {
  if (value === 0) {
    if (kind === "currency") return formatCurrency(0);
    if (kind === "tokens") return formatTokens(0);
    if (kind === "duration") return formatDurationSeconds(0);
    return "0";
  }
  const sign = value > 0 ? "+" : "−";
  return `${sign}${formatValue(Math.abs(value), kind)}`;
}

function percentage(delta: number, baseline: number): number | null {
  if (baseline === 0) return null;
  return (delta / baseline) * 100;
}

function signedPercent(value: number): string {
  if (value === 0) return formatPercent(0);
  return `${value > 0 ? "+" : "−"}${formatPercent(Math.abs(value))}`;
}

function deltaLabel(row: MetricRow): {
  symbol: string;
  text: string;
  className: string;
} {
  if (row.valueA == null || row.delta == null) {
    return { symbol: "—", text: "not measured", className: styles.neutral };
  }

  const absolute = signedValue(row.delta, row.kind);
  const ratio = percentage(row.delta, row.valueA);
  const ratioText = ratio === null ? "zero baseline" : signedPercent(ratio);

  if (row.delta === 0) {
    return {
      symbol: "=",
      text: `${absolute} · ${ratioText} · no change`,
      className: styles.neutral,
    };
  }

  const symbol = row.delta < 0 ? "↓" : "↑";
  if (row.trend === "intentional-increase") {
    return {
      symbol,
      text: `${absolute} · ${ratioText} · intentional increase`,
      className: styles.intentional,
    };
  }

  const improved = row.delta < 0;
  return {
    symbol,
    text: `${absolute} · ${ratioText} · ${improved ? "improvement" : "regression"}`,
    className: improved ? styles.improvement : styles.regression,
  };
}

function Value({
  value,
  kind,
  display,
}: {
  value: number | null | undefined;
  kind: ValueKind;
  display?: string;
}): React.JSX.Element {
  if (value == null) return <span className={styles.unavailable}>unavailable</span>;
  return (
    <data
      value={String(value)}
      data-exact={String(value)}
      title={`Exact value: ${String(value)}`}
    >
      {display ?? formatValue(value, kind)}
    </data>
  );
}

function DeltaCell({ row }: { row: MetricRow }): React.JSX.Element {
  const delta = deltaLabel(row);
  const content = (
    <>
      <span aria-hidden="true">{delta.symbol}</span>{" "}
      {delta.text}
    </>
  );

  return (
    <td className={delta.className}>
      {row.delta == null ? (
        content
      ) : (
        <data
          value={String(row.delta)}
          data-exact={String(row.delta)}
          title={`Exact delta: ${String(row.delta)}`}
        >
          {content}
        </data>
      )}
    </td>
  );
}

function calculatedRows(comparison: Comparison): MetricRow[] {
  const metrics = comparison.metrics;
  const idleDisplayA =
    metrics.idleToolsA !== undefined && metrics.availableToolsA !== undefined
      ? `${formatInteger(metrics.idleToolsA)} of ${formatInteger(metrics.availableToolsA)}`
      : undefined;
  const idleDisplayB =
    metrics.idleToolsB !== undefined && metrics.availableToolsB !== undefined
      ? `${formatInteger(metrics.idleToolsB)} of ${formatInteger(metrics.availableToolsB)}`
      : undefined;

  return [
    {
      label: "Fixed overhead",
      valueA: metrics.fixedOverheadA,
      valueB: metrics.fixedOverheadB,
      delta: metrics.fixedOverheadDelta,
      kind: "tokens",
      trend: "lower-is-better",
      emphasis: true,
    },
    {
      label: findingKindLabel("unused-tool"),
      valueA: metrics.idleToolsA,
      valueB: metrics.idleToolsB,
      delta: metrics.idleToolsDelta,
      kind: "integer",
      trend: "lower-is-better",
      displayA: idleDisplayA,
      displayB: idleDisplayB,
      emphasis: true,
    },
    {
      label: "API Cost (USD)",
      valueA: metrics.costA,
      valueB: metrics.costB,
      delta: metrics.costDelta,
      kind: "currency",
      trend: "lower-is-better",
    },
    {
      label: "Reported context",
      valueA: metrics.contextTokensA,
      valueB: metrics.contextTokensB,
      delta: metrics.contextTokensDelta,
      kind: "tokens",
      trend: "lower-is-better",
    },
    {
      label: "Conversation tokens",
      valueA: metrics.conversationTokensA,
      valueB: metrics.conversationTokensB,
      delta: metrics.conversationTokensDelta,
      kind: "tokens",
      trend: "lower-is-better",
    },
    {
      label: findingKindLabel("skill-overhead"),
      valueA: metrics.skillTokensA,
      valueB: metrics.skillTokensB,
      delta: metrics.skillTokensDelta,
      kind: "tokens",
      trend: "lower-is-better",
    },
    {
      label: BREAKDOWN_FIELD_LABELS.projectRules,
      technicalKey: "projectRules",
      valueA: metrics.projectRulesTokensA,
      valueB: metrics.projectRulesTokensB,
      delta: metrics.projectRulesTokensDelta,
      kind: "tokens",
      trend: "intentional-increase",
    },
    {
      label: "Assistant turns",
      valueA: metrics.assistantTurnsA,
      valueB: metrics.assistantTurnsB,
      delta: metrics.assistantTurnsDelta,
      kind: "integer",
      trend: "lower-is-better",
    },
    {
      label: "Human interventions",
      valueA: metrics.humanInterventionsA,
      valueB: metrics.humanInterventionsB,
      delta: metrics.humanInterventionsDelta,
      kind: "integer",
      trend: "lower-is-better",
    },
    {
      label: "Errored tool calls",
      valueA: metrics.erroredToolCallsA,
      valueB: metrics.erroredToolCallsB,
      delta: metrics.erroredToolCallsDelta,
      kind: "integer",
      trend: "lower-is-better",
    },
    {
      label: "External commands",
      valueA: metrics.externalCommandsA,
      valueB: metrics.externalCommandsB,
      delta: metrics.externalCommandsDelta,
      kind: "integer",
      trend: "lower-is-better",
    },
    {
      label: "Duration",
      valueA: metrics.durationMsA,
      valueB: metrics.durationMsB,
      delta: metrics.durationMsDelta,
      kind: "duration",
      trend: "lower-is-better",
    },
  ];
}

function MetricTable({
  rows,
  label,
}: {
  rows: readonly MetricRow[];
  label: string;
}): React.JSX.Element {
  return (
    <div className={styles.tableScroll}>
      <table className={styles.table} aria-label={label}>
        <thead>
          <tr>
            <th scope="col">Metric</th>
            <th scope="col">Round A</th>
            <th scope="col">Round B</th>
            <th scope="col">Absolute and percentage delta</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            return (
              <tr
                key={row.label}
                className={`${row.emphasis ? styles.emphasis : ""} ${
                  row.trend === "intentional-increase" ? styles.intentionalRow : ""
                }`}
              >
                <th scope="row" title={row.technicalKey}>
                  {row.label}
                </th>
                <td><Value value={row.valueA} kind={row.kind} display={row.displayA} /></td>
                <td><Value value={row.valueB} kind={row.kind} display={row.displayB} /></td>
                <DeltaCell row={row} />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const SCREENSHOT_METRICS: ReadonlyArray<{ label: string; explanation: string }> = [
  {
    label: "Tokens ↑",
    explanation: "Input tokens sent to the model (prompt + context), shown in Bob's task summary.",
  },
  {
    label: "Tokens ↓",
    explanation: "Output tokens generated by the model, shown in Bob's task summary.",
  },
  {
    label: "Cache ↓/↑ (ratio)",
    explanation: "Prompt cache reads vs. writes from Bob's task summary.",
  },
  {
    label: "Context Length %",
    explanation: "Percentage of the model's context window shown in Bob's task summary.",
  },
];

function ManualMetrics({ comparison }: { comparison: Comparison }): React.JSX.Element {
  const buildMeasured =
    comparison.metrics.buildFailuresA !== undefined &&
    comparison.metrics.buildFailuresB !== undefined &&
    comparison.metrics.buildFailuresDelta !== undefined;
  const buildRow: MetricRow = {
    label: "Build failures",
    valueA: comparison.metrics.buildFailuresA,
    valueB: comparison.metrics.buildFailuresB,
    delta: comparison.metrics.buildFailuresDelta,
    kind: "integer",
    trend: "lower-is-better",
  };

  return (
    <section className={`${styles.tableCard} ${styles.manualCard}`}>
      <div className={styles.tableHeader}>
        <h2>Filled in by hand <span className={styles.manualBadge}>READ FROM SCREENSHOT</span></h2>
        <p>
          These do not exist in the Bob export and are never mixed with the calculated ones.
          Tokens ↑ are input tokens sent to the model; Tokens ↓ are output tokens generated by the model.
        </p>
      </div>
      <div className={styles.tableScroll}>
        <table className={styles.table} aria-label="Manually filled metrics">
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col">Round A</th>
              <th scope="col">Round B</th>
              <th scope="col">Absolute and percentage delta</th>
            </tr>
          </thead>
          <tbody>
            {SCREENSHOT_METRICS.map((item) => (
              <tr key={item.label}>
                <th scope="row">
                  <span>{item.label}</span>
                  <span className={styles.metricHint}>{item.explanation}</span>
                </th>
                <td className={styles.unavailable}>unavailable</td>
                <td className={styles.unavailable}>unavailable</td>
                <td className={styles.neutral}>— not measured</td>
              </tr>
            ))}
            {buildMeasured ? (
              <tr>
                <th scope="row">{buildRow.label}</th>
                <td><Value value={buildRow.valueA} kind="integer" /></td>
                <td><Value value={buildRow.valueB} kind="integer" /></td>
                <DeltaCell row={buildRow} />
              </tr>
            ) : (
              <tr>
                <th scope="row">Build failures</th>
                <td className={styles.unavailable}>unavailable</td>
                <td className={styles.unavailable}>unavailable</td>
                <td className={styles.neutral}>— not measured</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MissingRoundB({
  roundA,
  onAddRoundB,
  onViewPrescriptions,
}: Omit<ComparisonScreenProps, "comparison">): React.JSX.Element {
  const overheadA = roundAFixedOverhead(roundA);
  return (
    <section className={styles.missingCard}>
      <div className={styles.missingContent}>
        <h2>Only Round A has been loaded</h2>
        <p>
          This is the normal path, not an error: Round B only exists after you
          apply the prescriptions and run the same task again.
        </p>
        <ol className={styles.missingSteps}>
          <li>
            <strong>Round A loaded</strong> — {roundA.totals.assistantTurns}{" "}
            {roundA.totals.assistantTurns === 1 ? "turn" : "turns"},{" "}
            {overheadA !== null
              ? `${formatTokens(overheadA)} of fixed overhead`
              : "fixed overhead unavailable"}
          </li>
          <li>Apply the configuration Hindsight generated</li>
          <li>Run the same task in a new conversation</li>
          <li>Add the second export</li>
        </ol>
        <div className={styles.actions}>
          <button type="button" className={styles.primaryButton} onClick={onAddRoundB}>Add Round B</button>
          <button type="button" className={styles.secondaryButton} onClick={onViewPrescriptions}>See what to apply</button>
        </div>
      </div>
      <aside className={styles.hypothesis}>
        <span>Registered hypothesis</span>
        <p>
          Project rules leave 0<br />
          Fixed overhead falls<br />
          Idle tools decrease<br />
          Regressions will be reported too
        </p>
        <small>Registered before the run, so the metric is not chosen after seeing the number.</small>
      </aside>
    </section>
  );
}

function headline(comparison: Comparison): string {
  const { fixedOverheadA, fixedOverheadDelta } = comparison.metrics;
  if (fixedOverheadA === null || fixedOverheadDelta === null) {
    return "Fixed overhead unavailable in one or both rounds. Available results stay in the table.";
  }
  const ratio = percentage(fixedOverheadDelta, fixedOverheadA);
  if (fixedOverheadDelta === 0) {
    return "Fixed overhead did not change. Ties and regressions stay in the table.";
  }
  if (ratio === null) {
    return "Fixed overhead changed from a zero baseline. Every result is in the table.";
  }
  return `Fixed overhead ${fixedOverheadDelta < 0 ? "fell" : "rose"} ${formatPercent(Math.abs(ratio))}. Regressions and ties stay visible.`;
}

export function ComparisonScreen({
  comparison,
  roundA,
  onAddRoundB,
  onViewPrescriptions,
}: ComparisonScreenProps): React.JSX.Element {
  if (comparison === null) {
    return (
      <main className={styles.wrapper}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>A/B comparison</p>
          <h1>Round B has not been loaded yet.</h1>
        </header>
        <MissingRoundB
          roundA={roundA}
          onAddRoundB={onAddRoundB}
          onViewPrescriptions={onViewPrescriptions}
        />
      </main>
    );
  }

  const rows = calculatedRows(comparison);
  const overhead = rows[0];
  const cost = rows[2];
  const projectRules = rows[6];

  return (
    <main className={styles.wrapper}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>A/B comparison</p>
        <h1>{headline(comparison)}</h1>
      </header>

      <section
        className={comparison.valid ? styles.validityOk : styles.validityInvalid}
        role={comparison.valid ? "status" : "alert"}
      >
        <strong>{comparison.valid ? "Valid export metrics" : "Invalid experimental comparison"}</strong>
        <span>
          {comparison.valid
            ? "Automatically verified by Hindsight (root task counts, permissions)."
            : comparison.invalidReason ?? "The protocol differs between the rounds."}
        </span>
        {comparison.valid && (
           <span style={{ display: "block", marginTop: "4px", fontSize: "0.875rem" }}>
             <strong>Requires manual verification:</strong> Identical prompt, same codebase/commit, and same builder (not verifiable in export).
           </span>
        )}
      </section>

      <section className={styles.summaryCards} aria-label="Comparison highlights">
        {[overhead, cost, projectRules].map((row) => {
          const delta = deltaLabel(row);
          return (
            <article key={row.label} className={row.trend === "intentional-increase" ? styles.intentionalCard : styles.summaryCard}>
              <span title={row.technicalKey}>{row.label}</span>
              <strong>
                {row.delta == null ? (
                  <span className={styles.unavailable}>unavailable</span>
                ) : (
                  signedValue(row.delta, row.kind)
                )}
              </strong>
              <b className={delta.className}>
                <span aria-hidden="true">{delta.symbol}</span>{" "}
                {row.delta == null
                  ? delta.text
                  : delta.text.split(" · ").slice(1).join(" · ")}
              </b>
              <small><Value value={row.valueA} kind={row.kind} display={row.displayA} /> → <Value value={row.valueB} kind={row.kind} display={row.displayB} /></small>
            </article>
          );
        })}
      </section>

      <section className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h2>Calculated by Hindsight</h2>
          <p>Derived from the export, field by field. Auditable.</p>
        </div>
        <MetricTable rows={rows} label="Metrics calculated by Hindsight" />
      </section>

      <ManualMetrics comparison={comparison} />

      <footer className={styles.notes}>
        <span>Improvement and regression appear as a word and an arrow, not colour alone.</span>
        <span>Unchanged metrics stay in the table: a zero delta is a result too.</span>
      </footer>
    </main>
  );
}
