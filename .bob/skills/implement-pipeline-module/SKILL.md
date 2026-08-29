---
name: implement-pipeline-module
description: Implement one Hindsight F2-F4 pipeline module as a pure TypeScript change with colocated tests and repository verification.
---

Use this Skill for one parser, observe, diagnose, or prescribe issue at a time.

1. Read the issue acceptance criteria, the relevant contract in
   `docs/domain-model.md`, and the component boundary in `docs/architecture.md`.
   Inspect only the adjacent source, tests, and fixture fields needed by the issue.
2. Implement the smallest change that satisfies the contract. Preserve the import
   direction and browser safety rules from `AGENTS.md`. Detectors remain pure.
3. Add or update a colocated `src/**/*.test.ts` test. Use
   `fixtures/sample-export.json` for baseline characterization and a synthetic
   fixture only when the real baseline cannot exercise the scenario.
4. Cover invalid or unavailable input explicitly when it is part of the boundary.
   Absence is not zero, and domain calculations are never rounded.
5. Run `npm test` and `npm run typecheck`. When applicable, verify the observed
   values against `benchmark/rodada-a.json` without displaying message content,
   tool arguments, task titles, or private paths.

Do not broaden the issue into another pipeline phase or add a dependency unless the
accepted contract requires it.
