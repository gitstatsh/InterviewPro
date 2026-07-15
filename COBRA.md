# COBRA — Code OBserver and Risk Analytics

> **Safety rule:** Source-line selection requires a verified deployment and
> trusted mapping. Deployment-independent module selection skips tests only
> when every changed path has a reviewed rule in `cobra.modules.json`.
> Shared, unknown, or invalid mappings always select full regression.

COBRA maps Playwright tests to application source through Chromium V8 coverage,
analyzes Git changes, runs only impacted tests, collects results, and exposes a
standalone dashboard at `.cobra/dashboard/index.html`. All state is stored below `.cobra/` (or
`COBRA_STORAGE_DIR`) so the engine does not require a separate database.

## Runtime flow

1. `cobra:impact:modules` validates the Git repository and resolves exact base/head SHAs.
2. The Git adapter compares the exact base/head trees and parses rename-aware
   zero-context diff hunks, including type changes and per-hunk structure.
3. The module analyzer maps every changed path to stable Playwright tags.
4. Shared, unknown, or invalid paths select the full stable suite.
5. The strict `cobra:impact` strategy separately verifies source lines and the
   `/api/cobra-build` deployment when that hosting integration is available.
6. Results, mappings, coverage and build history are rendered in one dashboard.

If any changed file or line has no mapping, COBRA deliberately chooses
`full-regression`. This implements the architecture review's safety fallback
for new or previously uncovered code.

## Initial learning / mapping

Run the stable suite once against the commit-matched hosted deployment:

```bash
corepack pnpm cobra:baseline
```

For every test, COBRA captures:

- browser coverage through Playwright's Chromium coverage API;
- source paths/lines through deployed source maps when available;
- stable Playwright test identity, spec file, result and duration.

The run is stored under `.cobra/runs/<runId>/`. A durable lookup index is
maintained at `.cobra/mappings/latest.json`. Starting or partially completing a
baseline never erases the previous mapping: promotion is atomic and requires
the exact discovered test count with every test passing. Skipped, failed,
timed-out, interrupted, missing, or mismatched records reject promotion.

The dashboard separately inventories every TS/TSX/JS/JSX application file.
Never-loaded or unmapped files remain visible at 0%. Hosted chunk coverage is
shown separately and is not treated as repository-source evidence.

### Build-only local source-map fallback

When the hosted Next.js deployment does not publish browser source maps, COBRA
can try source maps from an equivalent local production build. This command
only builds the web application and writes artifacts under `apps/web/.next`;
it does not start or host a local application server:

```bash
corepack pnpm cobra:source-maps
```

Then point the hosted baseline run at the generated static artifacts. In
PowerShell:

```powershell
$env:COBRA_LOCAL_SOURCE_MAP_DIR = "apps/web/.next/static"
corepack pnpm cobra:baseline --base-url "https://app.techinterview.co.in"
Remove-Item Env:COBRA_LOCAL_SOURCE_MAP_DIR
```

In Bash:

```bash
COBRA_LOCAL_SOURCE_MAP_DIR=apps/web/.next/static \
  corepack pnpm cobra:baseline --base-url "https://app.techinterview.co.in"
```

This fallback is deliberately strict. A local map is used only when its built
JavaScript exactly matches the hosted browser chunk after removing only a final
`sourceMappingURL` line. It reports browser/client source-line **touch
coverage** for those matched chunks only; it is not statement, branch, API, or
server coverage. Chunks without an exact match remain generated-only coverage
and are never presented as repository source lines.

Local chunk matching also does not verify which commit is deployed. A baseline
created this way remains deployment-unverified unless `/api/cobra-build`
independently confirms the hosted commit. It therefore cannot authorize
selective test skipping; COBRA continues to use the full-regression safety
fallback when deployment identity is unavailable.

## Running the engine

Run a Git change locally or in CI without a deployment integration:

```bash
corepack pnpm cobra:impact:modules --base origin/main --head HEAD
corepack pnpm cobra:dashboard
```

The reviewed path-to-test rules are stored in `cobra.modules.json`. Each test
uses a stable `@cobra:<module>` tag. Added, deleted, renamed, or structurally
changed files can be selected when every involved path is mapped; any unknown
path runs all tests.

