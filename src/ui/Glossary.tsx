import React from "react";
import type { BreakdownDetail } from "../domain/types";
import styles from "./Glossary.module.css";

/** Human-readable labels for raw contextWindowBreakdown.breakdown keys. */
export const BREAKDOWN_FIELD_LABELS: Readonly<
  Record<keyof BreakdownDetail, string>
> = {
  toolDefinitions: "Tool definitions",
  toolSystemPrompts: "Tool system prompts",
  skills: "Skills",
  staticSections: "Static prompt sections",
  baseRules: "Base rules",
  projectRules: "Project rules",
  customInstructions: "Custom instructions",
  environment: "Environment info",
  roleDefinition: "Role definition",
  mcpToolDefinitions: "MCP tool definitions",
};

export function breakdownFieldLabel(key: string): string {
  return (
    (BREAKDOWN_FIELD_LABELS as Record<string, string | undefined>)[key] ?? key
  );
}

interface GlossaryEntry {
  term: string;
  definition: string;
}

const GLOSSARY_ENTRIES: readonly GlossaryEntry[] = [
  {
    term: "Fixed overhead",
    definition:
      "Tokens loaded automatically on every turn before work starts — tool definitions, tool prompts, Skills, system sections, rules, and environment info. Read from contextWindowBreakdown.total.",
  },
  {
    term: "Conversation",
    definition:
      "Tokens used by the task dialogue itself — your prompt, assistant responses, tool calls, and tool outputs (reported context minus fixed overhead).",
  },
  {
    term: "Context window",
    definition:
      "The maximum number of tokens the model can hold in one turn. IBM Bob exports do not include this limit, so you can enter your model's window size to compute pressure.",
  },
  {
    term: "Context pressure",
    definition:
      "Percentage of the context window occupied at the end of the task (reported context divided by context window). Shown as unavailable when no window size is provided.",
  },
  {
    term: "Confidence",
    definition:
      "How direct the evidence behind a finding is: High comes directly from export fields, Medium matches a curated catalogue or pattern, and Low is a heuristic signal.",
  },
  {
    term: "Estimate vs measured",
    definition:
      "Measured values come straight from fields recorded in the export. Estimate values are calculated from a stated heuristic — hover or focus the estimate badge to inspect the formula.",
  },
];

export function Glossary(): React.JSX.Element {
  return (
    <details className={styles.glossary} data-testid="glossary">
      <summary className={styles.summary}>
        Glossary — what these terms mean
      </summary>
      <dl className={styles.list}>
        {GLOSSARY_ENTRIES.map((entry) => (
          <div key={entry.term} className={styles.item}>
            <dt className={styles.term}>{entry.term}</dt>
            <dd className={styles.definition}>{entry.definition}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
