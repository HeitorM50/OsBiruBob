---
name: create-synthetic-fixture
description: Create a minimal privacy-safe Bob export fixture for a detector scenario absent from the real Hindsight baseline.
---

Use this Skill for detector scenarios such as redundant read, retry after failure,
or human intervention that do not occur in `fixtures/sample-export.json`.

1. Read the detector's exact signal in `docs/domain-model.md` and only the relevant
   export fields in `docs/schema.md`.
2. Build the smallest schema-valid export that plants one causal signal. Keep all
   unrelated signals neutral so the test proves why the detector fired.
3. Use deterministic fake identifiers, 13-digit epoch-millisecond timestamps,
   `file:/workspace/hindsight-fixture`, generic relative paths such as
   `src/example.ts`, and `[REDACTED]` message content. Never copy a real transcript,
   command, tool argument, credential, username, or absolute machine path.
4. Preserve Bob schema traps: correlate tool calls by ID, put `_meta.spend` only on
   assistant messages, order by `_meta.timestamp`, and mark subtasks with a non-null
   `parentId`.
5. Test both the planted positive case and the unchanged baseline negative case.
   Run `npm test` and `npm run typecheck`.
