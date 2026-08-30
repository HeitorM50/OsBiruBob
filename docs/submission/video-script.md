# Video script — Hindsight

**Target: 2:55.** Hard limit 3:00. At least 90 s of the product actually running —
this script gives **105 s**.

Recording target: <https://heitorm50.github.io/OsBiruBob/> in an incognito window.
Narration in English.

---

## Before you record

- [ ] Incognito window, browser zoom **125%**, DevTools **closed**
- [ ] Nothing on screen but the browser — no terminal, no editor, no file paths
- [ ] Screen recording at 1080p, mic tested
- [ ] Have the Bob IDE open on a second desktop for the 0:20–0:40 segment
- [ ] Rehearse once with a timer; the demo block is the one that overruns

---

## 0:00 – 0:20 · The problem

**Show:** the Hindsight landing page, static, then scroll to the context breakdown
of the loaded example.

> "Coding agents are everywhere. But when a session is expensive, nobody can tell
> you why.
>
> This is a real IBM Bob session. Before the agent read one line of code, it was
> already carrying **ten thousand four hundred and thirty-nine tokens**. The slice
> that would hold this project's own guidance? **Zero.**"

**On-screen text:** `projectRules: 0`

---

## 0:20 – 0:40 · How IBM Bob was used

**Show:** the Bob IDE. Open `Settings → Modes` on `hindsight-implementation`, then
cut to a session summary screenshot.

> "Bob isn't just how we built this — it's why the project can exist. Bob exports
> the token breakdown of its own context window.
>
> We built **twenty-nine issues inside Bob**, across five people. Then we pointed
> our own tool at our own Bob setup and cut our overhead **nineteen percent**."

**On-screen text:** `29 issues built in Bob · 5 team members · our own overhead −19.3%`

---

## 0:40 – 2:25 · The product running — **105 seconds**

> Do not cut away from the screen recording during this block. This is the segment
> the rules require.

### 0:40 – 0:55 · Load

**Show:** click **"See an example"**. The analysis appears.

> "Drop a Bob export on the page. Everything runs in your browser — no upload, no
> account, no API key. The file never leaves your machine, and that matters: an
> export contains your source code and your commands."

### 0:55 – 1:20 · Diagnosis

**Show:** the stacked bar. Hover `toolDefinitions`. Then the `projectRules: 0` alert.

> "Here's where the context went. Tool definitions alone: **fifty-two percent**.
> Skills, fifteen. Project rules, zero — meaning no `AGENTS.md`. The agent
> rediscovers everything, every session."

### 1:20 – 1:45 · Evidence

**Show:** Findings tab. Expand the idle-tools finding to reveal turn and `fieldPath`.
Then scroll to the detectors sitting at zero.

> "Every finding points at the exact field in the export. Eighteen of twenty-three
> tools were never called — including a spreadsheet reader, in a Docker task.
>
> Three detectors found **nothing**, and we show that on purpose. A tool that always
> finds a problem isn't measuring anything."

### 1:45 – 2:10 · Prescription

**Show:** Prescriptions tab. The `AGENTS.md` diff. Then the MCP tab with the Docker
recommendation. Then the empty Subagents tab.

> "From those findings it generates the missing `AGENTS.md`, the tools to switch
> off, and the MCP server that would replace three shell calls.
>
> No model is called. Every recommendation is a rule plus a versioned catalogue —
> it works offline, and it can always tell you why."

### 2:10 – 2:25 · The proof

**Show:** drop the second export. The A/B table.

> "Then we ran the same task again — same commit, same prompt — with only the
> configuration changed."

### 2:25 – 2:45 · The result, honestly

**Show:** the delta table, holding on overhead and cost.

> "Fixed overhead down **twenty-five point nine percent**. Cost down **nineteen
> point seven**.
>
> And the part we're not hiding: turns went **up**, five to six. Our registered
> hypothesis was wrong too — disabling tools didn't shrink tool definitions at all.
> We only learned that by running the experiment."

**On-screen text:** `−25.9% overhead · −19.7% cost · turns 5 → 6`

---

## 2:45 – 2:55 · Close

**Show:** the public URL.

> "Every agent session is data. Hindsight turns it into a configuration you can
> apply — and then proves whether it worked."

---

## Rules checklist

| Requirement | Where |
|---|---|
| ≤ 3 minutes | 2:55 |
| ≥ 90 s of product running | 105 s, 0:40–2:25 |
| Narration in English | throughout |
| Shows how IBM Bob was used | 0:20–0:40, plus every number |
| Shows breakdown, evidence, prescription, A/B | 0:55, 1:20, 1:45, 2:10 |
| Only real metrics from #20 | all figures |
| Reports the negative result | 2:25–2:45 |
| No credentials, paths or transcripts | incognito, no terminal on screen |

## Numbers you may say

Only these — all verified in `benchmark/rodada-a.json`, `benchmark/rodada-b.json`
and `docs/analise-rodada-b.md`:

`10,439` · `7,740` · `−25.9%` · `$0.336902` · `$0.270606` · `−19.7%` ·
`projectRules 0 → 121` · `18 of 23 tools` · `52%` tool definitions ·
`turns 5 → 6` · `toolSystemPrompts −81.5%` · self-hosting `−19.3%` ·
`29 issues` · `5 members`

**Do not say** anything about Bobcoins as measured cost, or claim watsonx,
Orchestrate, Bob Shell, subagents or connected MCP servers — none were used.
