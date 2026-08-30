import React, { useId, useMemo, useRef, useState } from "react";
import sampleExport from "../../fixtures/sample-export.json?raw";
import rodadaBExport from "../../benchmark/rodada-b.json?raw";
import { compare } from "../compare";
import {
  prescribeAgentsMd,
  prescribeMcpEnablement,
  prescribeOverheadReduction,
} from "../prescribe";
import {
  analyzeExport,
  type AnalysisError,
  type AnalyzedExport,
} from "./analysis";
import { readFileText } from "./file-reader";
import styles from "./App.module.css";
import { FindingsScreen } from "./FindingsScreen";
import { PrescriptionScreen } from "./PrescriptionScreen";
import { ComparisonScreen } from "./ComparisonScreen";
import ContextWindowScreen from "./ContextWindowScreen";

const DEMO_MAX_CONTEXT_WINDOW = 270_000;

type Theme = "light" | "dark";
type Screen = "input" | "diagnosis" | "findings" | "prescriptions" | "comparison";

interface LoadedAnalysis extends AnalyzedExport {
  id: number;
}

interface InputError extends AnalysisError {
  id: number;
}

export interface AppProps {
  readText?: (file: File) => Promise<string>;
  exampleContent?: string;
  exampleContentB?: string;
}

function roundLabel(index: number): string {
  if (index === 0) return "Round A";
  if (index === 1) return "Round B";
  return `Session ${index + 1}`;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

export default function App({
  readText = readFileText,
  exampleContent = sampleExport,
  exampleContentB = rodadaBExport,
}: AppProps): React.JSX.Element {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const [theme, setTheme] = useState<Theme>("light");
  const [activeScreen, setActiveScreen] = useState<Screen>("input");
  const [analyses, setAnalyses] = useState<LoadedAnalysis[]>([]);
  const [errors, setErrors] = useState<InputError[]>([]);
  const [loadingNames, setLoadingNames] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);

  const loading = loadingNames.length > 0;
  const canCompare = analyses.length >= 2;
  const hasCrossSessionEvidence = analyses.length >= 3;

  function withId(value: AnalyzedExport): LoadedAnalysis {
    return { ...value, id: nextId.current++ };
  }

  function errorWithId(error: AnalysisError): InputError {
    return { ...error, id: nextId.current++ };
  }

  async function loadFiles(files: readonly File[]): Promise<void> {
    if (files.length === 0 || loading) return;

    setDragActive(false);
    setErrors([]);
    setLoadingNames(files.map((file) => file.name));

    const results = await Promise.all(
      files.map(async (file) => {
        try {
          const raw = await readText(file);
          return analyzeExport(raw, file.name, "file");
        } catch {
          return {
            ok: false as const,
            error: {
              fileName: file.name,
              code: "analysis-failed" as const,
              message:
                "The file could not be read. Select it again or generate a new export in IBM Bob.",
            },
          };
        }
      })
    );

    const accepted = results
      .filter((result) => result.ok)
      .map((result) => withId(result.value));
    const rejected = results
      .filter((result) => !result.ok)
      .map((result) => errorWithId(result.error));

    if (accepted.length > 0) setAnalyses((current) => [...current, ...accepted]);
    setErrors(rejected);
    setLoadingNames([]);
  }

  async function loadExample(): Promise<void> {
    if (loading) return;

    nextId.current = 1;
    setAnalyses([]);
    setErrors([]);
    setLoadingNames(["sample-export.json", "rodada-b.json"]);
    await nextFrame();

    const resultA = analyzeExport(
      exampleContent,
      "sample-export.json",
      "demo",
      DEMO_MAX_CONTEXT_WINDOW
    );
    const resultB = analyzeExport(
      exampleContentB,
      "rodada-b.json",
      "demo",
      DEMO_MAX_CONTEXT_WINDOW
    );

    const newAnalyses = [];
    const newErrors = [];
    if (resultA.ok) newAnalyses.push(withId(resultA.value));
    else newErrors.push(errorWithId(resultA.error));
    
    if (resultB.ok) newAnalyses.push(withId(resultB.value));
    else newErrors.push(errorWithId(resultB.error));

    if (newAnalyses.length > 0) setAnalyses(newAnalyses);
    if (newErrors.length > 0) setErrors(newErrors);
    setLoadingNames([]);
  }

  function clearAnalyses(): void {
    nextId.current = 1;
    setAnalyses([]);
    setErrors([]);
    setLoadingNames([]);
    setDragActive(false);
    setActiveScreen("input");
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleDrop(event: React.DragEvent<HTMLElement>): void {
    event.preventDefault();
    if (loading) return;
    void loadFiles(Array.from(event.dataTransfer.files));
  }

  const selectedAnalysis = analyses[0];
  const prescriptions = selectedAnalysis
    ? [
        ...prescribeAgentsMd(selectedAnalysis.diagnosis.findings),
        ...prescribeOverheadReduction(selectedAnalysis.diagnosis.findings),
        ...prescribeMcpEnablement(selectedAnalysis.diagnosis.findings),
      ]
    : [];
  const contextPressure =
    selectedAnalysis?.report.tasks
      .map((task) => task.context.pressure)
      .find((pressure) => pressure !== null) ?? null;
  const rootContext = selectedAnalysis?.report.tasks.find((task) => !task.isSubtask)?.context;
  const comparison = useMemo(
    () =>
      analyses[0] !== undefined && analyses[1] !== undefined
        ? compare(analyses[0].report, analyses[1].report)
        : null,
    [analyses]
  );

  return (
    <div className={styles.app} data-theme={theme}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.brandBlock}>
            <span className={styles.brand}>Hindsight</span>
            <span className={styles.divider} aria-hidden="true" />
            <span className={styles.currentFile}>
              {analyses[0]?.fileName ?? "no file"}
            </span>
          </div>

          <nav aria-label="Analysis steps" className={styles.steps}>
            {["Input", "Diagnosis", "Findings", "Prescriptions", "Comparison"].map(
              (step, index) => {
                const isInput = index === 0;
                const isDiagnosis = index === 1;
                const isFindings = index === 2;
                const isPrescriptions = index === 3;
                const isComparison = index === 4;
                const enabled =
                  isInput ||
                  ((isDiagnosis || isFindings || isPrescriptions || isComparison) &&
                    selectedAnalysis !== undefined);
                const active =
                  (isInput && activeScreen === "input") ||
                  (isDiagnosis && activeScreen === "diagnosis") ||
                  (isFindings && activeScreen === "findings") ||
                  (isPrescriptions && activeScreen === "prescriptions") ||
                  (isComparison && activeScreen === "comparison");
                return (
                  <button
                    key={step}
                    type="button"
                    className={active ? styles.activeStep : styles.step}
                    disabled={!enabled}
                    aria-current={active ? "step" : undefined}
                    onClick={() => {
                      if (isInput) setActiveScreen("input");
                      if (isDiagnosis && selectedAnalysis) {
                        setActiveScreen("diagnosis");
                      }
                      if (isFindings && selectedAnalysis) {
                        setActiveScreen("findings");
                      }
                      if (isPrescriptions && selectedAnalysis) {
                        setActiveScreen("prescriptions");
                      }
                      if (isComparison && selectedAnalysis) {
                        setActiveScreen("comparison");
                      }
                    }}
                  >
                    {index + 1} · {step}
                  </button>
                );
              }
            )}
          </nav>

          <div className={styles.headerActions}>
            <span className={styles.privacyCompact}>
              <span className={styles.statusDot} aria-hidden="true" />
              The file never leaves this browser
            </span>
            <button
              type="button"
              className={styles.themeButton}
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              aria-label="Toggle theme"
            >
              {theme === "light" ? "Dark theme" : "Light theme"}
            </button>
          </div>
        </div>
        <div className={styles.progressTrack} aria-hidden="true">
          <div
            className={styles.progressValue}
            style={{
              width:
                activeScreen === "comparison"
                  ? "100%"
                  : activeScreen === "prescriptions"
                  ? "80%"
                  : activeScreen === "findings"
                    ? "60%"
                    : activeScreen === "diagnosis"
                      ? "40%"
                      : "20%",
            }}
          />
        </div>
      </header>

      {activeScreen === "diagnosis" && rootContext ? (
        <ContextWindowScreen context={rootContext} />
      ) : activeScreen === "findings" && selectedAnalysis ? (
        <FindingsScreen findings={selectedAnalysis.diagnosis.findings} />
      ) : activeScreen === "prescriptions" && selectedAnalysis ? (
        <main className={styles.prescriptionMain}>
          <PrescriptionScreen
            prescriptions={prescriptions}
            findings={selectedAnalysis.diagnosis.findings}
            existingAgentsMd={null}
            contextPressure={contextPressure}
          />
        </main>
      ) : activeScreen === "comparison" && selectedAnalysis ? (
        <ComparisonScreen
          comparison={comparison}
          roundA={selectedAnalysis.report}
          onAddRoundB={() => {
            setActiveScreen("input");
            window.setTimeout(() => inputRef.current?.click(), 0);
          }}
          onViewPrescriptions={() => setActiveScreen("prescriptions")}
        />
      ) : (
        <main className={styles.main}>
          <section className={styles.intro}>
            <h1>The retrospective your agent session never had</h1>
            <p>
              Drop the JSON export of an IBM Bob session. Hindsight shows where
              the configuration wastes context and money, generates the corrected
              configuration and sets up the comparison between rounds.
            </p>
          </section>

        {loading ? (
          <section className={styles.loadingPanel} aria-busy="true" aria-live="polite">
            <span className={styles.spinner} aria-hidden="true" />
            <h2>
              Analyzing <code>{loadingNames.join(", ")}</code>
            </h2>
            <p>Not a single byte left your machine.</p>
            <ol className={styles.loadingSteps}>
              <li>Validating the export format</li>
              <li>Extracting context and tool metrics</li>
              <li>Running the available detectors</li>
            </ol>
          </section>
        ) : (
          <section
            className={`${styles.dropzone} ${dragActive ? styles.dropzoneActive : ""}`}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            data-testid="dropzone"
          >
            <div className={styles.dropIcon} aria-hidden="true">↓</div>
            <h2>Drop your export files here</h2>
            <p>or pick them from your computer · JSON</p>
            <div className={styles.dropActions}>
              <button type="button" className={styles.primaryButton} onClick={() => void loadExample()}>
                See an example — real session, built in
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => inputRef.current?.click()}
              >
                Select files
              </button>
                <input
                ref={inputRef}
                id={inputId}
                className={styles.fileInput}
                type="file"
                accept=".json,application/json"
                multiple
                aria-label="Select JSON exports from IBM Bob"
                onChange={(event) => {
                  void loadFiles(Array.from(event.currentTarget.files ?? []));
                  event.currentTarget.value = "";
                }}
              />
            </div>
            <small>Nothing to install, no account, no API key.</small>
          </section>
        )}

        <section className={styles.capabilities} aria-label="Capabilities by number of files">
          <article className={styles.capabilityCard}>
            <strong>1 file</strong>
            <span>Full session diagnosis</span>
          </article>
          <article className={styles.capabilityCard}>
            <strong>2 files</strong>
            <span>A/B comparison of the same task</span>
          </article>
          <article className={styles.privacyCard}>
            <strong><span className={styles.statusDot} aria-hidden="true" />100% local processing</strong>
            <span>
              The export can contain code, paths and commands. No file is uploaded
              or stored; the analysis runs offline in this browser.
            </span>
          </article>
        </section>

        {errors.length > 0 && (
          <section className={styles.errorList} aria-label="Rejected files" aria-live="polite">
            {errors.map((error) => (
              <article className={styles.errorCard} key={error.id}>
                <span className={styles.errorIcon} aria-hidden="true">!</span>
                <div>
                  <h2>
                    {error.code === "not-bob-export"
                      ? "Valid JSON, but not a Bob session export"
                      : "We could not read this file"}
                  </h2>
                  <p><code>{error.fileName}</code> — {error.message}</p>
                </div>
              </article>
            ))}
          </section>
        )}

        {analyses.length > 0 && (
          <section className={styles.results} aria-label="Analyzed files">
            <div className={styles.resultsHeader}>
              <div>
                <span className={styles.eyebrow}>Input complete</span>
                <h2>{analyses.length} {analyses.length === 1 ? "session analyzed" : "sessions analyzed"}</h2>
              </div>
              <button type="button" className={styles.clearButton} onClick={clearAnalyses}>
                Clear analyses
              </button>
            </div>

            <ol className={styles.analysisList}>
              {analyses.map((analysis, index) => (
                <li key={analysis.id} className={styles.analysisCard}>
                  <div>
                    <span className={styles.roundBadge}>{roundLabel(index)}</span>
                    {analysis.source === "demo" && <span className={styles.demoBadge}>Example</span>}
                  </div>
                  <code>{analysis.fileName}</code>
                  <span>
                    {analysis.report.totals.taskCount} task · {analysis.report.totals.assistantTurns} turns · {analysis.diagnosis.findings.length} findings
                  </span>
                </li>
              ))}
            </ol>

            <div className={styles.readiness} role="status">
              <p>
                <strong>Diagnosis ready.</strong>{" "}
                {canCompare
                  ? "Rounds A and B identified; the comparison is enabled."
                  : "Add a Round B to enable the comparison."}
              </p>
              {hasCrossSessionEvidence && (
                <p>Three or more sessions available for future recurring analyses.</p>
              )}
            </div>
          </section>
        )}
        </main>
      )}
    </div>
  );
}
