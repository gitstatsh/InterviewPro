# Architectural Decisions

## Auth: Better Auth over custom JWT

**Decision:** Use Better Auth library with session cookies, not custom JWT.

**Why:** Better Auth handles the full session lifecycle (create, refresh, revoke), password hashing, and reset-token flows out of the box. Session cookies avoid the need for client-side token storage and token refresh logic. Inferred from `lib/auth.ts` using `betterAuth()` and all API routes checking `request.user` (decorated by the auth plugin from the session cookie), not a Bearer header.

---

## Multi-tenancy: Header-based org scoping

**Decision:** Every API request carries an `x-organization-id` header. The tenant plugin reads it and decorates `request.organisationId`. Every service function takes `organisationId` as a parameter and uses it in all DB queries.

**Why:** Simpler than URL-prefix scoping (`/orgs/:orgId/...`) — frontend doesn't need to know the org ID at the router level. All routes stay flat (`/candidates`, `/sessions`). The org ID is managed in the frontend's React context and injected via the API client's `orgId` parameter which sets the header.

---

## Shared Zod schemas package

**Decision:** Zod schemas live in `packages/shared` and are imported by both the API (for request validation) and the web (for React Hook Form resolvers).

**Why:** Single source of truth for validation rules and TypeScript types. Prevents drift between what the API accepts and what the form validates. Observed from both apps importing from `@interview/shared`.

---

## No Fastify schema validation — manual Zod parsing in routes

**Decision:** Routes call `Schema.parse(request.body)` manually rather than using Fastify's built-in `schema:` option with AJV.

**Why:** Fastify's AJV integration doesn't produce the same Zod-style error messages. Manual parsing gives cleaner error messages and keeps schemas in the shared package (not duplicated as JSON Schema). Inferred from route files: no `schema:` key on route definitions, but `Schema.parse()` calls inside handlers.

---

## BullMQ for AI jobs (not inline await)

**Decision:** AI summary generation is enqueued into a BullMQ queue and processed asynchronously, not awaited inline in the HTTP request.

**Why:** Claude API calls take 10–20 seconds. Blocking the HTTP request would time out and give poor UX. The frontend polls `GET /summaries/:sessionId` until status changes from `pending` to `completed`. Inferred from `queue.ts`, `summaries.service.ts` (enqueueSummary vs generateSummary split), and frontend poll logic in `use-summary.ts`.

---

## Puppeteer for PDF (server-side render)

**Decision:** PDF reports are generated server-side by Puppeteer rendering an HTML template.

**Why:** Allows the report to use full CSS/layout (not limited by a PDF library's layout engine). The template (`report-template.ts`) is pure HTML/CSS, which is easy to maintain and print-style. No client-side PDF generation library needed.

---

## Prisma with raw SQL for analytics

**Decision:** Analytics queries use `prisma.$queryRaw` for the complex aggregations (time series, score distribution, top questions) and Prisma ORM for simpler queries.

**Why:** Prisma's `groupBy` and raw aggregation support is limited for multi-join queries. Raw SQL is more readable and performant for the cross-table aggregations needed. Observed in `analytics.service.ts`.

---

## Status as DB enum, not free-form string

**Decision:** `SessionStatus`, `QuestionDifficulty`, and `MemberRole` are PostgreSQL enums defined in the Prisma schema.

**Why:** Enforces valid values at the DB layer, not just application layer. Prevents invalid status transitions from being persisted even if application code has a bug.

---

## Answer upsert, not insert-or-update

**Decision:** Answer recording uses `prisma.answer.upsert()` keyed on `sessionQuestionId`.

**Why:** The live session view autosaves on every keystroke (debounced 1.5 s). The first save creates the Answer record; all subsequent saves update it. Upsert is idempotent and avoids a read-before-write pattern. Same pattern used for assessments.

---

## Next.js production build in dev (workaround)

**Decision:** Local development uses `next build && next start` instead of `next dev`.

**Why:** `next dev` fails on macOS with EMFILE (too many open files) from Watchpack — the file watcher exceeds the default OS limit for open file handles when monitoring the monorepo's `node_modules`. `next start` runs the pre-built output and has no watcher. This is a known macOS limitation, not a code issue.

---

## Resend + Anthropic as optional services

**Decision:** `RESEND_API_KEY` and `ANTHROPIC_API_KEY` are both `optional()` in the env schema. Features that need them fail gracefully with a 503 response if not configured.

**Why:** Allows the platform to run locally for development without setting up external accounts. Core features (session management, scoring, reporting HTML) work without them. Only AI generation and email delivery require the keys.

---

## CUID for all IDs

**Decision:** All model primary keys use `@default(cuid())`.

**Why:** CUIDs are URL-safe, k-sortable (monotonically increasing), and collision-resistant without a central sequence. They don't expose insertion order as obviously as auto-increment integers, and work well in distributed/multi-instance environments. Inferred from every model in schema.prisma.
