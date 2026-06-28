#!/bin/sh
# Production migration script — run before deploying a new API version.
# Usage: DATABASE_URL="..." ./scripts/migrate-prod.sh
set -e

echo "Running Prisma migrations..."
pnpm exec prisma migrate deploy

echo "Generating Prisma client..."
pnpm exec prisma generate

echo "Migrations complete."
