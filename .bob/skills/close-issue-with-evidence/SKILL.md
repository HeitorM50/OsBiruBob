---
name: close-issue-with-evidence
description: >-
  Verify a Hindsight issue against its acceptance criteria and report completion
  with privacy-safe evidence.
metadata:
  disable-model-invocation: false
---

Use this Skill after implementation, before claiming that an issue is complete.

1. Re-read the issue acceptance criteria and the Definition of Done in `AGENTS.md`.
2. Run `npm test` and `npm run typecheck`. Run the relevant baseline verification
   against `benchmark/rodada-a.json` when applicable. Check invalid input behavior
   when the issue owns an input boundary.
3. Review the diff for scope, forbidden imports, accidental rounding, network or LLM
   calls, and unsafe rendering. Confirm that subtasks are not double-counted.
4. Audit all user-visible output and committed evidence. Do not expose message
   content, tool arguments, task titles, commands, credentials, usernames, or
   private paths. Redact evidence flagged as redactable.
5. Report changed files, acceptance evidence, exact verification commands and their
   results, plus any criterion that remains manual or unverified. A blocked or
   unmeasured criterion must not be presented as complete.
