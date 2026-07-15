# InterviewPro — Enterprise Technical Interview Platform

## Purpose
Multi-tenant SaaS platform for standardising technical interviews across organisations. Interviewers schedule sessions, conduct live Q&A, record answers, score candidates, generate AI summaries, and export PDF reports.

---

## Folder Structure

```
interview-platform/
├── apps/
│   ├── api/                         # Fastify REST API (port 3001)
│   │   ├── prisma/
│   │   │   ├── schema.prisma        # Single source-of-truth DB schema
│   │   │   └── seed.ts
│   │   ├── src/
│   │   │   ├── app.ts               # Fastify factory, all plugins + routes registered here
│   │   │   ├── server.ts            # Entry point — calls buildApp(), initSentry(), starts listening
│   │   │   ├── config/env.ts        # Zod-validated env; process.exit(1) on bad env
│   │   │   ├── lib/
│   │   │   │   ├── ai.ts            # Anthropic Claude wrapper (question generation)
│   │   │   │   ├── auth.ts          # Better Auth instance
│   │   │   │   ├── prisma.ts        # Singleton PrismaClient
│   │   │   │   ├── queue.ts         # BullMQ queue + worker factory (ai-summary queue)
│   │   │   │   ├── redis.ts         # ioredis singleton
│   │   │   │   └── sentry.ts        # Sentry init (no-op when SENTRY_DSN not set)
│   │   │   ├── plugins/
│   │   │   │   ├── auth.plugin.ts   # Decorates request.user from Better Auth session cookie
│   │   │   │   ├── tenant.plugin.ts # Decorates request.organizationId from x-organization-id header
│   │   │   │   └── rbac.plugin.ts   # requirePermission() helper (not yet wired into routes)
│   │   │   ├── modules/
│   │   │   │   ├── auth/            # Login, register, logout, me, forgot/reset password
│   │   │   │   ├── organizations/   # Org CRUD, member invite/remove/list
│   │   │   │   ├── roles/           # Role + Permission CRUD, role assignment to members
│   │   │   │   ├── questions/       # Question CRUD, AI generation, bulk save
│   │   │   │   ├── candidates/      # Candidate CRUD, CSV import
│   │   │   │   ├── sessions/        # Session CRUD, lifecycle (start/complete/cancel/reactivate), answers, notes
│   │   │   │   ├── assessments/     # Score answers (upsert single + bulk), get session assessment
│   │   │   │   ├── summaries/       # Enqueue AI summary job, get summary status/result
│   │   │   │   ├── reports/         # Build report data, generate PDF via Puppeteer, email via Resend
│   │   │   │   └── analytics/       # Org-level metrics, time series, score distribution, top questions
│   │   │   └── types/fastify.d.ts   # Augments FastifyRequest with user, organizationId
│   │   └── tests/
│   │       ├── integration/         # Fastify inject() tests — 49 passing
│   │       └── unit/                # Zod schema tests — 132 passing
│   │
│   └── web/                         # Next.js 14 App Router frontend (port 3000)
│       └── src/
│           ├── app/
│           │   ├── (auth)/          # login, register, forgot-password, reset-password
│           │   ├── (dashboard)/
│           │   │   ├── dashboard/   # Analytics dashboard (Recharts)
│           │   │   ├── candidates/  # Candidate list + CRUD + CSV import
│           │   │   ├── questions/   # Question bank + AI generate modal + edit/delete
│           │   │   ├── sessions/    # Session list + schedule modal
│           │   │   ├── sessions/[id]/        # Live interview (answer recording, flags, notes)
│           │   │   ├── sessions/[id]/assess/ # Post-interview scoring UI + AI summary
│           │   │   ├── sessions/[id]/report/ # Report viewer + PDF download + email modal
│           │   │   ├── settings/    # Org settings (name, slug, delete)
│           │   │   ├── settings/members/     # Member invite/remove
│           │   │   └── settings/roles/       # Role + permission management
│           │   └── organizations/new/        # Create first org flow
│           ├── components/features/organizations/org-switcher.tsx
│           ├── hooks/               # TanStack Query hooks — one file per domain
│           ├── lib/
│           │   ├── api.ts           # Typed fetch wrapper (get/post/put/patch/delete)
│           │   └── auth-client.ts   # Better Auth browser client
│           └── middleware.ts        # Next.js edge middleware — redirects unauthenticated users
│
└── packages/
    └── shared/                      # Zod schemas + TypeScript types shared between API and web
        └── src/schemas/             # auth, candidates, questions, sessions, assessments, roles, org
```

