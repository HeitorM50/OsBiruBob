# Final compliance, security, licence, and reproducibility gate

Audit started on **30 August 2026 at 05:05 BRT** and last updated at **05:46 BRT**.
The Official Rules PDF in `rules/` is the normative source.

## Gate status

**STOP — conditional, not yet approved for final submission.**

The current tree passes the automated product, production dependency, bundle, and
current-file privacy checks below. Final approval is blocked by the manual items at
the end of this document and by raw session content that remains reachable in old
Git history. The exact commit SHA will be posted to issue #30 after this checklist
is committed; a commit cannot contain its own hash.

Baseline from which this audit branch started:
`1249e6dfbf88294ccaa13d57a71f0dcddd9aaf27`.

## Official deliverables

| Deliverable | Evidence | Status |
|---|---|---|
| Video demo including Bob usage | `docs/submission/video-script.md`; issue #25 | **Manual: public video not yet recorded/linked** |
| Problem and solution statement | `docs/submission/problem-solution.md`, 466 words including headings and table text | Pass |
| IBM Bob usage statement | `docs/submission/bob-usage.md` | Pass, subject to team confirmation |
| Working repository and Bob reports | public repository, public demo, `bob_sessions/` | Pass for current tree |

The README, UI, problem/solution statement, Bob usage statement, and video script
are in English. Final form submission and consistency across all four deliverables
remain manual.

## Repository and reproducibility

- [x] Repository visibility reported as `PUBLIC` and anonymous HTTP returned 200.
- [x] Homepage is `https://heitorm50.github.io/OsBiruBob/` and repository
  description is populated in English.
- [x] Published page returned HTTP 200 in an incognito headless Chromium session.
- [x] “See an example” completed with zero browser console errors.
- [x] Browser performance log contained exactly one request: the page's own static
  HTML. No runtime API, font, image, analytics, or telemetry request occurred.
- [x] Local `file://` build opened and the embedded example completed with zero
  console errors and exactly one local-file request.
- [x] Static build is one self-contained `dist/web/index.html`, 339,680 bytes
  (94,250 bytes gzip in the Vite report).
- [x] `README.md` documents Node 20, install, web development, build, preview, demo,
  and verification commands.
- [ ] Re-run the complete suite from a clean clone at the final candidate SHA.
- [ ] Confirm green CI and Pages deploy for that exact final SHA.

Commands already run successfully on the audit tree:

```text
npm test                 27 files, 545 tests passed
npm run typecheck        passed
npm run build:web        passed; one self-contained HTML file
npm run demo             passed; baseline cost $0.336902
node dist/cli.js --compare benchmark/rodada-a.json benchmark/rodada-b.json
                         valid comparison; fixed overhead −2,699 tokens
```

The latest pre-audit `main` SHA (`1249e6d`) also passed the full GitHub Actions
workflow on Node 20, including install, typecheck, 545 tests with coverage, web
build, offline-build assertions, CLI demo, and Pages deploy. This is supporting
evidence only; it does not replace CI on the final SHA.

## Licences and public sources

- [x] Root `LICENSE` contains the MIT licence declared in `package.json`.
- [x] `THIRD_PARTY_NOTICES.md` records direct dependencies, public sources,
  catalogue references, contest material, trademark use, and the design prototype.
- [x] Runtime dependencies (React, React DOM, Zod, Chalk) report MIT licences.
- [x] `IBM/bob-demo` is recorded at commit `cb10cdfb` and GitHub reports
  Apache-2.0. Its source is not redistributed; only redacted session metrics are.
- [x] Catalogue targets are links and metadata only; no third-party MCP code or
  package is bundled or installed.
- [x] React's licence notice remains in the minified static bundle.
- [x] No external font, image, script, analytics, or telemetry asset is used.

## Originality, team, and allowed content

- [x] Official contest start: 28 August 2026 at 11:00 BRT (10:00 ET).
- [x] First repository commit:
  `6c7fc288e13daa059d7072ee623c976a330be0bd`, authored 28 August 2026 at
  11:27:14 BRT — after the contest started.
- [x] Git author aliases resolve to five people: Heitor, Gustavo, Hugo, Pedro,
  and Philipe; no sixth contributor was found.
- [x] `bob_sessions/` contains PNG summary evidence for all five members:
  Gustavo 3, Heitor 11, Hugo 5, Pedro 6, Philipe 3.
- [x] All committed screenshot names follow
  `osbirubob_taskNN_description_summary.png`.
- [x] All 28 committed screenshots were visually reviewed. They show Bob task
  summaries or project work and no credential or private filesystem path was seen.
