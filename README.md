# Interview Platform

Enterprise SaaS platform for standardizing technical interviews across organizations.

## Tech Stack

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Backend | Fastify + TypeScript + Prisma |
| Database | PostgreSQL |
| Cache | Redis |
| Auth | Better Auth |
| Frontend | Next.js 14 (App Router) |
| UI | shadcn/ui + Tailwind CSS |
| State | TanStack Query v5 |
| AI | Anthropic Claude |
| Testing | Vitest + Playwright |

## Prerequisites

- Node.js 20+
- pnpm 9+
- Access to PostgreSQL and Redis services when running the API

## Quick Start

### 1. Clone and install

```bash
cd interview-platform
pnpm install
```

### 2. Environment setup

```bash
# API
cp apps/api/.env.example apps/api/.env

# Web
cp apps/web/.env.example apps/web/.env.local
```

Edit both `.env` files with your values. At minimum:
- `BETTER_AUTH_SECRET` — any 32+ character random string
- `RESEND_API_KEY` — from resend.com (optional for development)
- `ANTHROPIC_API_KEY` — from console.anthropic.com (optional for Phase 1)

### 3. Run database migrations

```bash
pnpm db:migrate
```

### 4. Start development servers

```bash
pnpm dev
```

- **API**: http://localhost:3001
- **Web**: http://localhost:3000

## Testing

```bash
# Unit tests (all packages)
pnpm test

# API tests only
pnpm --filter api test

# Hosted E2E tests (uses E2E_BASE_URL from apps/web/.env)
corepack pnpm test:hosted

# Hosted Chrome tests with browser JavaScript coverage dashboard
corepack pnpm test:coverage

# Dedicated login and primary-page navigation smoke test
corepack pnpm test:automation

# Run the automation smoke test and regenerate the coverage dashboard
corepack pnpm test:automation:coverage
```

The credential-login tests read `E2E_LOGIN_EMAIL` and `E2E_LOGIN_PASSWORD`
from `apps/web/.env` and are skipped when they are not set. The reusable login
and sidebar scenarios live under `automationTestcase/`.

## Hosted automation

Playwright targets `https://app.techinterview.co.in` by default and does not
start local web, API, database, or Redis services. Run `corepack pnpm
test:hosted` for functional validation. Run `corepack pnpm test:coverage` to
capture per-test browser JavaScript coverage and generate the standalone
dashboard at `.cobra/dashboard/index.html`.

Until the hosted revision exposes commit-matched production source maps, the
dashboard reports generated browser-script coverage. Once those maps are
available, it also reports trusted source-line coverage. It requires no local
web, API, database, or Redis service.

### Safety-first COBRA runner

Use the stable suite in `automationTestcase/playwright.config.ts` to publish a
complete baseline mapping:

```bash
corepack pnpm cobra:baseline
# Validate discovery and deployment metadata without running tests:
corepack pnpm cobra:baseline --dry-run
```

Analyze two Git commits with the reviewed module map. This mode does not depend
on a hosting-provider deployment endpoint:

```bash
corepack pnpm cobra:impact:modules --base origin/main --head HEAD
corepack pnpm cobra:impact:modules --base origin/main --head HEAD --dry-run
```

`cobra.modules.json` maps application paths to stable Playwright tags. Shared,
configuration, test-infrastructure, or unknown paths run the full suite. The
strict source-line strategy remains available through `cobra:impact`; it
requires a commit-matched hosted deployment and trusted source maps.

Regenerate the static dashboard for the latest run or a named run:

```bash
corepack pnpm cobra:dashboard
corepack pnpm cobra:dashboard --run <run-id>
```

The unified dashboard separates two different metrics:

- **Whole source line touch** inventories every application source file,
  including untested files at 0%. It becomes selectable evidence only when a
  commit-matched deployment supplies source maps.
- **Loaded JavaScript coverage** is Chromium coverage for bundles observed by
  the hosted test. It is useful runtime evidence but is never used to match a
  Git source path.

For source-line selective execution, deploy this revision with
`COBRA_SOURCE_MAPS=1` and the `/api/cobra-build` endpoint, then run the baseline
against that exact deployment. The module strategy remains available without
those signals and falls back to all tests for every unreviewed path.

The authenticated `/cobra/analyze` and token-guarded Git webhook endpoints are
planning APIs only. Verified test execution is intentionally limited to
`cobra:impact` (and `.github/workflows/cobra.yml`) because the runner must own a
real checkout of both revisions. Every impact outcome writes a dashboard
snapshot, including deployment mismatches and zero-test decisions.

## API Endpoints (Phase 1)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/health` | Health check |
| POST | `/api/v1/auth/sign-up/email` | Register |
| POST | `/api/v1/auth/sign-in/email` | Login |
| POST | `/api/v1/auth/sign-out` | Logout |
| POST | `/api/v1/auth/forget-password` | Request password reset |
| POST | `/api/v1/auth/reset-password` | Reset password |
| GET | `/api/v1/me` | Current user profile (authenticated) |

### Example: Register

```bash
curl -X POST http://localhost:3001/api/v1/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"name":"Jane Smith","email":"jane@example.com","password":"SecurePass1"}'
```

### Example: Login

```bash
curl -X POST http://localhost:3001/api/v1/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"email":"jane@example.com","password":"SecurePass1"}'
```

### Example: Get current user

```bash
curl http://localhost:3001/api/v1/me \
  -b cookies.txt
```

## Project Structure

```
interview-platform/
├── apps/
│   ├── api/          # Fastify backend
│   └── web/          # Next.js frontend
├── packages/
│   └── shared/       # Shared Zod schemas + types
```

## Phases

- [x] Phase 1 — Project Setup + Authentication
- [ ] Phase 2 — Organizations + User Management
- [ ] Phase 3 — Role Management
- [ ] Phase 4 — AI Question Bank
- [ ] Phase 5 — Candidate Management
- [ ] Phase 6 — Interview Sessions
- [ ] Phase 7 — Assessment Engine
- [ ] Phase 8 — AI Summary
- [ ] Phase 9 — Reports & PDF
- [ ] Phase 10 — Dashboard & Analytics
- [ ] Phase 11 — Testing
- [ ] Phase 12 — Deployment
