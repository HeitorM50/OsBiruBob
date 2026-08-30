import React, { useId, useRef, useState } from "react";
import sampleExport from "../../fixtures/sample-export.json?raw";
import {
  analyzeExport,
  type AnalysisError,
  type AnalyzedExport,
} from "./analysis";
import { readFileText } from "./file-reader";
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

<<<<<<< HEAD
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
=======
type Theme = "light" | "dark";

interface LoadedAnalysis extends AnalyzedExport {
  id: number;
}

interface InputError extends AnalysisError {
  id: number;
}

export interface AppProps {
  readText?: (file: File) => Promise<string>;
  exampleContent?: string;
}

function roundLabel(index: number): string {
  if (index === 0) return "Rodada A";
  if (index === 1) return "Rodada B";
  return `Sessão ${index + 1}`;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

export default function App({
  readText = readFileText,
  exampleContent = sampleExport,
}: AppProps): React.JSX.Element {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const [theme, setTheme] = useState<Theme>("light");
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
                "Não foi possível ler o arquivo. Selecione-o novamente ou gere um novo export no IBM Bob.",
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
    setLoadingNames(["sample-export.json"]);
    await nextFrame();

    const result = analyzeExport(exampleContent, "sample-export.json", "demo");
    if (result.ok) setAnalyses([withId(result.value)]);
    else setErrors([errorWithId(result.error)]);
    setLoadingNames([]);
  }

  function clearAnalyses(): void {
    nextId.current = 1;
    setAnalyses([]);
    setErrors([]);
    setLoadingNames([]);
    setDragActive(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleDrop(event: React.DragEvent<HTMLElement>): void {
    event.preventDefault();
    if (loading) return;
    void loadFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <div className={styles.app} data-theme={theme}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.brandBlock}>
            <span className={styles.brand}>Hindsight</span>
            <span className={styles.divider} aria-hidden="true" />
            <span className={styles.currentFile}>
              {analyses[0]?.fileName ?? "nenhum arquivo"}
            </span>
          </div>

          <nav aria-label="Etapas da análise" className={styles.steps}>
            {["Entrada", "Diagnóstico", "Achados", "Prescrições", "Comparativo"].map(
              (step, index) => (
                <button
                  key={step}
                  type="button"
                  className={index === 0 ? styles.activeStep : styles.step}
                  disabled={index !== 0}
                  aria-current={index === 0 ? "step" : undefined}
                >
                  {index + 1} · {step}
                </button>
              )
            )}
          </nav>

          <div className={styles.headerActions}>
            <span className={styles.privacyCompact}>
              <span className={styles.statusDot} aria-hidden="true" />
              O arquivo não sai deste navegador
            </span>
            <button
              type="button"
              className={styles.themeButton}
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              aria-label="Alternar tema"
            >
              {theme === "light" ? "Tema escuro" : "Tema claro"}
            </button>
          </div>
        </div>
        <div className={styles.progressTrack} aria-hidden="true">
          <div className={styles.progressValue} />
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.intro}>
          <h1>A retrospectiva que sua sessão de agente nunca teve</h1>
          <p>
            Arraste o export JSON de uma sessão do IBM Bob. O Hindsight mostra
            onde a configuração desperdiça contexto e dinheiro, gera a
            configuração corrigida e prepara a comparação entre rodadas.
          </p>
        </section>

        {loading ? (
          <section className={styles.loadingPanel} aria-busy="true" aria-live="polite">
            <span className={styles.spinner} aria-hidden="true" />
            <h2>
              Analisando <code>{loadingNames.join(", ")}</code>
            </h2>
            <p>Nenhum byte saiu da máquina.</p>
            <ol className={styles.loadingSteps}>
              <li>Validando o formato do export</li>
              <li>Extraindo métricas de contexto e ferramentas</li>
              <li>Rodando os detectores disponíveis</li>
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
            <h2>Arraste os arquivos de export aqui</h2>
            <p>ou selecione do computador · JSON</p>
            <div className={styles.dropActions}>
              <button type="button" className={styles.primaryButton} onClick={() => void loadExample()}>
                Ver exemplo — sessão real embutida
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => inputRef.current?.click()}
              >
                Selecionar arquivos
              </button>
              <input
                ref={inputRef}
                id={inputId}
                className={styles.fileInput}
                type="file"
                accept=".json,application/json"
                multiple
                aria-label="Selecionar exports JSON do IBM Bob"
                onChange={(event) => {
                  void loadFiles(Array.from(event.currentTarget.files ?? []));
                  event.currentTarget.value = "";
                }}
              />
            </div>
            <small>Sem instalar nada, sem conta, sem API key.</small>
          </section>
        )}

        <section className={styles.capabilities} aria-label="Capacidades por quantidade de arquivos">
          <article className={styles.capabilityCard}>
            <strong>1 arquivo</strong>
            <span>Diagnóstico completo da sessão</span>
          </article>
          <article className={styles.capabilityCard}>
            <strong>2 arquivos</strong>
            <span>Comparativo A/B da mesma tarefa</span>
          </article>
          <article className={styles.privacyCard}>
            <strong><span className={styles.statusDot} aria-hidden="true" />Processamento 100% local</strong>
            <span>
              O export pode conter código, caminhos e comandos. Nenhum arquivo é
              enviado ou armazenado; a análise roda offline neste navegador.
            </span>
          </article>
        </section>

        {errors.length > 0 && (
          <section className={styles.errorList} aria-label="Arquivos rejeitados" aria-live="polite">
            {errors.map((error) => (
              <article className={styles.errorCard} key={error.id}>
                <span className={styles.errorIcon} aria-hidden="true">!</span>
                <div>
                  <h2>
                    {error.code === "not-bob-export"
                      ? "JSON válido, mas não é um export de sessão do Bob"
                      : "Não conseguimos ler esse arquivo"}
                  </h2>
                  <p><code>{error.fileName}</code> — {error.message}</p>
                </div>
              </article>
            ))}
          </section>
        )}

        {analyses.length > 0 && (
          <section className={styles.results} aria-label="Arquivos analisados">
            <div className={styles.resultsHeader}>
              <div>
                <span className={styles.eyebrow}>Entrada concluída</span>
                <h2>{analyses.length} {analyses.length === 1 ? "sessão analisada" : "sessões analisadas"}</h2>
              </div>
              <button type="button" className={styles.clearButton} onClick={clearAnalyses}>
                Limpar análises
              </button>
            </div>

            <ol className={styles.analysisList}>
              {analyses.map((analysis, index) => (
                <li key={analysis.id} className={styles.analysisCard}>
                  <div>
                    <span className={styles.roundBadge}>{roundLabel(index)}</span>
                    {analysis.source === "demo" && <span className={styles.demoBadge}>Exemplo</span>}
                  </div>
                  <code>{analysis.fileName}</code>
                  <span>
                    {analysis.report.totals.taskCount} task · {analysis.report.totals.assistantTurns} turnos · {analysis.diagnosis.findings.length} achados
                  </span>
                </li>
              ))}
            </ol>

            <div className={styles.readiness} role="status">
              <p>
                <strong>Diagnóstico pronto.</strong>{" "}
                {canCompare
                  ? "Rodadas A e B identificadas; o comparativo está habilitado para a tela #23."
                  : "Adicione uma Rodada B para habilitar o comparativo."}
              </p>
              {hasCrossSessionEvidence && (
                <p>Há três ou mais sessões disponíveis para análises recorrentes futuras.</p>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
>>>>>>> 519b0c6862a1b32c08ebe2c53045b37d813783e2
  );
}
