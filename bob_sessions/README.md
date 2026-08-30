# IBM Bob session evidence

This directory is the submission manifest for the IBM Bob sessions used to build
Hindsight. It contains only reviewed task-summary screenshots and sanitised
exports. Raw captures and exports are ignored by Git.

> **Submission status (30 August 2026): incomplete.** The repository proves that
> five people contributed Bob evidence, but the roster must still be compared with
> the hackathon portal's **My Team** page. Five screenshots were excluded because
> they exposed the pasted prompt and must be recaptured. Task ordinals marked below
> also require confirmation from the owners' Bob task lists; Git timestamps are not
> a valid substitute.

## Required naming

```text
osbirubob_taskNN_short-description_summary.png
```

- `NN` is the task's real Bob ordinal for that member, not a Git timestamp.
- The ordinal must be unique inside the member directory.
- The description uses only lowercase ASCII letters, numbers, and hyphens.
- The file must contain PNG bytes; changing a filename extension is not conversion.
- Sanitised exports use the same prefix and end in `_export.json`.
- `.raw-export.json` and `.raw-summary.png` files are ignored and must never be
  committed.

## Evidence manifest

Issue and PR references describe why a session belongs in the submission. “None”
means that the evidence came from project bootstrap work before the issue workflow.

### Gustavo — 3 published screenshots