- [x] No executable payload, malware-like persistence, offensive, pornographic,
  defamatory, political, or religious content was found in the current tree.
- [ ] Team lead must confirm eligibility, one-team/one-entry status, declared
  affiliations, contributor permission, and voice/image consent.

## Secrets and privacy

### Current tree and published candidate bundle

- [x] High-confidence patterns for private keys and major cloud/source-control
  tokens produced no current-tree match.
- [x] Generic alerts were reviewed without publishing candidate values. The only
  matches were the safe `.env.example` placeholder and `sk-` spanning the public
  filename prefix `bob-task-`; neither is a credential.
- [x] No committed `.env`, private key, credential file, or raw-export/raw-summary
  file is present.
- [x] `.gitignore` and `.bobignore` protect environment files, IBM/API credential
  patterns, keys, raw Bob exports, raw screenshots, build output, and coverage.
- [x] Ignored local raw exports/screenshots were confirmed ignored and are not
  tracked. Their content was not copied into this report.
- [x] Round A, Round B, and the demo fixture have zero unredacted message bodies,
  task titles, private paths, prompt masks, approved commands, or free-form tool
  arguments. Only safe detector inputs and measured structure remain.
- [x] All committed Bob report exports have redacted message bodies, task titles,
  tool arguments, commands, and workspaces.
- [x] Tool and MCP catalogues contain public documentation URLs only; catalogue
  security tests pass.
- [x] Bundle scan found no private path, private key, cloud key, GitHub token,
  credential-bearing URL, transcript marker, external asset, or runtime network API.
- [x] Source boundary tests reject network APIs, unsafe HTML injection, Node APIs in
  the browser core, HTTP/LLM SDKs, and telemetry packages.

### Complete Git history and refs

- [x] `git log -p --all` and all refs were scanned for high-confidence credentials.
  No credential requiring rotation was found.
- [ ] **BLOCKER:** old commits and remote feature refs still contain now-removed raw
  Bob exports with project transcripts and absolute workstation paths. The values
  are deliberately not reproduced here. Removing them requires a coordinated
  history rewrite and force-push, followed by deleting stale remote branches and
  re-running every scan. Do not submit under the strict “no private path anywhere
  in history” criterion until this is resolved.

## Dependency security

`npm audit --omit=dev` reports **0 production vulnerabilities** across 8 production
dependencies. The published artefact is static and contains no development server.

The full `npm audit` reports 5 development-only findings: 2 critical, 1 high, and
2 moderate through Vitest, Vite, vite-node, and esbuild. Available automatic fixes
are breaking major upgrades. Decision for this time-boxed candidate:

- do not expose `npm run dev:web`, Vitest UI/watch servers, or source-map endpoints
  to an untrusted network;
- CI runs ephemeral local build/test commands only;
- the published bundle contains none of these servers;
- defer the coordinated Vite/Vitest major upgrade to a post-submission maintenance
  issue, rather than introduce unverified toolchain churn immediately before the
  deadline.

## Manual final actions — team lead

These statements cannot be proven from repository contents and require a person:

1. Confirm all five members' eligibility, affiliations, one-team/one-entry status,
   contribution permission, and any voice/image consent.
2. Record and upload the English video (≤3:00, ≥90 seconds of running product),
   verify anonymous access, and add its URL to the final submission.
3. Submit or update all four English deliverables together in the hackathon portal;
   confirm Advisor feedback has been addressed.
4. Decide whether to authorise the destructive Git history rewrite described above.
   If authorised: notify the team, freeze pushes, rewrite all affected refs, force
   push, delete stale remote branches, have collaborators re-clone, and repeat the
   full current-tree/history/bundle audit. If any credential is discovered during
   that process, revoke/rotate it before rewriting.
5. After the final compliance PR is merged, verify the repository, demo, and video
   in a fresh anonymous browser; capture the Network-panel evidence; then post the
   exact final SHA and command summary to issue #30.
6. Make no repository or submission changes after 30 August 2026 at 11:00 BRT.

## Final approval record

Final approval remains **unchecked** until every item below is true on one exact SHA:

- [ ] Clean-clone Node 20 reproduction passes.
- [ ] CI and Pages deploy are green on the same SHA.
- [ ] Repository, application, and video work anonymously.
- [ ] Four official deliverables are complete, mutually consistent, and English.
- [ ] History privacy blocker is resolved.
- [ ] Team/affiliation/consent declarations are confirmed.
- [ ] Audit is repeated immediately before submission.
