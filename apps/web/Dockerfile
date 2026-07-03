# ── Stage 1: deps ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile --filter web... --prod=false

# ── Stage 2: builder ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Bring the whole installed workspace (root + per-package node_modules with .bin)
COPY --from=deps /app ./

COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
COPY package.json pnpm-workspace.yaml ./

# Ensure a public dir exists so the runner COPY always succeeds (app may have none)
RUN mkdir -p /app/apps/web/public

WORKDIR /app/apps/web

# Build-time env vars (public only)
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV DOCKER_BUILD=1

RUN pnpm build

# ── Stage 3: runner ────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Bind to all interfaces so loopback healthchecks work (Next standalone honours HOSTNAME)
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Next.js standalone in a monorepo keeps the workspace layout: server.js lives at apps/web/
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/login || exit 1

CMD ["node", "apps/web/server.js"]
