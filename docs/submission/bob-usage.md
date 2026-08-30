# IBM Bob Usage Statement

IBM Bob is not a code generator we happened to use. It is **the subject of the
project, the source of its data, and the tool that built it.** Hindsight only
exists because Bob exports the token breakdown of its own context window.

Every claim below points to an issue, a pull request and a versioned artefact.

---

## 1. Bob is the data source

Hindsight analyses **real Bob session exports** (`Tasks → export JSON`). Nothing
is simulated.

| What | Artefact |
|---|---|
| Baseline of the A/B experiment | `benchmark/rodada-a.json` |
| Optimised run of the A/B experiment | `benchmark/rodada-b.json` |
| Demo fixture bundled in the public app | `fixtures/sample-export.json` (redacted) |

The export schema was reverse-engineered field by field from a real export and
documented in `docs/schema.md`, including seven confirmed traps we hit — for
example, `messages[].createdAt` is identical across every message and cannot be
used for ordering.

## 2. Bob built Hindsight

**29 `bob-required` issues were implemented inside the Bob IDE**, in Agent Mode,
one issue per session. Examples:

| Bob session | Produced | Issue | Evidence |
|---|---|---|---|
| Domain model and architecture | `docs/domain-model.md`, `docs/architecture.md` | #31, #33 | `bob_sessions/Pedro/osbirubob_task01_domain-model_summary.png` |
| Export parser | `src/parser/` | #5 | `bob_sessions/Philipe/osbirubob_task06_parser-export_summary.png` |
| Per-turn metrics | `src/observe/` | #6 | `bob_sessions/Heitor/osbirubob_task07_metricas-por-turno_summary.png` |
| Tool-call correlation | `src/observe/tool-calls.ts` | #7 | `bob_sessions/Gustavo/osbirubob_task09_tool-calls_summary.png` |
| Context breakdown | `src/observe/` | #8 | `bob_sessions/Hugo/osbirubob_task08_context-breakdown_summary.png` |
| Idle-tool detector | `src/diagnose/detectors/unused-tool.ts` | #14 | `bob_sessions/Pedro/osbirubob_task03_idle-tool-detector_summary.png` |
| Redundant-read detector | `src/diagnose/redundant-read.ts` | #10 | `bob_sessions/Philipe/osbirubob_task10_redundant-read_summary.png` |
| Recommendation catalogues | `data/*.json` | #40 | `bob_sessions/Hugo/osbirubob_task11_recommendation-catalog_summary.png` |
| `AGENTS.md` generator | `src/prescribe/` | #16 | `bob_sessions/Gustavo/osbirubob_task16_agents-generator_summary.png` |
| Prescriptions screen | `src/ui/PrescriptionScreen.tsx` | #42 | `bob_sessions/Hugo/osbirubob_task12_prescription-screen_summary.png` |
| A/B comparison module | `src/compare/` | #20 | `bob_sessions/Heitor/osbirubob_task11_bob-compare_summary.png` |
| Docker MCP server in use | first export with `mcpToolDefinitions > 0` | §5 | `bob_sessions/Heitor/osbirubob_task12_mcp-docker_export.json` |
| Subtask delegation | repository cleanup, 3 delegated subtasks | §5 | `bob_sessions/Heitor/osbirubob_task13_subagents-bob_export.json` |

**Five team members** have Bob sessions in `bob_sessions/`: Heitor, Gustavo, Hugo,
Pedro and Philipe.

## 3. Bob is the experiment

The A/B experiment ran **inside Bob**, on `IBM/bob-demo`, commit `cb10cdfb`:

