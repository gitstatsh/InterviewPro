# Project Progress

## What Was Built

All 12 planned phases are implemented. The platform is functionally complete for the core interview workflow:

1. **Auth system** — register, login, logout, password reset (Better Auth, session cookies)
2. **Multi-tenant organisations** — create org, invite/remove members, org switcher
3. **Role-based access control** — custom roles, permissions, assignments (model exists; enforcement pending)
4. **Question bank** — manual CRUD, AI generation via Claude, global/org-private questions
5. **Candidate management** — CRUD, CSV bulk import, search/sort/paginate
6. **Interview sessions** — schedule, start, complete, cancel, reactivate, live answer recording, notes, flags
7. **Assessment engine** — score answers 1–5 per question, per-category and overall averages
8. **AI summary** — async BullMQ → Claude generates hire recommendation + insights (stored as JSONB)
9. **PDF reports** — Puppeteer renders full HTML report to PDF; email via Resend
10. **Analytics dashboard** — Recharts charts, stat cards, top questions, date filtering
11. **Test suite** — 181 Vitest tests passing (132 unit + 49 integration); Playwright e2e scaffolded
12. **Deployment** — Dockerfiles, docker-compose.prod.yml, fly.toml (API), vercel.json (web)

---

## Current State (as of 2026-06-25)

**Running locally:**
- API: `http://localhost:3001` (Fastify, `pnpm --filter api dev`, hot-reload via tsx)
- Web: `http://localhost:3000` (Next.js, `next start` production build — dev mode breaks on macOS due to EMFILE/watchpack issue)

**Tested and working:**
- Login / register flow
- Creating and switching organisations
- Question bank (manual create; AI generation blocked — API key has zero credits)
- Candidate list + CSV import
- Scheduling an interview session (bug fixed: question selection now syncs to RHF)
- Live session: answer recording, flag, notes, per-question navigation (answer bleeding fixed)
- Cancelling and reactivating sessions
- Assessment scoring page
- Report page and PDF download (not tested with email — RESEND_API_KEY not set)
- Analytics dashboard

**Known to need credits / external services:**
- AI question generation → needs Anthropic API credits (console.anthropic.com)
- AI summary → same
- Email features → needs RESEND_API_KEY

---

## Known Bugs / Issues

| # | Description | Severity | Status |
|---|---|---|---|
| 1 | RBAC has no effect — roles assigned in UI don't restrict any API route | High | Open |
| 2 | Member invite does not send an email — only creates DB record | Medium | Open |
| 3 | Question time-limit: stored in DB but no countdown timer shown in live session | Medium | Open |
| 4 | Next.js dev server (EMFILE) — must use `next build && next start` on macOS | Low (workaround exists) | Open |
| 5 | Session edit (title/date) — API route exists (PATCH /sessions/:id) but no UI modal | Low | Open |
| 6 | Playwright e2e specs scaffolded only — no full happy-path coverage | Low | Open |
| 7 | `scheduledAt` on session detail — shows as UTC; no timezone conversion for display | Low | Open |
| 8 | After creating a session, redirect goes to session detail but session is still SCHEDULED — user must manually click Start | UX | Open |

---

## Exact Next Step to Resume Work

**Recommended next: RBAC route enforcement**

The roles and permissions system is 100% built in the database and UI, but `requirePermission()` in `apps/api/src/plugins/rbac.plugin.ts` is never called. Every API route is effectively open to any authenticated org member regardless of their role.

Steps to implement:
1. Read `rbac.plugin.ts` to understand the `requirePermission(action)` signature
2. Identify which routes should require which permissions (e.g. `candidates:create`, `sessions:create`, `questions:delete`)
3. Add `requirePermission` as a preHandler alongside `requireAuth` on sensitive routes
4. Test with a MEMBER-role account trying to access ADMIN-only routes

Alternatively, if RBAC is deprioritised for now, the next best UX improvement is:
- **Question time-limit countdown timer** in the live session view — the data is already there, just needs a `<CountdownTimer seconds={currentSQ.timeLimit} />` component rendered when timeLimit is set
