# AGENTS.md — Hindsight

Context for AI coding assistants. Keep this file short and stable.

---

## What this project is

A **static web app** (plus a dev CLI) that analyses IBM Bob session exports,
identifies context waste, generates corrected configuration — `AGENTS.md`, tools to
disable, Skills, MCPs, subagents — and compares two experiment rounds (A/B).

Pipeline: `export JSON → Parser → Observe → Diagnose → Prescribe → Compare → UI`

Everything runs **in the browser**. No backend, no database, no network calls, no
API key. A session export contains source code, absolute paths, and the commands the
user ran — it must never leave the machine. This is a hard constraint, not a
preference.

`ObserveReport` is the central contract: after F2, **no module reads the raw export**.

---

## Repository map

```
benchmark/          experiment protocol, task prompt, and both round exports
  METRICS.md        what is measured and the rules that make the comparison valid
  rodada-a.json     Round A — baseline (same as fixtures/sample-export.json)
  rodada-b.json     Round B — with generated config
  task.txt          exact benchmark prompt (character-for-character)
bob_sessions/       required screenshots of Bob sessions (submission deliverable)
docs/
  architecture.md   component responsibilities, data flow, dependency rules
  domain-model.md   all domain types with invariants (source of truth for types)
  technology-stack.md  stack decisions, commands, and justifications
  schema.md         Bob export JSON structure, field-by-field
  analise-rodada-a.md  findings from the baseline run
  ROADMAP.md        phases F0–F7, gates, and Bobcoin strategy
fixtures/
  sample-export.json  faithful copy of rodada-a.json — use for all dev/tests
data/               curated catalogues — versioned data, not code
  mcp-catalog.json    binary → MCP server (drives enable-mcp)
  tool-catalog.json   tool → purpose → group (groups unused-tool findings)
src/
  domain/types.ts   TypeScript interfaces for all domain types
  parser/           F2: validates and normalises the raw export → Session
  observe/          F2: extracts metrics from Session → ObserveReport
  diagnose/         F3: pure detectors (ObserveReport) → Finding[]
  prescribe/        F4: generates config artifacts from Finding[] + catalogues
  compare/          F5: diffs two ObserveReports → Comparison
  ui/               F6: the React SPA — this is the product
  cli.ts            F6: same core, terminal output — dev tool only
```

---

## Canonical commands

All commands run from the repository root.

```bash
npm ci                # install — use npm install only when adding a dependency
npm test              # run tests (vitest run)
npm run test:watch    # watch mode during development
npm run typecheck     # tsc --noEmit — run before every commit
npm run dev:web       # vite — the SPA with hot reload (this is the product)
npm run build:web     # vite build → dist/web/ (static, deployable)
npm run preview       # vite preview — check the static build locally
npm run dev           # tsx src/cli.ts — CLI without building
npm run build         # tsup → dist/cli.js
npm run demo          # build + run the CLI over fixtures/sample-export.json
```

---

## Code and test conventions

- **TypeScript strict mode.** `strict: true` in tsconfig.json. No `any`.
- **One module per pipeline stage.** `parser → observe → diagnose → prescribe → compare → cli`.
  Dependencies flow downward only — see `docs/architecture.md` for the
  full prohibition list.
- **Test files alongside source.** Pattern: `src/**/*.test.ts`.
  Fixtures go in `fixtures/`; tests import from there.
- **Pure functions for detectors.** Each detector in `src/diagnose/` is
  `(ObserveReport) => Finding[]` with no side effects.
- **No rounding in domain.** `Math.round`, `toFixed`, and truncation are
  forbidden in `src/domain/`, `src/parser/`, `src/observe/`, `src/diagnose/`,
  `src/prescribe/`, and `src/compare/`. Round only in `src/cli.ts`.
- **Timestamps are epoch milliseconds.** Type `EpochMs = number`. Never
  convert to `Date` or ISO string before the presentation layer.