| Bob task | Description | Issue / PR | Screenshot | Export | Why included |
|---|---|---|---|---|---|
| 02 | Initial project session | [#31](https://github.com/HeitorM50/OsBiruBob/issues/31)–[#33](https://github.com/HeitorM50/OsBiruBob/issues/33) / none | [summary](Gustavo/osbirubob_task02_sessao-inicial-gustavo_summary.png) | — | Records Bob use during architecture, stack, and domain bootstrap. |
| 09 | Tool-call extraction | [#7](https://github.com/HeitorM50/OsBiruBob/issues/7) / [#50](https://github.com/HeitorM50/OsBiruBob/pull/50) | [summary](Gustavo/osbirubob_task09_tool-calls_summary.png) | — | Implements a core Observe pipeline module. |
| 16 | AGENTS.md generator | [#16](https://github.com/HeitorM50/OsBiruBob/issues/16) / [#63](https://github.com/HeitorM50/OsBiruBob/pull/63) | [summary](Gustavo/osbirubob_task16_agents-generator_summary.png) | — | Implements a core prescription artifact. |

### Heitor — 8 published screenshots, 4 replacements required

| Bob task | Description | Issue / PR | Screenshot | Export | Why included |
|---|---|---|---|---|---|
| 01 | Round A baseline | [#4](https://github.com/HeitorM50/OsBiruBob/issues/4) / none | **Replacement required** | [benchmark export](../benchmark/rodada-a.json) | Required baseline evidence; old capture was excluded because the full benchmark prompt was visible. |
| 02† | Round B, invalid attempt | [#19](https://github.com/HeitorM50/OsBiruBob/issues/19) / [#71](https://github.com/HeitorM50/OsBiruBob/pull/71) | **Replacement required** | [sanitised export](Heitor/osbirubob_task02_rodada-b-tentativa-invalida_export.json) | A failed experiment is still relevant evidence; old capture exposed the prompt. |
| 02† | Round B, accepted run | [#19](https://github.com/HeitorM50/OsBiruBob/issues/19) / [#71](https://github.com/HeitorM50/OsBiruBob/pull/71) | **Replacement required** | [sanitised export](Heitor/osbirubob_task02_rodada-b-otimizada_export.json) | Required second half of the A/B experiment; old capture exposed the prompt. |
| 03 | Project documentation | [#34](https://github.com/HeitorM50/OsBiruBob/issues/34) / [#44](https://github.com/HeitorM50/OsBiruBob/pull/44) | [summary](Heitor/osbirubob_task03_documentacao-projeto_summary.png) | — | Establishes the repository instructions used by later sessions. |
| 04 | Self-hosting measurement, before | [#45](https://github.com/HeitorM50/OsBiruBob/issues/45) / [#46](https://github.com/HeitorM50/OsBiruBob/pull/46) | [summary](Heitor/osbirubob_task04_selfhost-before_summary.png) | [sanitised export](Heitor/osbirubob_task00_selfhost-before_export.json) | Measures Bob overhead before the custom implementation mode. |
| 05 | Self-hosting measurement, after | [#45](https://github.com/HeitorM50/OsBiruBob/issues/45) / [#46](https://github.com/HeitorM50/OsBiruBob/pull/46) | [summary](Heitor/osbirubob_task05_selfhost-after_summary.png) | [sanitised export](Heitor/osbirubob_task00_selfhost-after_export.json) | Measures the same work after configuration changes. |
| 07 | Turn metrics | [#6](https://github.com/HeitorM50/OsBiruBob/issues/6) / [#48](https://github.com/HeitorM50/OsBiruBob/pull/48) | [summary](Heitor/osbirubob_task07_metricas-por-turno_summary.png) | — | Implements chronological token and cost metrics. |
| 08 | CI/CD | — / [#53](https://github.com/HeitorM50/OsBiruBob/pull/53) | [summary](Heitor/osbirubob_task08_ci-cd_summary.png) | — | Records Bob-assisted CI and Pages work. |
| 09 | Tool inventory | [#37](https://github.com/HeitorM50/OsBiruBob/issues/37) / [#54](https://github.com/HeitorM50/OsBiruBob/pull/54) | [summary](Heitor/osbirubob_task09_inventory-extract_summary.png) | — | Extracts available, used, and idle tools. |
| 10 | React skeleton | [#41](https://github.com/HeitorM50/OsBiruBob/issues/41) / [#62](https://github.com/HeitorM50/OsBiruBob/pull/62) | [summary](Heitor/osbirubob_task10_skeleton-react_summary.png) | — | Creates the browser product adapter. |
| 11 | A/B comparison | [#20](https://github.com/HeitorM50/OsBiruBob/issues/20) / [#72](https://github.com/HeitorM50/OsBiruBob/pull/72) | [summary](Heitor/osbirubob_task11_bob-compare_summary.png) | — | Implements the measured A/B delta. |
| 12 | Docker MCP configuration | [#39](https://github.com/HeitorM50/OsBiruBob/issues/39) / [#58](https://github.com/HeitorM50/OsBiruBob/pull/58) | **Replacement required** | [sanitised export](Heitor/osbirubob_task12_mcp-docker_export.json) | Records the Bob session used to configure the Docker MCP; the supplied capture was moved to ignored raw evidence because its prompt was visible. |

† The duplicate `task02` ordinal is deliberately not guessed from timestamps. Heitor
must open both tasks in Bob and provide their real unique ordinals with the safe
replacement captures.

### Hugo — 5 published screenshots

| Bob task | Description | Issue / PR | Screenshot | Export | Why included |
|---|---|---|---|---|---|
| 08 | Context breakdown | [#8](https://github.com/HeitorM50/OsBiruBob/issues/8) / [#49](https://github.com/HeitorM50/OsBiruBob/pull/49) | [summary](Hugo/osbirubob_task08_context-breakdown_summary.png) | — | Extracts the fixed-context decomposition. |
| 09 | Retry after error | [#11](https://github.com/HeitorM50/OsBiruBob/issues/11) / [#56](https://github.com/HeitorM50/OsBiruBob/pull/56) | [summary](Hugo/osbirubob_task09_retry-after-error_summary.png) | — | Implements a Diagnose detector. |
| 10 | Failed attempt | [#40](https://github.com/HeitorM50/OsBiruBob/issues/40) / [#64](https://github.com/HeitorM50/OsBiruBob/pull/64) | [summary](Hugo/osbirubob_task10_failed-attempt_summary.png) | — | Retains a relevant failed session instead of hiding it. |
| 11 | Recommendation catalog | [#40](https://github.com/HeitorM50/OsBiruBob/issues/40) / [#64](https://github.com/HeitorM50/OsBiruBob/pull/64) | [summary](Hugo/osbirubob_task11_recommendation-catalog_summary.png) | — | Implements deterministic recommendation data. |
| 12 | Prescription screen | [#42](https://github.com/HeitorM50/OsBiruBob/issues/42) / [#67](https://github.com/HeitorM50/OsBiruBob/pull/67) | [summary](Hugo/osbirubob_task12_prescription-screen_summary.png) | — | Implements the final prescription UI. |

### Pedro — 5 published screenshots, 1 replacement required

| Bob task | Description | Issue / PR | Screenshot | Export | Why included |
|---|---|---|---|---|---|
| 01† | Domain model and stack | [#31](https://github.com/HeitorM50/OsBiruBob/issues/31)–[#33](https://github.com/HeitorM50/OsBiruBob/issues/33) / [#36](https://github.com/HeitorM50/OsBiruBob/pull/36) | **Replacement required** | [sanitised export](Pedro/osbirubob_task01_domain-and-stack_export.json) | Bootstrap design work; old capture was excluded because its prompt modal was open. |
| 02† | Pull-request delivery | Owner confirmation pending / [#59](https://github.com/HeitorM50/OsBiruBob/pull/59) | [summary](Pedro/osbirubob_task02_pull-request_summary.png) | — | Records the delivery step associated with the detector work. |
| 03† | Observe output criteria | Owner confirmation pending / [#59](https://github.com/HeitorM50/OsBiruBob/pull/59) | [summary](Pedro/osbirubob_task03_observe-output_summary.png) | — | Records validation performed during the detector delivery. |
| 04† | Idle-tool detector | [#14](https://github.com/HeitorM50/OsBiruBob/issues/14) / [#59](https://github.com/HeitorM50/OsBiruBob/pull/59) | [summary](Pedro/osbirubob_task04_idle-tool-detector_summary.png) | — | Implements the strongest quantitative Diagnose finding. |
| 05† | F4 gate | [#18](https://github.com/HeitorM50/OsBiruBob/issues/18) / [#69](https://github.com/HeitorM50/OsBiruBob/pull/69) | [summary](Pedro/osbirubob_task05_f4-gate_summary.png) | [sanitised export](Pedro/osbirubob_task05_f4-gate_export.json) | Verifies that Bob accepts the generated configuration. |
| 06† | Context-breakdown screen | [#21](https://github.com/HeitorM50/OsBiruBob/issues/21) / [#70](https://github.com/HeitorM50/OsBiruBob/pull/70) | [summary](Pedro/osbirubob_task06_context-breakdown-screen_summary.png) | [pipeline export](Pedro/osbirubob_task06_pipeline-validation_export.json) | Implements and validates the first diagnostic screen. |

† Pedro's original files contained duplicate or missing task numbers. These
provisional ordinals satisfy the filename syntax but are **not submission-ready**
until Pedro checks them against his Bob task list. No ordinal may be inferred from
Git modification time.

### Philipe — 3 published screenshots

| Bob task | Description | Issue / PR | Screenshot | Export | Why included |
|---|---|---|---|---|---|
| 06 | Export parser | [#5](https://github.com/HeitorM50/OsBiruBob/issues/5) / [#47](https://github.com/HeitorM50/OsBiruBob/pull/47) | [summary](Philipe/osbirubob_task06_parser-export_summary.png) | — | Implements the pipeline entry point. |
| 10 | Redundant-read detector | [#10](https://github.com/HeitorM50/OsBiruBob/issues/10) / [#57](https://github.com/HeitorM50/OsBiruBob/pull/57) | [summary](Philipe/osbirubob_task10_redundant-read_summary.png) | — | Implements a Diagnose detector. |
| 12 | Human-intervention detector | [#12](https://github.com/HeitorM50/OsBiruBob/issues/12) / [#60](https://github.com/HeitorM50/OsBiruBob/pull/60) | [summary](Philipe/osbirubob_task12_human-intervention-detector_summary.png) | — | Implements a Diagnose detector. |

## Exclusions and required manual checks

| Item | Status and reason |
|---|---|
| Raw exports and raw screenshots | Excluded by `.gitignore`; they may contain prompt text, transcripts, commands, or private paths. |
| Heitor Round A and both Round B captures | Excluded from the current tree because the benchmark prompt was visible. Recapture with only the summary metrics visible. |
| Heitor Docker MCP capture | Kept locally as ignored raw evidence because its prompt was visible. Recapture with only the summary metrics visible. |
| Pedro domain-model capture | Excluded from the current tree because the pasted prompt modal was open. Recapture with the modal closed. |
| Hugo failed attempt | Included: the session was project-related, and failed sessions are part of the evidence. |
| Unrelated Bob tasks | None can be declared excluded until each member compares this manifest with their Bob task list. Record every omission and reason here before submission. |

The team lead must complete these checks in the hackathon and Bob interfaces:

1. Compare the five local directories with the exact roster shown under **My Team**.
2. Each member must compare the rows above with all project tasks in their Bob
   workspace and add missing relevant summaries.
3. Heitor must resolve the two real ordinals currently represented as `task02`.
4. Pedro must confirm the six provisional ordinals and the two pending PR/issue
   associations.
5. Recapture the five excluded summaries as real PNGs, with prompt/transcript
   collapsed and no credential, personal data, private path, or sensitive code.

Do not close issue #29 until these five checks are recorded.

## Review and validation

Every committed screenshot was visually reviewed at a readable size on 30 August
2026. The 24 currently published files show Bob task-summary metrics and no visible
credential, personal data, private path, expanded prompt/transcript, or sensitive
code. Automated checks additionally verified the filename grammar, PNG signature,
image readability, and duplicate ordinals. The only remaining duplicate belongs to
the two unpublished Heitor `task02` replacements described above.

Re-run the mechanical checks from the repository root:

```bash
git ls-files 'bob_sessions/**/*.png'
file bob_sessions/*/*.png
identify bob_sessions/*/*.png
git check-ignore bob_sessions/**/*.raw-export.json bob_sessions/**/*.raw-summary.png
```

Security review is partly visual and cannot be replaced by pattern matching. Never
paste a discovered sensitive value into an issue, commit message, or review note.
The complete export sanitisation procedure is documented in
[`docs/configuracao-bob.md`](../docs/configuracao-bob.md).
