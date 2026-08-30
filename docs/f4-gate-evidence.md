# F4 Gate — Phase 4 Validation Evidence

**Issue:** #17 — Prescribe: overhead reduction (tool disabling + skill review)
**Branch:** `issue/f4-17`
**Gate commit:** `d367796a1892084421499c7a3fef9f5c1a852631`
**Validation session export:** `bob_sessions/Pedro/bob-task-568bec1892efb287107ee97c4498d19c-2026-08-30.json`
**Screenshot:** `bob_sessions/Pedro/osbirubob_task03_issue_18_GateAgent_md.png`

---

## Pre-condition Audit

### AGENTS.md redaction compliance

The `AGENTS.md` at the repository root was reviewed against the project redaction policy.
It contains **zero** sensitive evidence: no message content, no tool call arguments, no task
titles, no absolute paths, no personal identifiers. The file consists exclusively of
project-scoped engineering rules, conventions, schema traps, and a sensitive-data policy.

### Decision log — tool classification

Based on Round A findings (`unused-tool` finding, 18 idle tools out of 23 available):

| Group | Tools | Classification |
|---|---|---|
| code-navigation | `FindReferencingSymbols`, `FindSymbol`, `GetSymbolsOverview`, `glob`, `grep` | Idle in Round A — review before disabling; essential for code navigation tasks |
| delegation | `spawn_subagent`, `start_subtask`, `start_workflow` | Idle in Round A — candidates for disabling in simple workflows |
| documentation | `search_bob_docs`, `use_skill` | Idle in Round A — candidates for disabling if Skills are not used |
| editing | `apply_diff`, `insert_content`, `read_xlsx`, `search_and_replace` | Idle in Round A — candidates for disabling in read-only tasks |
| planning | `ask_followup_question`, `switch_mode` | Idle in Round A — candidates for disabling in automated pipelines |
| presentation | `create_chart`, `create_html_artifact` | Idle in Round A — candidates for disabling |
| essential (used) | `execute_command`, `list_files`, `read_file`, `update_todo_list`, `write_file` | Used in Round A — must remain enabled |

**Note:** No tools were disabled for this structural gate session. The gate validates
`AGENTS.md` injection (Rule R1) and pipeline correctness, not the full tool-reduction
effect. Tool disabling is a prescription to be applied before Round B.

### Skill configuration

The baseline export (`rodada-a.json`) reported `loadedSkills: []` with an aggregate
skill overhead of **1,541 tokens**. No individual skill was identifiable as the source.

The validation session loaded `close-issue-with-evidence` (appears twice in
`loadedSkills` — likely loaded by two turns). Skill overhead in validation: **1,247 tokens**.

No skill toggles were manually applied for this gate. The skill reduction observed
is a natural result of the session type, not a prescribed intervention.

---

## Validation Metrics

Pipeline: `parseSession → observe → diagnoseWithCatalogs`
Export processed: `bob_sessions/Pedro/bob-task-568bec1892efb287107ee97c4498d19c-2026-08-30.json`

### Before / After comparison

| Metric | Baseline (rodada-a) | Validation | Direction |
|---|---|---|---|
| `breakdown.projectRules` | **0** | **2121** | ✅ +2121 (AGENTS.md injected) |
| `breakdown.toolDefinitions` | 5403 | 5565 | ↑ (same tool set, different session) |
| `breakdown.skills` | 1541 | 1247 | ↓ (fewer skills active) |
| `fixedOverhead` | 10439 | 12549 | ↑ (AGENTS.md added tokens) |
| `reportedTotal` | 17584 | 54467 | ↑ (longer session) |
| `availableTools` count | 23 | 23 | = (no tools disabled this gate) |
| `idle tools` count | 18 | 17 | ↓ 1 (`use_skill` was used) |
| `used tools` count | 5 | 6 | ↑ |
| `completed` (stop=true) | ✅ true | ✅ true | = |
| `loadedSkills` | `[]` | `["close-issue-with-evidence", "close-issue-with-evidence"]` | named |

### Gate rules evaluation

| Rule | Criterion | Result |
|---|---|---|
| **R1** | `breakdown.projectRules > 0` | ✅ **PASS** — value: 2121 |
| **R2** | `availableTools` matches intended config | ✅ **PASS** — 23 tools present, none silently dropped |
| **R3** | `toolDefinitions` trend (informational) | ℹ️ **N/A** — no tools disabled this gate session |
| **R4** | `skills` (only if toggles applied) | ℹ️ **NOT APPLICABLE** — no skill toggles applied |
| **R5** | `completed` derived from `stop: true` | ✅ **PASS** — stop=true confirmed at message index 34 |
| **R6** | Absence of behavioral changes does not invalidate gate | ✅ **ACKNOWLEDGED** |

**Primary structural proof:** `breakdown.projectRules = 2121 > 0` confirms that Bob IDE
recognised, parsed, and injected the `AGENTS.md` rules into the agent context window.

No byte-to-token ratio is asserted. No individual tool token cost is claimed.

---

## Parser schema fixes (discovered during gate execution)

Two schema traps were discovered and fixed in `src/parser/index.ts` as part of this gate:

1. **`loadedSkills` format changed** — newer exports use `{name: string, tokens: number}[]`
   instead of `string[]`. Fixed by normalising to `string[]` at parse time via a Zod union.

2. **`notAi: true` messages lack `timestamp`** — Bob workflow orchestration messages
   (`_meta.notAi: true`) do not carry a `timestamp`. Fixed by exempting them from the
   timestamp requirement while preserving the validation for all normal messages.

3. **`allowed_permissions` enum expansion** — newer exports include `'mcp'`, `'skill'`
   and other permission values not in the original schema. Fixed by relaxing to `z.string()`.

All 434 tests pass after these fixes. Typecheck clean.

---

## Round B Hypothesis

With the reviewed `AGENTS.md` active and non-essential tools disabled before Round B:

- `breakdown.projectRules` is expected to be **strictly > 0** (confirmed achievable: 2121
  measured in this gate session)
- `breakdown.toolDefinitions` is expected to be **below 5,403 tokens** if the prescribed
  idle tools are disabled (estimated reduction: ~(18/23) × 5,403 ≈ 4,229 tokens saved,
  recognised as an **estimate** — exact value will be measured empirically)
- `breakdown.skills` behaviour depends on which Skills are active; no prediction is made
  without an explicit toggle applied before Round B
- `fixedOverhead` is expected to **decrease** from the baseline 10,439 tokens if
  `toolDefinitions` decreases and AGENTS.md overhead is smaller than tool savings
- `availableTools` count is expected to be **less than 23** after tool disabling
- No operational failures are expected: Round A confirmed the 5 essential tools are
  sufficient to complete typical development workflows
- All directional projections are **estimates**; exact token savings will be measured
  empirically in Round B

---

## Out-of-scope boundaries respected

- ✅ No final economic impact claimed
- ✅ No individual token cost assigned to any specific tool or skill
- ✅ No deep behavioral analysis of the validation session
- ✅ Round B tasks not executed or analysed
- ✅ No automation of Bob IDE internal configuration
- ✅ No sensitive content exposed (task titles, tool arguments, paths redacted)
