import React from "react";
import type { Comparison, ObserveReport } from "../domain/types";
import styles from "./ComparisonScreen.module.css";

type ValueKind = "currency" | "integer" | "duration";
type TrendRule = "lower-is-better" | "intentional-increase";

interface MetricRow {
  label: string;
  valueA: number | undefined;
  valueB: number | undefined;
  delta: number | undefined;
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

const integerFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 0,
});

const moneyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 6,
  maximumFractionDigits: 6,
});

const percentFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function rootTasks(report: ObserveReport): ObserveReport["tasks"] {
  return report.tasks.filter((task) => !task.isSubtask);
}

function roundAFixedOverhead(report: ObserveReport): number {
  return rootTasks(report).reduce(
    (total, task) => total + task.context.fixedOverhead,
    0
  );
}

function formatValue(value: number, kind: ValueKind): string {
  if (kind === "currency") return moneyFormatter.format(value);
  if (kind === "duration") {
    return `${integerFormatter.format(Math.round(value / 1000))} s`;
  }
  return integerFormatter.format(value);
}

function signedValue(value: number, kind: ValueKind): string {
  if (value === 0) return kind === "currency" ? moneyFormatter.format(0) : "0";
  const sign = value > 0 ? "+" : "−";
  return `${sign}${formatValue(Math.abs(value), kind)}`;
}

function percentage(delta: number, baseline: number): number | null {
  if (baseline === 0) return null;
  return (delta / baseline) * 100;
}

function signedPercent(value: number): string {
  if (value === 0) return "0,0%";
  return `${value > 0 ? "+" : "−"}${percentFormatter.format(Math.abs(value))}%`;
}

function deltaLabel(row: MetricRow): {
  symbol: string;
  text: string;
  className: string;
} {
  if (row.valueA === undefined || row.delta === undefined) {
    return { symbol: "—", text: "não medido", className: styles.neutral };
  }

  const absolute = signedValue(row.delta, row.kind);
  const ratio = percentage(row.delta, row.valueA);
  const ratioText = ratio === null ? "base zero" : signedPercent(ratio);

  if (row.delta === 0) {
    return {
      symbol: "=",
      text: `${absolute} · ${ratioText} · sem mudança`,
      className: styles.neutral,
    };
  }

  const symbol = row.delta < 0 ? "↓" : "↑";
  if (row.trend === "intentional-increase") {
    return {
      symbol,
      text: `${absolute} · ${ratioText} · aumento intencional`,
      className: styles.intentional,
    };
  }

  const improved = row.delta < 0;
  return {
    symbol,
    text: `${absolute} · ${ratioText} · ${improved ? "melhora" : "piora"}`,
    className: improved ? styles.improvement : styles.regression,
  };
}