| Round | Configuration | Fixed overhead | Cost |
|---|---|---:|---:|
| A (#19, baseline) | default `agent` mode, no `AGENTS.md` | 10,439 | $0.336902 |
| B (#19, optimised) | generated `AGENTS.md` + custom mode | 7,740 | $0.270606 |

**−25.9% overhead, −19.7% cost.** `projectRules` went from 0 to 121 tokens.

The protocol is auditable: identical prompt (SHA-256 verified, 400 bytes), same
commit, same person, same auto-approve permission set. `Comparison.valid === true`.

**A first attempt was discarded and kept as evidence.** The `skill` auto-approve
toggle had been left on, which broke the "only the configuration changes" rule.
We verified the deviation was inert — `use_skill` was not even available in that
mode — and discarded the run anyway. See `benchmark/round-b-config/TENTATIVAS.md`.

## 4. Bob configured by Hindsight's own method (self-hosting)

Before implementing, we applied our own tool's method to our own Bob (#45):

| Source | Before | After | Delta |
|---|---:|---:|---:|
| Fixed overhead | 12,471 | 10,062 | **−19.3%** |
| `toolSystemPrompts` | 2,470 | 456 | −81.5% |
| `skills` | 1,541 | 1,117 | −27.5% |
| Tools available | 23 | 18 | −5 |

Configuration applied, all versioned:

- **Custom mode** `hindsight-implementation` in `.bob/custom_modes.yaml`, enabling
  only `read`, `edit`, `execute`, `todo` and `skill`.
- **Three project Skills** in `.bob/skills/`: `implement-pipeline-module`,
  `create-synthetic-fixture` and `close-issue-with-evidence`. One is confirmed
  loaded in the export: `implement-pipeline-module`, 276 tokens.
- **Five tools removed:** `create_html_artifact`, `switch_mode`, `spawn_subagent`,
  `start_subtask`, `create_chart`.
- **`AGENTS.md`** at the repository root, loaded in both runs (2,092 tokens).

Full protocol and measurements: `docs/configuracao-bob.md`.

**Honest limitation:** the mode and the Skills were measured together in a single
before/after pair. We did not run an intermediate session, so we cannot attribute
the 19.3% between them.

## 5. MCP and subagents — measured, not claimed

Hindsight *recommends* MCP servers. Before submitting, we connected one and measured
what it costs, because recommending something we had never run would be dishonest.

### Docker MCP (session `task12_mcp-docker`)

Our own tool, reading our own baseline, recommends **`docker-mcp`** — two `docker`
shell calls, matching the catalogue entry's `minHits: 2`. We connected that server
in Bob and rebuilt the benchmark image through MCP tools instead of shell.

| Signal | Every previous export | This session |
|---|---:|---:|
| `mcpToolDefinitions` | **0** | **780** |

**MCP is not free, and we report that.** Connecting the server added 780 tokens of
tool definitions to the fixed overhead. Hindsight recommends MCP to replace
unstructured shell output with structured results; this is the price of that trade.
We can now state it as a measured number instead of an assumption.

This session also gave the parser its **first real `mcpToolDefinitions > 0` input**.
Until then that code path had only ever seen zero.

### Subagents (session `task13_subagents-bob`)

We used `start_subtask` three times to decompose a repository cleanup, delegating
each step. All three completed successfully.

**Finding about the export format:** the resulting export contains **one task with
`parentId: null`**. The subtasks appear only as tool calls with text results inside
the parent — they are **not** exported as separate task records.

That matters for our own domain model. Invariant **I-5** excludes subtasks
(`parentId !== null`) from aggregation, and our parser handles it — but in export
format v1 that branch **never fires on real data**. It remains covered by synthetic
fixtures only, and we say so rather than implying it was validated in production.

The same session exposed an undocumented structure: the subtask transcript is
embedded in a **nested `data.messages[]` array** inside the parent message, and its
`_meta.fileMtimes` stores absolute paths as **object keys**. Our redaction filter
only walked the top-level message array, so it had a blind spot there. We found it
by auditing the artefact before shipping it, hardened the filter with a
whole-document pass, and documented the structure in `docs/schema.md`.

## 6. Bob produced a finding we did not predict

Our registered hypothesis said disabling tools would reduce `toolDefinitions`.
Across **two independent measurements** — the benchmark and our own sessions —
`toolDefinitions` did not move. The savings came from `toolSystemPrompts`,
−81.5% in both. Bob's export is what made that correction possible, and we
changed the product's recommendation because of it.

## What we did not use

To avoid misreading: we did **not** use Bob Shell, watsonx, or watsonx Orchestrate.

**watsonx was a deliberate exclusion, not an oversight.** Hindsight's core promise is
that the export never leaves the user's browser and that every recommendation is a
deterministic rule plus a versioned catalogue. Calling a hosted model would require
sending the user's own session content to a remote API, would require an API key in a
static page, and would break the byte-identical output our generators are tested for.
The absence is the architecture.

Bobcoin figures shown in session screenshots are the platform's own display; we
report measured cost from the export's `cost` field instead. The mapping above was
checked against the versioned filenames and artefacts during the final compliance
review.
