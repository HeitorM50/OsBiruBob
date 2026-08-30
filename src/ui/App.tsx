import React from "react";
import sampleExport from "../../fixtures/sample-export.json";
import existingAgentsMd from "../../AGENTS.md?raw";
import { diagnoseWithCatalogs } from "../diagnose";
import { observe } from "../observe";
import { parseSession } from "../parser";
import {
  prescribeAgentsMd,
  prescribeMcpEnablement,
  prescribeOverheadReduction,
} from "../prescribe";
import styles from "./App.module.css";
import { PrescriptionScreen } from "./PrescriptionScreen";

const DEMO_MAX_CONTEXT_WINDOW = 270_000;

function createDemoModel() {
  const parsed = parseSession(JSON.stringify(sampleExport));
  if (!parsed.ok) return parsed;

  const report = observe(parsed.value, DEMO_MAX_CONTEXT_WINDOW);
  const diagnosed = diagnoseWithCatalogs(report);
  const prescriptions = [
    ...prescribeAgentsMd(diagnosed.findings),
    ...prescribeOverheadReduction(diagnosed.findings),
    ...prescribeMcpEnablement(diagnosed.findings),
  ];
  const contextPressure =
    report.tasks.map((task) => task.context.pressure).find((value) => value !== null) ??
    null;

  return {
    ok: true as const,
    findings: diagnosed.findings,
    prescriptions,
    contextPressure,
  };
}

const demo = createDemoModel();

export default function App(): React.JSX.Element {
  if (!demo.ok) {
    return (
      <main className={styles.error} role="alert">
        <h1>Hindsight</h1>
        <p>Could not load the bundled example: {demo.error.message}</p>
      </main>
    );
  }

  return (
    <div className={styles.app}>
      <header className={styles.topbar}>
        <strong className={styles.brand}>Hindsight</strong>
        <span className={styles.divider} aria-hidden="true" />
        <code className={styles.filename}>rodada-a.json</code>
        <span className={styles.privacy}>● The file never leaves this browser</span>
      </header>
      <main>
        <PrescriptionScreen
          prescriptions={demo.prescriptions}
          findings={demo.findings}
          existingAgentsMd={existingAgentsMd}
          contextPressure={demo.contextPressure}
        />
      </main>
    </div>
  );
}