function Value({
  value,
  kind,
  display,
}: {
  value: number | undefined;
  kind: ValueKind;
  display?: string;
}): React.JSX.Element {
  if (value === undefined) return <span className={styles.unavailable}>indisponível</span>;
  return (
    <data
      value={String(value)}
      data-exact={String(value)}
      title={`Valor exato: ${String(value)}`}
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
      {row.delta === undefined ? (
        content
      ) : (
        <data
          value={String(row.delta)}
          data-exact={String(row.delta)}
          title={`Delta exato: ${String(row.delta)}`}
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
      ? `${integerFormatter.format(metrics.idleToolsA)} de ${integerFormatter.format(metrics.availableToolsA)}`
      : undefined;
  const idleDisplayB =
    metrics.idleToolsB !== undefined && metrics.availableToolsB !== undefined
      ? `${integerFormatter.format(metrics.idleToolsB)} de ${integerFormatter.format(metrics.availableToolsB)}`
      : undefined;

  return [
    {
      label: "Overhead fixo",
      valueA: metrics.fixedOverheadA,
      valueB: metrics.fixedOverheadB,
      delta: metrics.fixedOverheadDelta,
      kind: "integer",
      trend: "lower-is-better",
      emphasis: true,
    },
    {
      label: "Ferramentas ociosas",
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
      label: "Contexto reportado",
      valueA: metrics.contextTokensA,
      valueB: metrics.contextTokensB,
      delta: metrics.contextTokensDelta,
      kind: "integer",
      trend: "lower-is-better",
    },
    {
      label: "Tokens de conversa",
      valueA: metrics.conversationTokensA,
      valueB: metrics.conversationTokensB,
      delta: metrics.conversationTokensDelta,
      kind: "integer",
      trend: "lower-is-better",
    },
    {
      label: "Skill paga sem uso",
      valueA: metrics.skillTokensA,
      valueB: metrics.skillTokensB,
      delta: metrics.skillTokensDelta,
      kind: "integer",
      trend: "lower-is-better",
    },
    {
      label: "projectRules",
      valueA: metrics.projectRulesTokensA,
      valueB: metrics.projectRulesTokensB,
      delta: metrics.projectRulesTokensDelta,
      kind: "integer",
      trend: "intentional-increase",
    },
    {
      label: "Turnos",
      valueA: metrics.assistantTurnsA,
      valueB: metrics.assistantTurnsB,
      delta: metrics.assistantTurnsDelta,
      kind: "integer",
      trend: "lower-is-better",
    },
    {
      label: "Intervenções humanas",
      valueA: metrics.humanInterventionsA,
      valueB: metrics.humanInterventionsB,
      delta: metrics.humanInterventionsDelta,
      kind: "integer",
      trend: "lower-is-better",
    },
    {
      label: "Tool calls com erro",
      valueA: metrics.erroredToolCallsA,
      valueB: metrics.erroredToolCallsB,
      delta: metrics.erroredToolCallsDelta,
      kind: "integer",
      trend: "lower-is-better",
    },
    {
      label: "Comandos externos",
      valueA: metrics.externalCommandsA,
      valueB: metrics.externalCommandsB,
      delta: metrics.externalCommandsDelta,
      kind: "integer",
      trend: "lower-is-better",
    },
    {
      label: "Duração",
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
            <th scope="col">Métrica</th>
            <th scope="col">Rodada A</th>
            <th scope="col">Rodada B</th>
            <th scope="col">Delta absoluto e percentual</th>
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
                <th scope="row">{row.label}</th>
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

function ManualMetrics({ comparison }: { comparison: Comparison }): React.JSX.Element {
  const buildMeasured =
    comparison.metrics.buildFailuresA !== undefined &&
    comparison.metrics.buildFailuresB !== undefined &&
    comparison.metrics.buildFailuresDelta !== undefined;
  const buildRow: MetricRow = {
    label: "Falhas de build",
    valueA: comparison.metrics.buildFailuresA,
    valueB: comparison.metrics.buildFailuresB,
    delta: comparison.metrics.buildFailuresDelta,
    kind: "integer",
    trend: "lower-is-better",
  };

  return (
    <section className={`${styles.tableCard} ${styles.manualCard}`}>
      <div className={styles.tableHeader}>
        <h2>Preenchidas à mão <span className={styles.manualBadge}>LIDAS DE SCREENSHOT</span></h2>
        <p>Não existem no export do Bob e nunca são misturadas com as calculadas.</p>
      </div>
      <div className={styles.tableScroll}>
        <table className={styles.table} aria-label="Métricas preenchidas manualmente">
          <thead>
            <tr>
              <th scope="col">Métrica</th>
              <th scope="col">Rodada A</th>
              <th scope="col">Rodada B</th>
              <th scope="col">Delta absoluto e percentual</th>
            </tr>
          </thead>
          <tbody>
            {["Tokens ↑", "Tokens ↓", "Cache ↓/↑ (razão)", "Context Length %"].map(
              (label) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td className={styles.unavailable}>indisponível</td>
                  <td className={styles.unavailable}>indisponível</td>
                  <td className={styles.neutral}>— não medido</td>
                </tr>
              )
            )}
            {buildMeasured ? (
              <tr>
                <th scope="row">{buildRow.label}</th>
                <td><Value value={buildRow.valueA} kind="integer" /></td>
                <td><Value value={buildRow.valueB} kind="integer" /></td>
                <DeltaCell row={buildRow} />
              </tr>
            ) : (
              <tr>
                <th scope="row">Falhas de build</th>
                <td className={styles.unavailable}>indisponível</td>
                <td className={styles.unavailable}>indisponível</td>
                <td className={styles.neutral}>— não medido</td>
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
  return (
    <section className={styles.missingCard}>
      <div className={styles.missingContent}>
        <h2>Só a Rodada A foi carregada</h2>
        <p>
          Isso é o caminho normal, não um erro: a Rodada B só existe depois de
          aplicar as prescrições e rodar a mesma tarefa novamente.
        </p>
        <ol className={styles.missingSteps}>
          <li><strong>Rodada A carregada</strong> — {roundA.totals.assistantTurns} turnos, {integerFormatter.format(roundAFixedOverhead(roundA))} de overhead fixo</li>
          <li>Aplicar a configuração gerada pelo Hindsight</li>
          <li>Rodar a mesma tarefa em uma conversa nova</li>
          <li>Adicionar o segundo export</li>
        </ol>
        <div className={styles.actions}>
          <button type="button" className={styles.primaryButton} onClick={onAddRoundB}>Adicionar Rodada B</button>
          <button type="button" className={styles.secondaryButton} onClick={onViewPrescriptions}>Ver o que aplicar</button>
        </div>
      </div>
      <aside className={styles.hypothesis}>
        <span>Hipótese registrada</span>
        <p>projectRules sai de 0<br />Overhead fixo cai<br />Ferramentas ociosas diminuem<br />Regressões também serão reportadas</p>
        <small>Registrada antes da execução para não escolher a métrica depois de ver o número.</small>
      </aside>
    </section>
  );
}

function headline(comparison: Comparison): string {
  const { fixedOverheadA, fixedOverheadDelta } = comparison.metrics;
  const ratio = percentage(fixedOverheadDelta, fixedOverheadA);
  if (fixedOverheadDelta === 0) {
    return "O overhead fixo não mudou. Empates e regressões continuam na tabela.";
  }
  if (ratio === null) {
    return "O overhead fixo mudou a partir de uma base zero. Todos os resultados estão na tabela.";
  }
  return `O overhead fixo ${fixedOverheadDelta < 0 ? "caiu" : "aumentou"} ${percentFormatter.format(Math.abs(ratio))}%. Regressões e empates continuam visíveis.`;
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
          <p className={styles.eyebrow}>Comparativo A/B · mesma tarefa, mesmo commit</p>
          <h1>A Rodada B ainda não foi carregada.</h1>
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
        <p className={styles.eyebrow}>Comparativo A/B · mesma tarefa, mesmo commit</p>
        <h1>{headline(comparison)}</h1>
      </header>

      <section
        className={comparison.valid ? styles.validityOk : styles.validityInvalid}
        role={comparison.valid ? "status" : "alert"}
      >
        <strong>{comparison.valid ? "Experimento válido" : "Comparação experimental inválida"}</strong>
        <span>
          {comparison.valid
            ? "As regras auditáveis do protocolo coincidem entre as rodadas."
            : comparison.invalidReason ?? "O protocolo difere entre as rodadas."}
        </span>
      </section>

      <section className={styles.summaryCards} aria-label="Destaques da comparação">
        {[overhead, cost, projectRules].map((row) => {
          const delta = deltaLabel(row);
          return (
            <article key={row.label} className={row.trend === "intentional-increase" ? styles.intentionalCard : styles.summaryCard}>
              <span>{row.label}</span>
              <strong>{signedValue(row.delta ?? 0, row.kind)}</strong>
              <b className={delta.className}><span aria-hidden="true">{delta.symbol}</span> {delta.text.split(" · ").slice(1).join(" · ")}</b>
              <small><Value value={row.valueA} kind={row.kind} display={row.displayA} /> → <Value value={row.valueB} kind={row.kind} display={row.displayB} /></small>
            </article>
          );
        })}
      </section>

      <section className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h2>Calculadas pelo Hindsight</h2>
          <p>Derivadas do export, campo a campo. Auditáveis.</p>
        </div>
        <MetricTable rows={rows} label="Métricas calculadas pelo Hindsight" />
      </section>

      <ManualMetrics comparison={comparison} />

      <footer className={styles.notes}>
        <span>Melhora e piora aparecem como palavra e seta, além da cor.</span>
        <span>Métricas sem mudança permanecem na tabela: delta zero também é resultado.</span>
      </footer>
    </main>
  );
}