---

## Tech Stack

| Layer | Choice |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Backend | Fastify 4 + TypeScript |
| ORM | Prisma 5 + PostgreSQL |
| Cache/Queue | Redis + BullMQ |
| Auth | Better Auth (session cookie, no JWT) |
| Frontend | Next.js 14 App Router + TypeScript |
| UI | Tailwind CSS + shadcn/ui primitives + lucide-react icons |
| State | TanStack Query v5 |
| Forms | React Hook Form + Zod (schemas shared with API) |
| Charts | Recharts |
| AI | Anthropic Claude (`claude-sonnet-4-6`) |
| PDF | Puppeteer (server-side HTML → PDF) |
| Email | Resend |
| Error tracking | Sentry (optional) |
| Testing | Vitest v2 (unit + integration), Playwright (e2e) |

---

## Completed Features

- **Auth**: Register, login, logout, forgot password, reset password (Better Auth, email+password)
- **Organizations**: Create, update, delete; org switcher in sidebar
- **Members**: Invite by email (adds to org), remove member, list with search + pagination
- **Roles & Permissions**: Create/update/delete custom roles, assign permissions, assign roles to members (RBAC model built, not enforced on routes yet)
- **Question Bank**: CRUD (create, edit, delete), AI generation via Claude (requires paid API credits), global vs org-private questions, search + filter by category/difficulty/tags, pagination
- **Candidates**: CRUD, CSV import (drag-drop or file picker), search, sort, pagination
- **Interview Sessions**: Schedule (title, candidate, questions, optional time), start, complete, cancel, reactivate cancelled sessions, list with filters
- **Live Interview**: Answer recording per question with autosave (1.5 s debounce), flag answers for review, interviewer notes (autosave), question navigation, answer-per-question state isolation (key prop fix)
- **Assessment / Scoring**: Bulk score answers 1–5 with notes, per-category averages, overall average
- **AI Summary**: Async BullMQ job → Claude generates strengths/concerns/recommendation/score; stored as JSONB; polled on frontend
- **Reports**: Structured HTML report with full transcript + scores + AI summary, PDF download via Puppeteer, email via Resend
- **Analytics Dashboard**: Session counts by status, sessions-over-time area chart, score distribution bar chart, top questions table, recent sessions list, date preset selector (7d/30d/90d/365d)
- **Deployment Config**: vercel.json (web)
- **Testing**: 181 tests passing (132 unit Zod schema tests + 49 integration tests via Fastify inject)

## Half-Done Features

- **RBAC enforcement**: `rbac.plugin.ts` exists with `requirePermission()` but it is NOT applied to any route handler — roles exist in DB and UI but have no access-control effect at runtime
- **Email delivery**: `RESEND_API_KEY` is optional; if not set, email endpoints return 503. Email report feature is built but untested end-to-end without a real Resend key
- **AI Summary in production**: Requires paid Anthropic API credits. The BullMQ worker is wired but the queue worker process is not run separately — in dev the worker runs inside the API process

## Not Started

- Candidate portal / public interview link (candidate self-service)
- Real-time collaboration (multiple interviewers on the same session)
- Webhook notifications (e.g. on session complete)
- OAuth / SSO login (Google, GitHub)
- Question import from CSV
- Time-limit enforcement in live session (timer exists in schema, UI timer component referenced but not implemented)
- Notification/email for interview invites to candidates
- Audit log

---

## Environment Variables

