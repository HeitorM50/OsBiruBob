/**
 * Shared en-US presentation formatters for the Hindsight UI.
 *
 * Domain modules never round (AGENTS.md invariant I-3). All display rounding
 * and unit formatting happens here so every screen formats tokens, percentages,
 * currency, and durations consistently.
 */

const integerFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 6,
  maximumFractionDigits: 6,
});

const estimatedCostFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});

/** Format a number as a rounded en-US integer (e.g. 10439 → "10,439"). */
export function formatInteger(value: number): string {
  return integerFormatter.format(Math.round(value));
}

/** Format a token count with unit (e.g. 10439 → "10,439 tokens"). */
export function formatTokens(value: number): string {
  return `${formatInteger(value)} tokens`;
}

/** Format a percentage value already in 0–100 scale (e.g. 51.756 → "51.8%"). */
export function formatPercent(value: number): string {
  return `${percentFormatter.format(value)}%`;
}

/** Format a USD cost at 6-decimal precision (e.g. 0.336902 → "$0.336902"). */
export function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

/** Format an estimated USD cost (e.g. 0.42 → "$0.42", 0.00425 → "$0.00425"). */
export function formatEstimatedCost(value: number): string {
  return estimatedCostFormatter.format(value);
}

/** Format milliseconds as rounded whole seconds (e.g. 566000 → "566 s"). */
export function formatDurationSeconds(ms: number): string {
  return `${formatInteger(ms / 1000)} s`;
}

/** Format a context window size with unit (e.g. 270000 → "270k tokens", 128500 → "128,500 tokens"). */
export function formatWindowSize(tokens: number): string {
  if (tokens >= 1000 && tokens % 1000 === 0) {
    return `${formatInteger(tokens / 1000)}k tokens`;
  }
  return formatTokens(tokens);
}
