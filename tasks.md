# Tasks

## Completed [x]

### Phase 1 — Auth & Setup
- [x] Monorepo scaffold (pnpm + Turborepo)
- [x] Prisma schema — all models defined
- [x] Fastify app with plugins (CORS, cookie, rate-limit, auth, tenant)
- [x] Better Auth integration (email+password, session cookie)
- [x] Auth routes: register, login, logout, me, forgot-password, reset-password
- [x] Next.js 14 App Router setup
- [x] Auth pages: login, register, forgot-password, reset-password
- [x] Auth client setup (Better Auth browser client)
- [x] Protected route middleware (Next.js edge middleware)
- [x] Shared Zod schemas package

### Phase 2 — Organizations & Members
- [x] Organization CRUD (create, read, update, delete)
- [x] Org switcher in sidebar
- [x] Invite members by email
- [x] Remove members
- [x] Member list with search + pagination

### Phase 3 — Roles & Permissions
- [x] Role CRUD (create, update, delete)
- [x] Permission model + seed data
- [x] Assign permissions to roles
- [x] Assign roles to org members
- [x] Roles UI (settings/roles page)

### Phase 4 — Question Bank
- [x] Question CRUD (create, edit, delete)
- [x] Global vs org-private questions
- [x] AI question generation via Claude API (requires paid credits)
- [x] Bulk save AI-generated questions
- [x] Search + filter by category, difficulty, tags
- [x] Pagination

### Phase 5 — Candidates
- [x] Candidate CRUD (create, edit, delete)
- [x] CSV import (drag-drop or file picker, preview before import)
- [x] Search, sort, pagination
- [x] Candidate profile fields (email, phone, resume URL, LinkedIn)

### Phase 6 — Interview Sessions
- [x] Schedule interview (title, candidate, questions, optional scheduled time)
- [x] Session list with status filter + search + pagination
- [x] Session lifecycle: SCHEDULED → IN_PROGRESS → COMPLETED
- [x] Cancel session
- [x] Reactivate cancelled session (restored to SCHEDULED)
- [x] Live interview view with per-question navigation
- [x] Answer recording with 1.5 s autosave debounce
- [x] Flag answers for review
- [x] Interviewer notes with autosave
- [x] Answer-per-question state isolation (key prop on AnswerEditor)

### Phase 7 — Assessment Engine
- [x] Score each answer (1–5) with notes
- [x] Bulk assessment upsert
- [x] Per-category score averages
- [x] Overall average score
- [x] Assessment summary page (sessions/[id]/assess)

### Phase 8 — AI Summary
- [x] BullMQ async job queue (ai-summary)
- [x] Claude generates: strengths, concerns, recommendation, scores, insights
- [x] Stored as JSONB on InterviewSession
- [x] Frontend polls summary status, renders when complete
- [x] Error handling + retry (3 attempts, exponential backoff)

### Phase 9 — Reports & PDF
- [x] Structured report page (sessions/[id]/report)
- [x] PDF generation via Puppeteer (full HTML report → PDF buffer)
- [x] PDF download endpoint
- [x] Email report via Resend (with PDF attachment)
- [x] Email modal UI (add/remove recipients)

### Phase 10 — Analytics Dashboard
- [x] Session counts by status (stat cards)
- [x] Sessions-over-time area chart (daily, collapses to weekly >60 days)
- [x] Score distribution bar chart
- [x] Top 10 questions table (usage count + avg score)
- [x] Recent completed sessions list
- [x] Date preset selector: 7d / 30d / 90d / 365d

### Phase 11 — Testing
- [x] 132 unit tests (Zod schema validation)
- [x] 49 integration tests (Fastify inject, mocked DB/Redis/auth)
- [x] Playwright e2e scaffold (auth, candidates, dashboard, sessions specs)
- [x] Vitest v2 config

### Phase 12 — Deployment
- [x] Provider-neutral Next.js production build configuration
- [x] /health endpoint on API
- [x] Sentry error tracking (optional, no-op when DSN not set)
- [x] Pino structured logging

### Bug Fixes (post-build)
- [x] Login/reset-password 404 — added Suspense boundary around useSearchParams()
- [x] "At least one question required" on schedule modal — synced selectedQIds to RHF via setValue
- [x] scheduledAt validation failure — convert datetime-local to ISO before submit
- [x] Session answer bleeding across questions — added key={currentSQ.id} to AnswerEditor
- [x] Reactivate route not found — API restart required to pick up new route

---

## Half-Done [~]

- [~] **RBAC enforcement on routes** — rbac.plugin.ts has requirePermission() helper but it is never called in any route handler; roles exist in DB/UI but have no runtime access-control effect
- [~] **Email invitations** — invite member endpoint creates DB record but does NOT send an actual email (no email service call in organizations.service.ts invite function); RESEND_API_KEY exists only for report emails
- [~] **Time-limit enforcement** — timeLimit stored on SessionQuestion in DB, schema supports timeLimits map in SessionCreateInput, but no countdown timer UI in live session view
- [~] **Playwright e2e tests** — specs exist for auth/candidates/dashboard/sessions but are scaffolded with basic assertions only; no full happy-path flows tested

---

## Pending [ ] — Priority Order

### High Priority (core UX gaps)
- [ ] **RBAC route enforcement** — Wire requirePermission() to routes so roles actually restrict access. Needed for any production use.
- [ ] **Email invitation delivery** — Send actual invite email when a member is added. Currently silently skips email.
- [ ] **Question time-limit timer** — Show countdown in live session view. TimeLimit is already stored per SessionQuestion.
- [ ] **Candidate interview history** — Show a candidate's past sessions on their profile page (link exists via FK but no UI)
- [ ] **Candidate detail page** — Individual candidate view with interview history, notes, resume link

### Medium Priority (quality of life)
- [ ] **Resend API key setup** — Document and test full email report flow end-to-end
- [ ] **Session edit modal** — Edit title/scheduledAt/notes of a SCHEDULED session (API supports it, no frontend UI)
- [ ] **Question import from CSV** — Bulk import questions (only candidates have CSV import today)
- [ ] **Pagination on question bank** — Already paginated on API; confirm frontend handles all pages
- [ ] **Full Playwright e2e coverage** — End-to-end flows: register → create org → schedule → complete → assess → report
- [ ] **Answer-locking after complete** — Answers are already blocked in readonly mode; verify edge cases

### Low Priority (nice to have)
- [ ] **OAuth / SSO login** — Google / GitHub sign-in via Better Auth providers
- [ ] **Candidate portal** — Public link for candidates to see session details or submit written answers async
- [ ] **Real-time multi-interviewer** — WebSocket or Server-Sent Events for collaborative sessions
- [ ] **Webhook notifications** — POST to external URL on session status changes
- [ ] **Audit log** — Track who did what and when (create/update/delete events)
- [ ] **Question versioning** — Track edits to questions without breaking existing session records
- [ ] **Dark mode** — Tailwind dark: classes ready, just need theme toggle
