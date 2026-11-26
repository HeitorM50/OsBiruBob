import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import sampleExport from "../../fixtures/sample-export.json?raw";
import rodadaBExport from "../../benchmark/rodada-b.json?raw";
import { compare } from "../compare";
import {
  prescribeAgentsMd,
  prescribeCustomMode,
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
import { DiagnoseScreen } from "./DiagnoseScreen";
import { PrescriptionScreen } from "./PrescriptionScreen";
import { ComparisonScreen } from "./ComparisonScreen";

const DEMO_MAX_CONTEXT_WINDOW = 270_000;

type Theme = "light" | "dark";
type Screen = "load" | "diagnose" | "fix" | "compare";
type UploadMode = "replace" | "add-round-b";

const STEPS: ReadonlyArray<{ id: Screen; label: string }> = [
  { id: "load", label: "Load" },
  { id: "diagnose", label: "Diagnose" },
  { id: "fix", label: "Fix" },
  { id: "compare", label: "Compare" },
];

function getInitialTheme(): Theme {
  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return "light";
}

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
  const uploadModeRef = useRef<UploadMode>("replace");
  const nextId = useRef(1);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [activeScreen, setActiveScreen] = useState<Screen>("load");
  const [focusedFindingId, setFocusedFindingId] = useState<string | null>(null);
  const [focusedPrescriptionId, setFocusedPrescriptionId] = useState<
    string | null
  >(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  function toggleTheme(): void {
    setTheme((current) => (current === "light" ? "dark" : "light"));
  }

  // Each step is a separate page, not a section of one long document. Without
  // this, switching steps while scrolled down keeps the old offset and the new
  // screen opens on blank space or halfway through its content.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [activeScreen]);

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

  async function loadFiles(
    files: readonly File[],
    mode: UploadMode = "replace"
  ): Promise<void> {
    if (files.length === 0 || loading) return;

    setDragActive(false);
    setErrors([]);
    setFocusedFindingId(null);
    setFocusedPrescriptionId(null);
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

    setErrors(rejected);
    if (rejected.length > 0) {
      setActiveScreen("load");
    } else if (accepted.length > 0) {
      if (mode === "add-round-b") {
        setAnalyses((current) =>
          current.length > 0 ? [current[0], ...accepted] : accepted
        );
      } else {
        setAnalyses(accepted);
      }
      setActiveScreen(mode === "add-round-b" ? "compare" : "diagnose");
    }
    setLoadingNames([]);
  }

  async function loadExample(): Promise<void> {
    if (loading) return;

    nextId.current = 1;
    setAnalyses([]);
    setErrors([]);
    setFocusedFindingId(null);
    setFocusedPrescriptionId(null);
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

    if (newErrors.length > 0) {
      setErrors(newErrors);
      setActiveScreen("load");
    } else if (newAnalyses.length > 0) {
      setAnalyses(newAnalyses);
      setActiveScreen("diagnose");
    }
    setLoadingNames([]);
  }

  function clearAnalyses(): void {
    nextId.current = 1;
    setAnalyses([]);
    setErrors([]);
    setLoadingNames([]);
    setDragActive(false);
    setFocusedFindingId(null);
    setFocusedPrescriptionId(null);
    setActiveScreen("load");
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleDrop(event: React.DragEvent<HTMLElement>): void {
    event.preventDefault();
    if (loading) return;
    void loadFiles(Array.from(event.dataTransfer.files));
  }

  function navigateToPrescription(prescriptionId: string): void {
    setFocusedFindingId(null);
    setFocusedPrescriptionId(prescriptionId);
    setActiveScreen("fix");
  }

  function navigateToFinding(findingId: string): void {
    setFocusedPrescriptionId(null);
    setFocusedFindingId(findingId);
    setActiveScreen("diagnose");
  }

  const selectedAnalysis = analyses[0];

  const prescriptions = useMemo(() => {
    if (!selectedAnalysis) return [];
    const rootTaskIds = selectedAnalysis.report.tasks
      .filter((task) => task.parentId === null)
      .map((task) => task.taskId);
    const { findings } = selectedAnalysis.diagnosis;
    return [
      ...prescribeAgentsMd(findings, { rootTaskIds }),
      ...prescribeCustomMode(findings),
      ...prescribeOverheadReduction(findings),
      ...prescribeMcpEnablement(findings),
    ];
  }, [selectedAnalysis]);

  // Prefer a root task that actually carries a breakdown: completed tasks in a
  // multi-task export have none, and the Diagnose screen needs one to render.
  const rootContext =
    selectedAnalysis?.report.tasks.find(
      (task) => task.parentId === null && task.context !== null
    )?.context ?? null;

  const comparison = useMemo(
    () =>
      analyses[0] !== undefined && analyses[1] !== undefined
        ? compare(analyses[0].report, analyses[1].report)
        : null,
    [analyses]
  );

  const progressWidth =
    activeScreen === "compare"
      ? "100%"
      : activeScreen === "fix"
        ? "75%"
        : activeScreen === "diagnose"
          ? "50%"
          : "25%";

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
            {STEPS.map((step, index) => {
              const enabled =
                step.id === "load" || selectedAnalysis !== undefined;
              const active = activeScreen === step.id;
              return (
                <button
                  key={step.id}
                  type="button"
                  className={active ? styles.activeStep : styles.step}
                  disabled={!enabled}
                  aria-current={active ? "step" : undefined}
                  onClick={() => {
                    if (!enabled) return;
                    setFocusedFindingId(null);
                    setFocusedPrescriptionId(null);
                    setActiveScreen(step.id);
                  }}
                >
                  {index + 1} · {step.label}
                </button>
              );
            })}
          </nav>

          <div className={styles.headerActions}>
            <span className={styles.privacyCompact}>
              <span className={styles.statusDot} aria-hidden="true" />
              The file never leaves this browser
            </span>
            <button
              type="button"
              className={styles.themeButton}
              onClick={toggleTheme}
              aria-label="Toggle theme"
            >
              {theme === "light" ? "Dark theme" : "Light theme"}
            </button>
          </div>
        </div>
        <div className={styles.progressTrack} aria-hidden="true">
          <div
            className={styles.progressValue}
            style={{ width: progressWidth }}
          />
        </div>
      </header>

      <input
        ref={inputRef}
        id={inputId}
        className={styles.fileInput}
        type="file"
        accept=".json,application/json"
        multiple
        aria-label="Select JSON exports from IBM Bob"
        onChange={(event) => {
          const mode = uploadModeRef.current;
          uploadModeRef.current = "replace";
          void loadFiles(Array.from(event.currentTarget.files ?? []), mode);
          event.currentTarget.value = "";
        }}
      />

      {activeScreen === "diagnose" && selectedAnalysis ? (
        <DiagnoseScreen
          context={rootContext}
          findings={selectedAnalysis.diagnosis.findings}
          prescriptions={prescriptions}
          onNavigateToPrescription={navigateToPrescription}
          focusedFindingId={focusedFindingId}
        />
      ) : activeScreen === "fix" && selectedAnalysis ? (
        <main className={styles.prescriptionMain}>
          <PrescriptionScreen
            prescriptions={prescriptions}
            findings={selectedAnalysis.diagnosis.findings}
            existingAgentsMd={null}
            onNavigateToFinding={navigateToFinding}
            focusedPrescriptionId={focusedPrescriptionId}
          />
        </main>
      ) : activeScreen === "compare" && selectedAnalysis ? (
        <ComparisonScreen
          comparison={comparison}
          roundA={selectedAnalysis.report}
          onAddRoundB={() => {
            uploadModeRef.current = "add-round-b";
            inputRef.current?.click();
          }}
          onViewPrescriptions={() => {
            setFocusedPrescriptionId(null);
            setActiveScreen("fix");
          }}
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
            <section
              className={styles.loadingPanel}
              aria-busy="true"
              aria-live="polite"
            >
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
              <div className={styles.dropIcon} aria-hidden="true">
                ↓
              </div>
              <h2>Drop your export files here</h2>
              <p>or pick them from your computer · JSON</p>
              <div className={styles.dropActions}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => void loadExample()}
                >
                  See an example — real session, built in
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => {
                    uploadModeRef.current = "replace";
                    inputRef.current?.click();
                  }}
                >
                  Select files
                </button>
              </div>
              <small>Nothing to install, no account, no API key.</small>
            </section>
          )}

          <section
            className={styles.capabilities}
            aria-label="Capabilities by number of files"
          >
            <article className={styles.capabilityCard}>
              <strong>1 file</strong>
              <span>Full session diagnosis</span>
            </article>
            <article className={styles.capabilityCard}>
              <strong>2 files</strong>
              <span>A/B comparison of the same task</span>
            </article>
            <article className={styles.privacyCard}>
              <strong>
                <span className={styles.statusDot} aria-hidden="true" />
                100% local processing
              </strong>
              <span>
                The export can contain code, paths and commands. No file is
                uploaded or stored; the analysis runs offline in this browser.
              </span>
            </article>
          </section>

          {errors.length > 0 && (
            <section
              className={styles.errorList}
              aria-label="Rejected files"
              aria-live="polite"
            >
              {errors.map((error) => (
                <article className={styles.errorCard} key={error.id}>
                  <span className={styles.errorIcon} aria-hidden="true">
                    !
                  </span>
                  <div>
                    <h2>
                      {error.code === "not-bob-export"
                        ? "Valid JSON, but not a Bob session export"
                        : "We could not read this file"}
                    </h2>
                    <p>
                      <code>{error.fileName}</code> — {error.message}
                    </p>
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
                  <h2>
                    {analyses.length}{" "}
                    {analyses.length === 1
                      ? "session analyzed"
                      : "sessions analyzed"}
                  </h2>
                </div>
                <button
                  type="button"
                  className={styles.clearButton}
                  onClick={clearAnalyses}
                >
                  Clear analyses
                </button>
              </div>

              <ol className={styles.analysisList}>
                {analyses.map((analysis, index) => (
                  <li key={analysis.id} className={styles.analysisCard}>
                    <div>
                      <span className={styles.roundBadge}>
                        {roundLabel(index)}
                      </span>
                      {analysis.source === "demo" && (
                        <span className={styles.demoBadge}>Example</span>
                      )}
                    </div>
                    <code>{analysis.fileName}</code>
                    <span>
                      {analysis.report.totals.taskCount} task ·{" "}
                      {analysis.report.totals.assistantTurns} turns ·{" "}
                      {analysis.diagnosis.findings.length} findings
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
                  <p>
                    Three or more sessions available for future recurring
                    analyses.
                  </p>
                )}
              </div>
            </section>
          )}
        </main>
      )}
    </div>
  );
}
