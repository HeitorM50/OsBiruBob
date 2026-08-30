# Hindsight

> Reads IBM Bob session exports, reveals where an agent configuration wastes
> context and money, generates a corrected configuration, and **proves** the
> result by running the same task again.

Built during the IBM TechXchange 2026 Pre-conference Dev Day Hackathon.

**[Open the public Hindsight demo](https://heitorm50.github.io/OsBiruBob/)** —
select **“See an example”** to analyse the embedded, redacted baseline without an
installation, account, API key, or network request.

## The problem

Coding agents load context from tool definitions, Skills, system prompts, base
rules, and project rules. IBM Bob includes that breakdown in its session export,
but does not surface it in the session interface.

Our real Round A baseline, versioned at
[`benchmark/rodada-a.json`](benchmark/rodada-a.json), paid **10,439 tokens of fixed
overhead before the agent read one line of code**:

| Source | Tokens | Share |
|---|---:|---:|
| `toolDefinitions` | 5,403 | 51.8% |
| `toolSystemPrompts` | 2,470 | 23.7% |
| `skills` | 1,541 | 14.8% |
| `staticSections` | 563 | 5.4% |
| `baseRules` | 197 | 1.9% |
| `customInstructions` | 160 | 1.5% |
| `environment` | 71 | 0.7% |
| `roleDefinition` | 34 | 0.3% |
| **`projectRules`** | **0** | **0.0%** |
| `mcpToolDefinitions` | 0 | 0.0% |

That zero is the central finding. `projectRules: 0` means no repository guidance
was loaded: the agent has to rediscover the same structure, conventions, and
commands in every new session. The same task carried 23 tools and called only 5.

## The solution

Hindsight closes the feedback loop in four stages:

1. **Observe** — validates a Bob export and normalises turns, tool calls, cost,
   and context-window metrics.
2. **Diagnose** — finds absent project rules, idle tools, paid Skill overhead,
   redundant reads, retries after errors, human intervention, and MCP candidates.
3. **Prescribe** — produces a missing `AGENTS.md`, tools to disable, Skills to
   review, and MCP suggestions. Every recommendation is tied to evidence.
4. **Verify** — compares two runs of the same task and reports improvements,
   regressions, unavailable metrics, and experiment validity.

The full pipeline is deterministic:

```text
export JSON → Parser → Observe → Diagnose → Prescribe → Compare → UI
```

## How Hindsight is different

Unlike generic observability tools that focus strictly on API latency or global spend, Hindsight treats **context window economics** as a measurable, addressable debt.
- **Local by design**: Other log analysis tools require uploading session data. Hindsight runs 100% locally in the browser, ensuring sensitive source code, absolute paths, and prompts never leave your machine.
- **Actionable prescriptions**: Dashboards only show numbers. Hindsight diagnoses the specific cause of waste (e.g., absent project rules, idle tools) and generates the exact configuration artifacts (`AGENTS.md`) to fix it.
- **Deterministic and Verifiable**: Recommendations are rule-based, deterministic, and proven via structural A/B testing of identical tasks, rather than relying on unverified LLM-generated advice.

## Try it

The product is a self-contained static application. It has no backend, database,
credentials, telemetry, or runtime network calls.

### Public demo

Open <https://heitorm50.github.io/OsBiruBob/> in any browser and select
**“See an example.”** The embedded fixture is a structurally faithful, redacted
copy of Round A. To compare your own experiment, drop Round A and Round B exports
onto the page.

### Local web app

Node.js 20 or newer is required.

```bash
git clone https://github.com/HeitorM50/OsBiruBob.git
cd OsBiruBob
npm ci
npm run dev:web
```

Build and preview the same static artefact deployed on GitHub Pages:

```bash
npm run build:web    # writes dist/web/index.html
npm run preview
```

Development CLI:

```bash
npm run demo         # builds and analyses fixtures/sample-export.json
```

Canonical verification commands:

```bash
npm test
npm run typecheck
npm run build:web
npm run demo
```

## Privacy and security

**A user-provided export never leaves the browser.** It is read with `FileReader`
and held only in memory. Reloading the page clears it. There is no upload, server,
storage, model call, or telemetry.

This is a product constraint: a Bob export may contain source code, absolute paths,
prompts, and commands. Public fixtures and submitted Bob reports are redacted;
generated public output hides message bodies, task titles, tool arguments, and
workspace paths by default.

Security policy and credential-response instructions are in
[`SECURITY.MD`](SECURITY.MD). Raw session exports and screenshots are ignored until
they have been reviewed and sanitised.

## Measured A/B result

We ran the same Docker-and-Node task twice on `IBM/bob-demo` commit `cb10cdfb`, with
the same person, byte-identical prompt, approval permissions, and clean conversation.
Only the Bob configuration changed.

| Metric | Round A | Round B | Delta |
|---|---:|---:|---:|
| API cost | $0.336902 | $0.270606 | **−$0.066296 (−19.7%)** |
| **Fixed overhead** | **10,439** | **7,740** | **−2,699 (−25.9%)** |
| Conversation tokens | 7,145 | 5,811 | −1,334 (−18.7%) |
| Reported context | 17,584 | 13,551 | −4,033 (−22.9%) |
| Idle tools | 18 of 23 (78%) | 12 of 17 (71%) | −6 tools |
| Paid Skill without declared use | 1,541 | 826 | −715 (−46.4%) |
| `projectRules` | **0** | **121** | +121 |
| Assistant turns | 5 | 6 | **+1 (regression)** |
| Tool-call errors | 0 | 0 | 0 |
| Human interventions | 0 | 0 | 0 |
| Duration | 566 s | 1,338 s | **+772 s (regression)** |

The main result is a **25.9% reduction in fixed context overhead**, supported by a
**19.7% lower API cost**. The result is intentionally reported with its negative
outcomes: the run took one more turn and more wall-clock time.

The pre-registered hypothesis was also partly wrong. Removing six tools did **not**
change `toolDefinitions` (5,403 in both rounds). Instead, `toolSystemPrompts` fell
81.5%, accounting for 75% of the overhead reduction. The experiment corrected the
product's own assumption.

Screenshot-only metrics are not fabricated from the export. Tokens ↑/↓ and cache
were unavailable in both summaries; Context Length changed from 7% to 5%; build
failures were manually observed as 0 in both rounds.

See the complete protocol in [`benchmark/METRICS.md`](benchmark/METRICS.md) and the
result analysis in [`docs/analise-rodada-b.md`](docs/analise-rodada-b.md).

## How IBM Bob was used

IBM Bob is the project's implementation tool, data source, and experimental
environment. Five team members implemented the project through Bob IDE sessions;
the repository includes the required task-summary evidence in [`bob_sessions/`](bob_sessions/).

Hindsight was also applied to its own Bob setup before implementation: the team
added repository rules, selected a smaller custom mode, and created three reusable
project Skills. That self-hosting measurement reduced fixed overhead by 19.3%.

The detailed, auditable usage statement is in
[`docs/submission/bob-usage.md`](docs/submission/bob-usage.md).

## Repository map

```text
.bob/          shared Bob custom mode and three project Skills
benchmark/     experiment protocol, exact task, and redacted Round A/B exports
bob_sessions/  sanitised Bob reports and task-summary screenshots
data/          reviewed MCP and tool catalogues
fixtures/      redacted offline demo fixture
scripts/       export sanitisation and measurement helpers
src/           pure pipeline core, React SPA, and development CLI
docs/          architecture, schema, evidence, results, and submission material
```

The export schema is documented in [`docs/schema.md`](docs/schema.md), domain
contracts in [`docs/domain-model.md`](docs/domain-model.md), and dependency rules in
[`docs/architecture.md`](docs/architecture.md).

## Third-party software and data

The project is released under the [MIT License](LICENSE). Direct runtime
dependencies are MIT-licensed. The benchmark uses the public
[`IBM/bob-demo`](https://github.com/IBM/bob-demo) repository at commit `cb10cdfb`,
licensed under Apache-2.0; no Bob demo source code is redistributed here. Catalogue
entries link to public project documentation but do not bundle or install those
projects.

See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for the reviewed inventory,
licences, and public sources.
