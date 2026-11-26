/**
 * DiagnoseScreen — unified step 2 of Load → Diagnose → Fix → Compare.
 *
 * Combines the former Diagnosis (context window) and Findings screens into
 * three ordered parts with zero duplication:
 *  1. Summary row: fixed overhead, conversation, reported context & pressure
 *  2. Context composition stacked bar + legend
 *  3. Findings grouped by type, each with a "See fix →" link to its prescription
 */

import React, { useId } from "react";
import type {
  ContextSummary,
  Finding,
  Prescription,
  TaskReport,
} from "../domain/types";
import ContextWindowScreen from "./ContextWindowScreen";
import { FindingsScreen } from "./FindingsScreen";
import { formatTokens } from "./format";
import { Glossary } from "./Glossary";
import styles from "./DiagnoseScreen.module.css";

export interface DiagnoseScreenProps {
  context: ContextSummary | null;
  findings: readonly Finding[];
  prescriptions: readonly Prescription[];
  onNavigateToPrescription: (prescriptionId: string) => void;
  focusedFindingId?: string | null;
  /** Root tasks in the export; when more than 1, renders a "Task N of M" selector. */
  tasks?: readonly TaskReport[];
  selectedTaskIndex?: number;
  onSelectTaskIndex?: (index: number) => void;
  /** Context window size input controls passed to ContextWindowScreen. */
  maxContextWindowInput?: string;
  onMaxContextWindowChange?: (value: string) => void;
  contextWindowAssumed?: boolean;
}

export function DiagnoseScreen({
  context,
  findings,
  prescriptions,
  onNavigateToPrescription,
  focusedFindingId = null,
  tasks,
  selectedTaskIndex = 0,
  onSelectTaskIndex,
  maxContextWindowInput,
  onMaxContextWindowChange,
  contextWindowAssumed = false,
}: DiagnoseScreenProps): React.JSX.Element {
  const taskSelectId = useId();
  const hasMultipleTasks =
    tasks !== undefined && tasks.length > 1 && onSelectTaskIndex !== undefined;

  const heading =
    context !== null
      ? `${formatTokens(context.fixedOverhead)} of fixed overhead before work begins`
      : "Context & findings";

  return (
    <main className={styles.screen} data-testid="diagnose-screen">
      <header className={styles.header}>
        <div className={styles.headerRow}>
          <div>
            <div className={styles.eyebrow}>Diagnose</div>
            <h1 className={styles.heading}>{heading}</h1>
          </div>

          {hasMultipleTasks && (
            <div className={styles.taskSelector}>
              <label htmlFor={taskSelectId} className={styles.taskSelectorLabel}>
                Task {selectedTaskIndex + 1} of {tasks.length}
              </label>
              <select
                id={taskSelectId}
                aria-label="Select task"
                className={styles.taskSelect}
                value={selectedTaskIndex}
                onChange={(event) =>
                  onSelectTaskIndex(Number(event.currentTarget.value))
                }
                data-testid="task-selector"
              >
                {tasks.map((task, index) => (
                  <option key={task.taskId} value={index}>
                    Task {index + 1} of {tasks.length}
                    {task.context === null ? " (context unavailable)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </header>

      <Glossary />

      {context !== null ? (
        <ContextWindowScreen
          context={context}
          embedded
          maxContextWindowInput={maxContextWindowInput}
          onMaxContextWindowChange={onMaxContextWindowChange}
          contextWindowAssumed={contextWindowAssumed}
        />
      ) : (
        <section
          className={styles.unavailableCard}
          data-testid="diagnosis-empty-state"
          aria-label="Context window breakdown unavailable"
        >
          <h2>Context window breakdown unavailable</h2>
          <p>
            This task has no <code>contextWindowBreakdown</code>. IBM Bob drops
            the breakdown once a task reaches status completed, so this is a
            normal export state rather than an error. Findings remain available
            below.
          </p>
        </section>
      )}

      <FindingsScreen
        findings={findings}
        prescriptions={prescriptions}
        onNavigateToPrescription={onNavigateToPrescription}
        focusedFindingId={focusedFindingId}
        embedded
      />
    </main>
  );
}