- **Subtasks excluded from aggregation.** `task.parentId !== null` = subtask.
  Never add its cost/tokens to session totals (invariant I-5).
- **The core must stay browser-safe.** No Node APIs (`fs`, `path`, `process`, `os`)
  anywhere except `src/cli.ts`. The web build imports the same modules.
- **No network, ever.** No `fetch`, `XMLHttpRequest`, WebSocket, telemetry — in any
  module, including the UI. The bundle is self-contained.
- **No LLM calls.** Recommendations are rule + catalogue, deterministic and traceable
  to a field in the export. Calling a model would break demo-without-API-key, static
  deploy, privacy, and explainability at once. See `docs/architecture.md`.
- **Never render export content as HTML.** No `dangerouslySetInnerHTML`, `innerHTML`
  or `eval`. The export is untrusted input in the browser too.
- **Absence is not zero.** A metric the export does not provide goes into
  `unavailableMetrics` or stays `null` — never `0`. Estimates must be labelled as
  estimates (invariant I-6).

---

## Confirmed schema traps (read before touching parser or tests)

These bugs have been confirmed on the real export — do not re-discover them:

| Trap | Correct behaviour |
|---|---|
| `messages[].createdAt` is identical for all messages | Order by `data._meta.timestamp` |
| `_meta.spend` only exists on `assistant` messages | Guard the access — accessing it on `tool` or `user` crashes |
| One `assistant` turn can have N parallel `toolCalls[]` | Correlate by `.id`, never by position |
| `task.status` stays `"active"` after completion | Use `stop: true` on the last assistant message |
| `contextWindowBreakdown.total` ≠ `reportedTotal` | Intentional: `total` = fixed overhead, `reportedTotal` = overhead + conversation |
| `gitSha` and `gitBranch` are always `null` | Record commit SHA manually via screenshot |
| `tasks[].task.parentId !== null` = subtask | Do not double-count it in session aggregates |
| `_meta.spend` is `undefined`, not `null`, when absent | Use optional chaining: `msg.data._meta.spend?.cost` |

---

## Policy: sensitive data

**Never print, log, or copy into a generated artefact:**
- `data.content` of user or assistant messages
- `toolCalls[].arguments` (may contain file paths, commands, or code)
- `toolUsage.signature.arguments`
- `task.title` (it is the full prompt, often verbatim code)
- `task.env.staticEnvInfo.primaryWorkspace` (absolute path)

These fields are available internally for analysis but must be redacted
(`[REDACTED]`) before any output visible to the user, unless the user
explicitly enables raw display.

The `evidence.redactable` flag on a `Finding` marks which evidence fields
need redaction. Check it before rendering.

Catalogues in `data/` are the exception: they are **trusted input** (versioned and
reviewed in PR), so their text may be rendered directly.

---

## Where to implement each phase

| Phase | Files to create/modify | Input type | Output type |
|---|---|---|---|
| **F2 — Observe** | `src/parser/`, `src/observe/` | raw JSON bytes | `Session`, `ObserveReport` |
| **F3 — Diagnose** | `src/diagnose/` | `ObserveReport` | `Finding[]` |
| **F4 — Prescribe** | `src/prescribe/` | `Finding[]` | `Prescription[]`, `AGENTS.md` draft |
| **F5 — Verify** | `src/compare/` | two `ObserveReport`s | `Comparison` |
| **F6 — Interface** | `src/ui/` (product), `src/cli.ts` (dev) | all of the above | four screens / terminal output |

Each module has its own test file(s). The fixture for all tests is
`fixtures/sample-export.json` (copy of the real Round A baseline).

---

## Definition of Done (per issue)

A task is done only when:
- acceptance criteria are covered by a test or recorded evidence
- `npm test` passes
- `npm run typecheck` passes
- invalid input fails with a readable message
- no secret or private content appears in output
- the result has been verified against `benchmark/rodada-a.json` when applicable