**API (`apps/api/.env`)**

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `BETTER_AUTH_SECRET` | Yes | Min 32-char secret for session signing |
| `BETTER_AUTH_URL` | Yes | Full URL of the API (e.g. `http://localhost:3001`) |
| `FRONTEND_URL` | Yes | Full URL of the web app (used for CORS) |
| `PORT` | No | API port (default 3001) |
| `NODE_ENV` | No | `development` / `production` / `test` |
| `ANTHROPIC_API_KEY` | No | Claude API key — needed for AI question gen + summary |
| `RESEND_API_KEY` | No | Resend key — needed for email report feature |
| `FROM_EMAIL` | No | Sender address for emails |
| `SENTRY_DSN` | No | Sentry DSN — error tracking (optional) |

**Web (`apps/web/.env.local`)**

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Yes | API base URL (e.g. `http://localhost:3001/api/v1`) |
| `NEXT_PUBLIC_AUTH_URL` | Yes | Auth base URL (same as API, e.g. `http://localhost:3001`) |

---

## Coding Conventions

- **Error pattern in services**: `const err: any = new Error(msg); err.statusCode = 4xx; err.code = "SNAKE_CASE"; throw err;` — Fastify error handler maps statusCode to HTTP response
- **Route files**: thin — parse params/body, call service, `reply.send({ data: result })`
- **Service files**: all business logic, all DB access via Prisma
- **Shared schemas**: Zod schemas in `packages/shared/src/schemas/` — imported by both API (for validation) and web (for RHF resolver). Types derived via `z.infer<typeof Schema>`
- **Pagination**: `paginate(page, limit)` returns `{ skip, take }`; `paginationMeta(total, page, limit)` returns `{ total, page, limit, totalPages }`; responses always `{ data: [], meta: {...} }`
- **API client (web)**: `api.get/post/put/patch/delete` in `lib/api.ts` — always sends `Content-Type: application/json` and `credentials: include`; passes `x-organization-id` header from orgId param
- **Org scoping**: Every protected API call passes `orgId` as the third arg to `api.*()`, which sets the `x-organization-id` header; `tenant.plugin.ts` reads it and decorates `request.organizationId`
- **Form pattern**: `useForm({ resolver: zodResolver(Schema), defaultValues })` + error display `{errors.field && <p>{errors.field.message}</p>}`
- **Toast notifications**: `sonner` — `toast.success()` / `toast.error()`
- **Lifecycle routes**: POST to `/sessions/:id/start|complete|cancel|reactivate` — send empty body `{}` (api.post always sends Content-Type: application/json)
- **No comments by default**: Code is self-documenting; comments only for non-obvious constraints
- **File naming**: `*.service.ts`, `*.routes.ts` per module; React hooks in `hooks/use-{domain}.ts`

---

## Database Schema Summary

| Model | Key Fields | Notes |
|---|---|---|
| `User` | id, name, email, emailVerified | Better Auth managed |
| `Account` | userId, providerId, password | Better Auth credentials |
| `Session` | userId, token, expiresAt | Better Auth sessions |
| `PasswordResetToken` | userId, token, expiresAt, used | Custom reset flow |
| `Organization` | id, name, slug (unique), logo, website | Multi-tenant root |
| `OrganizationMember` | organizationId, userId, role (OWNER/ADMIN/MEMBER) | Junction; unique per org+user |
| `Role` | name, organizationId (null = global), isGlobal | Custom RBAC roles |
| `Permission` | action (e.g. "candidates:create"), resource | Unique by action |
| `RolePermission` | roleId, permissionId | Many-to-many |
| `RoleAssignment` | memberId, roleId | Assign roles to members |
| `Question` | organizationId (null = global), title, body, category, difficulty, tags[], isGlobal, aiGenerated | Shared or org-private |
| `Candidate` | organizationId, firstName, lastName, email, phone, resumeUrl, linkedinUrl | Unique per org+email |
| `InterviewSession` | organizationId, candidateId, interviewerId, title, scheduledAt, startedAt, completedAt, status (SCHEDULED/IN_PROGRESS/COMPLETED/CANCELLED), notes, aiSummary (JSON) | Core entity |
| `SessionQuestion` | sessionId, questionId, order, timeLimit | Ordered questions in a session |
| `Answer` | sessionQuestionId (unique), content, flagged | One answer per session question |
| `Assessment` | answerId (unique), score (1–5), notes | One assessment per answer |
| `Report` | sessionId (unique), pdfUrl, generatedAt | Report record (PDF stored externally) |
