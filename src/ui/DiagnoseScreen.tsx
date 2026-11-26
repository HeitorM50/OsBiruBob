/**
 * DiagnoseScreen — unified step 2 of Load → Diagnose → Fix → Compare.
 *
 * Combines the former Diagnosis (context window) and Findings screens into
 * three ordered parts with zero duplication:
 *  1. Summary row: fixed overhead, conversation, reported context & pressure
 *  2. Context composition stacked bar + legend
 *  3. Findings grouped by type, each with a "See fix →" link to its prescription
 */

import React from "react";
import type { ContextSummary, Finding, Prescription } from "../domain/types";
import ContextWindowScreen from "./ContextWindowScreen";
import { FindingsScreen } from "./FindingsScreen";
import styles from "./DiagnoseScreen.module.css";

export interface DiagnoseScreenProps {
  context: ContextSummary | null;
  findings: readonly Finding[];
  prescriptions: readonly Prescription[];
  onNavigateToPrescription: (prescriptionId: string) => void;
  focusedFindingId?: string | null;
}

export function DiagnoseScreen({
  context,
  findings,
  prescriptions,
  onNavigateToPrescription,
  focusedFindingId = null,
}: DiagnoseScreenProps): React.JSX.Element {
  return (
    <main className={styles.screen} data-testid="diagnose-screen">
      <header className={styles.header}>
        <div className={styles.eyebrow}>Diagnose</div>
        <h1 className={styles.heading}>Context &amp; findings</h1>
      </header>

      {context !== null ? (
        <ContextWindowScreen context={context} embedded />
      ) : (
        <section
          className={styles.unavailableCard}
          data-testid="diagnosis-empty-state"
          aria-label="Context window breakdown unavailable"
        >
          <h2>Context window breakdown unavailable</h2>
          <p>
            This export has no root task with a <code>contextWindowBreakdown</code>.
            IBM Bob drops the breakdown once a task reaches status completed, so
            this is a normal export state rather than an error. Findings remain
            available below.
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
