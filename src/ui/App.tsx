import React from "react";
import styles from "./App.module.css";
import ContextWindowScreen from "./ContextWindowScreen";
import type { ContextSummary } from "../domain/types";

// ---------------------------------------------------------------------------
// Baseline example from fixtures/sample-export.json (rodada-a baseline).
// Used as the demo / placeholder state when no file has been loaded.
// Values are read-only constants — not derived at runtime from the file.
// maxContextWindow is supplied by the UI (not present in the export).
// ---------------------------------------------------------------------------
const BASELINE_CONTEXT: ContextSummary = {
  fixedOverhead: 10439,
  reportedTotal: 17584,
  conversationTokens: 7145,
  reportedTotalInconsistent: false,
  breakdown: {
    roleDefinition:     34,
    staticSections:     563,
    skills:             1541,
    baseRules:          197,
    projectRules:       0,
    customInstructions: 160,
    environment:        71,
    toolSystemPrompts:  2470,
    toolDefinitions:    5403,
    mcpToolDefinitions: 0,
  },
  breakdownPct: {
    roleDefinition:     (34   / 10439) * 100,
    staticSections:     (563  / 10439) * 100,
    skills:             (1541 / 10439) * 100,
    baseRules:          (197  / 10439) * 100,
    projectRules:       0,
    customInstructions: (160  / 10439) * 100,
    environment:        (71   / 10439) * 100,
    toolSystemPrompts:  (2470 / 10439) * 100,
    toolDefinitions:    (5403 / 10439) * 100,
    mcpToolDefinitions: 0,
  },
  breakdownSumDelta: 0,
  breakdownSumConsistent: true,
  loadedSkills: [],
  maxContextWindow: 270000,
  pressure: 17584 / 270000,
};

export default function App(): React.JSX.Element {
  const [showDemo, setShowDemo] = React.useState(false);

  if (showDemo) {
    return (
      <div
        style={{
          background: "#eceef0",
          minHeight: "100vh",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif",
        }}
      >
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 20,
            background: "#fcfcfd",
            borderBottom: "1px solid #dcdfe3",
          }}
        >
          <div
            style={{
              maxWidth: 1180,
              margin: "0 auto",
              padding: "14px 28px",
              display: "flex",
              alignItems: "center",
              gap: 18,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: "-0.03em",
              }}
            >
              Hindsight
            </span>
            <button
              type="button"
              onClick={() => setShowDemo(false)}
              style={{
                border: "1px solid #dcdfe3",
                background: "#fff",
                color: "#4a525b",
                padding: "6px 12px",
                borderRadius: 5,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              ← Voltar
            </button>
          </div>
        </div>
        <ContextWindowScreen context={BASELINE_CONTEXT} />
      </div>
    );
  }

  return (
    <main className={styles.wrapper}>
      <h1 className={styles.title}>Hindsight</h1>
      <div className={styles.dropzone} aria-disabled="true">
        <p className={styles.dropzoneText}>
          Arraste um export do Bob aqui para analisar
        </p>
        <button type="button" disabled className={styles.dropzoneButton}>
          Selecionar arquivo
        </button>
      </div>
      <button
        type="button"
        onClick={() => setShowDemo(true)}
        style={{
          marginTop: "1.5rem",
          padding: "0.6rem 1.5rem",
          border: "1px solid #dcdfe3",
          borderRadius: 6,
          background: "#20262c",
          color: "#fff",
          fontSize: 14,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
        data-testid="demo-button"
      >
        Ver diagnóstico — sessão de exemplo
      </button>
    </main>
  );
}
