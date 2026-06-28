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
- Docker + Docker Compose

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

### 3. Start infrastructure

```bash
docker compose up -d
```

### 4. Run database migrations

```bash
pnpm db:migrate
```

### 5. Start development servers

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

# E2E tests (requires running dev server)
pnpm --filter web test:e2e
```

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
└── docker-compose.yml
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
