import React, { useId, useRef, useState } from "react";
import sampleExport from "../../fixtures/sample-export.json?raw";
import {
  analyzeExport,
  type AnalysisError,
  type AnalyzedExport,
} from "./analysis";
import { readFileText } from "./file-reader";
import styles from "./App.module.css";

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
  );
}
