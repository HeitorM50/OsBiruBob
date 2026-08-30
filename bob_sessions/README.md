# IBM Bob session evidence

Sanitised exports and task-summary screenshots produced while building Hindsight
with IBM Bob. The official hackathon guide requires relevant summary screenshots
from every team member; this directory contains evidence from Heitor, Gustavo,
Hugo, Pedro, and Philipe.

## Naming convention

```text
team_taskNN_short-description_summary.png
```

Example: `osbirubob_task01_round-a-baseline_summary.png`.

Sanitised exports use the same prefix and end in `_export.json`. Raw exports and
screenshots end in `.raw-export.json` / `.raw-summary.png`, are ignored by Git, and
must never be committed.

## Review rules

- Keep every relevant run, including failed or invalid experimental attempts.
- Capture the Bob task summary, including the metrics available in that Bob version.
- Record unavailable screenshot-only metrics as unavailable, never as zero.
- Use PNG whenever possible.
- Before committing, visually inspect the image for credentials, private paths,
  prompts, transcripts, personal data, and customer data.
- Committed exports must not contain message bodies, task titles, tool arguments,
  approved commands, or private paths. Preserve only identifiers, structure, and
  the metrics needed as evidence.

The complete sanitisation and measurement procedure is documented in
[`docs/configuracao-bob.md`](../docs/configuracao-bob.md).
