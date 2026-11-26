# Changelog

All notable changes to Hindsight are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## 0.2.0 — 2026-11-26

First release after the IBM TechXchange 2026 hackathon. Thanks to the original
team for the foundation this builds on.

### Added

- **A simpler flow: Load → Diagnose → Fix → Compare.** Context breakdown and
  findings live on one Diagnose screen; every finding links to its fix and
  every fix links back to the finding that justifies it.
- **Ready-to-apply Bob custom mode.** Unused tools are grouped by IBM Bob's
  real tool groups (`read`, `edit`, `execute`, …) and Hindsight generates a
  `.bob/custom_modes.yaml` you can copy or download. Search and diff tools
  (`grep`, `glob`, `apply_diff`) are never suggested for removal.
- **A useful AGENTS.md draft.** One file per session with Environment,
  Commands, Tool policy and Working agreements sections, each derived from a
  finding and tagged with `<!-- hindsight: kind ×N -->` so you can see why it
  is there.
- **MCP suggestions you can act on.** Each MCP card shows the docs link, an
  install snippet and the estimated token cost of the tools the server adds.
- **Skill guidance** with a single measured/estimated label and the steps to
  review Skills inside Bob.
- **Explanations for every number:** units, a glossary (fixed overhead,
  context window, pressure, confidence, estimate vs measured), readable labels
  instead of raw field names, and how to export a session from Bob.
- **Context window field.** Enter your model's window to see context
  pressure; the demo's 270k value is labelled as assumed.
- **Task selector** for exports with several tasks.

### Fixed

- Diagnosis screen is readable in dark mode; the theme follows the system
  setting.
- A rejected file no longer sends you to an empty screen or shifts Round A /
  Round B; errors stay visible.
- Missing metrics are shown as "unavailable" instead of `0`, including in the
  A/B comparison.
- Findings no longer expose message content or file paths in their IDs or
  descriptions.
- Fixed-rate estimates (re-reads, interventions) are labelled as estimates.
- Subtasks are no longer counted twice in findings and prescriptions.
- Redundant-read detection checks each pair of consecutive reads and
  recognises every file-editing tool.
- Tool-saving estimates are computed per Bob tool group instead of being
  overstated.
- MCP catalogue: a distinct rationale per server, corrected links, and a
  read-only Kubernetes snippet.
- Copy shows feedback, downloads no longer fail in some browsers, tabs keep a
  visible keyboard focus, and long numbers no longer get cut on phones.

## 0.1.0 — 2026-08-30

Hackathon release.