Impact mode requires real Git history. The public application repository is
`https://github.com/gitstatsh/InterviewPro.git`; clone it normally or keep this
workspace's `origin` attached to that repository before using `cobra:impact`.
The pure Git adapter is also covered by temporary-repository tests.

API and webhook intake are analysis-only and create `planned` build records.
They cannot launch tests because an API payload does not prove that the worker
has the requested Git trees or that the target deployment matches them.
`"execute": true` (or `COBRA_AUTO_RUN=1`) therefore returns
`VERIFIED_RUNNER_REQUIRED`. Run `cobra:impact` from the checked-out repository,
or use `.github/workflows/cobra.yml`, for verified execution.

Example generic/GitHub-compatible webhook:

```bash
curl -X POST http://localhost:3001/api/v1/cobra/webhooks/git \
  -H "Content-Type: application/json" \
  -H "x-cobra-token: dev-cobra-secret" \
  -d '{
    "after": "abc123",
    "ref": "refs/heads/main",
    "changedFiles": [
      {
        "path": "apps/api/src/modules/candidates/candidates.service.ts",
        "status": "modified",
        "lines": [20, 21]
      }
    ]
  }'
```

Standard GitHub push payload `commits[].added`, `modified`, and `removed`
arrays are accepted. Those payloads do not contain line hunks, so COBRA treats
each listed path as a whole-file change.

## Services and files

| Architecture service | Implementation |
|---|---|
| Intake service | `apps/api/src/modules/cobra/cobra.routes.ts` |
| Impact analyzer | `apps/api/src/modules/cobra/cobra-impact.ts` |
| Module fallback analyzer | `apps/api/src/modules/cobra/cobra-module-impact.ts`, `cobra.modules.json` |
| Mapping service | `apps/web/tests/support/cobra/cobra-persist.ts` |
| Git adapter | `apps/api/src/modules/cobra/cobra-git.ts` |
| Verified test orchestrator | `scripts/cobra-runner.ts` |
| Result collector | `apps/web/tests/support/cobra/cobra-fixture.ts`, `cobra-persist.ts` |
| Storage layer | `apps/api/src/modules/cobra/cobra.storage.ts`, `.cobra/` |
| Unified static dashboard | `apps/web/tests/support/cobra/cobra-dashboard.ts`, `.cobra/dashboard/index.html` |
| Deployment identity gate | `apps/web/src/app/api/cobra-build/route.ts` |

The capture endpoints remain token-guarded and are registered only when
`TEST_MODE=1` or `COBRA_ENABLED=1`. Do not expose a development token in a
public environment.

## API

- `POST /api/v1/cobra/webhooks/git` — token-authenticated Git intake.
- `POST /api/v1/cobra/analyze` — authenticated manual analysis.
- `GET /api/v1/cobra/dashboard` — build and mapping summary.
- `GET /api/v1/cobra/builds/:id` — one build and its results.
- `GET /api/v1/cobra/mappings` — test-to-code drill-down data.
- `POST /api/v1/cobra/mappings/refresh` — rebuild mapping from a stored run.

## Execution boundary

The analyze/webhook endpoints persist plans only. The CLI owns all test
execution and always writes a dashboard snapshot, including preflight failures
and valid changes that select zero tests.

## CI

`.github/workflows/cobra.yml` checks out full history and runs module impact on
every push or pull request without waiting for a deployment. A manually
requested source baseline still verifies the hosted revision. The workflow
uploads mappings, builds, runs, Playwright reports, and the standalone
dashboard. Configure these staging-only secrets:

- `COBRA_E2E_BASE_URL`
- `COBRA_E2E_LOGIN_EMAIL`
- `COBRA_E2E_LOGIN_PASSWORD`

The module strategy uses the URL as the test target without claiming it is the
Git head. Manual source-line baselines still require `/api/cobra-build` and
`COBRA_SOURCE_MAPS=1`.

## Storage layout

```text
.cobra/
  mappings/latest.json
  builds/<buildId>.json
  runs/<runId>/
    index.json
    <testId>.json
```

`.cobra/` is ignored by Git because it contains runtime output, not source.
