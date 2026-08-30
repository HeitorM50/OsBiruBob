# Third-party notices and public sources

Reviewed for the submission candidate on 30 August 2026. This file records
direct dependencies and public sources; transitive package metadata remains in
`package-lock.json`.

## Runtime dependencies

| Package | Licence | Use |
|---|---|---|
| React / React DOM | MIT | Browser UI |
| Zod | MIT | Export validation |
| Chalk | MIT | Development CLI output |

## Direct development dependencies

| Package | Licence |
|---|---|
| Testing Library React | MIT |
| React and Node type definitions | MIT |
| Vite and `@vitejs/plugin-react` | MIT |
| Vitest and `@vitest/coverage-v8` | MIT |
| jsdom | MIT |
| tsup | MIT |
| tsx | MIT |
| TypeScript | Apache-2.0 |
| vite-plugin-singlefile | MIT |

These packages are installed from npm under the licences recorded in the lockfile.
Only the runtime packages and application code are present in the published static
bundle.

## Benchmark source

- [`IBM/bob-demo`](https://github.com/IBM/bob-demo), commit `cb10cdfb`,
  Apache-2.0. It provided the public `bob-get-started/express-todo-api-modern`
  task used in the A/B experiment. Hindsight stores redacted Bob session metrics
  produced while working on that repository; it does not redistribute its source.

## Catalogue references

`data/mcp-catalog.json` links to the public documentation repositories below to
identify existing MCP implementations. No code, binary, package, or documentation
from them is copied, installed, or loaded at runtime:

- `ckreiling/mcp-server-docker`
- `modelcontextprotocol/servers`
- `github/github-mcp-server`
- `strowk/mcp-k8s-go`
- `aws/amazon-q-developer-cli`

Each catalogue entry is team-authored metadata. A recommendation is not an
installation; users must review the referenced project's current licence and
security posture before enabling it.

Licence metadata checked through the GitHub API on 30 August 2026: Docker MCP is
GPL-3.0; GitHub MCP and `mcp-k8s-go` are MIT; Amazon Q Developer CLI is
Apache-2.0. The `modelcontextprotocol/servers` repository reports no single
repository-wide SPDX licence, so the licence of the specific server directory
must be reviewed before use. These terms do not affect the Hindsight bundle
because catalogue targets are links only.

## Contest material and trademarks

The PDFs in `rules/` were provided by the organisers to hackathon participants and
are retained only as the normative compliance reference for this submission.
IBM, IBM Bob, and IBM watsonx are IBM trademarks. Their mention identifies the
platform and does not imply endorsement.

## Design prototype

Files under `prototipo/` are a design reference created during the event. They are
not imported by the application and are excluded from `dist/web/`. The deployed UI
uses bundled npm dependencies and a locally defined data-URI favicon; it loads no
external font, image, script, analytics, or telemetry resource.
