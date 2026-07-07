# ── Stage 1: deps ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

# Don't download Puppeteer's bundled Chromium (glibc build won't run on Alpine musl);
# the runner installs the system Chromium instead.
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN pnpm install --frozen-lockfile --filter api... --prod=false

# ── Stage 2: builder ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Bring the whole installed workspace (root + per-package node_modules with .bin)
COPY --from=deps /app ./

COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
COPY package.json pnpm-workspace.yaml ./

# Build shared package to CommonJS dist (Node ESM can import CJS; fixes extensionless imports).
# Repoint its package.json to dist for runtime resolution — image only; the repo copy stays
# source-based so local dev (tsx/Next/Vitest) keeps consuming the TypeScript source directly.
WORKDIR /app/packages/shared
RUN ./node_modules/.bin/tsc -p tsconfig.build.json \
 && echo '{"type":"commonjs"}' > dist/package.json \
 && node -e "const fs=require('fs'),p=require('./package.json');p.main='./dist/index.js';p.types='./dist/index.d.ts';p.exports={'.':{types:'./dist/index.d.ts',default:'./dist/index.js'}};fs.writeFileSync('./package.json',JSON.stringify(p,null,2));"

# Generate Prisma client (must precede tsc so generated types exist)
WORKDIR /app/apps/api
RUN pnpm exec prisma generate

# Build API (TypeScript → dist/)
RUN pnpm build

# ── Stage 3: runner ────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
# chromium + fonts for Puppeteer PDF rendering; openssl for Prisma
RUN apk add --no-cache dumb-init openssl libc6-compat \
    chromium nss freetype harfbuzz ca-certificates ttf-freefont
WORKDIR /app

ENV NODE_ENV=production
# Puppeteer uses the system Chromium installed above
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Copy the fully built workspace (incl. generated Prisma client) from builder
COPY --from=builder /app ./

WORKDIR /app/apps/api

# Non-root user
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 appuser
USER appuser

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3001/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/apps/api/src/server.js"]
