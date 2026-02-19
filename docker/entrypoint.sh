#!/bin/sh
set -e

echo "==> Thesis Grader starting..."
echo "==> NODE_ENV=${NODE_ENV:-production} PORT=${PORT:-3000}"

# Fail fast with a clear error (this is the root cause in your logs)
if [ -z "${DATABASE_URL:-}" ]; then
  echo "!! ERROR: Missing DATABASE_URL"
  echo "   - If deploying on Coolify (Dockerfile/Image): set DATABASE_URL in the App's Environment Variables."
  echo "   - If running locally: put DATABASE_URL in .env (and load it) or set it in docker-compose.yml environment."
  exit 1
fi

# Optional: wait a moment for DB DNS / network readiness in some environments
if [ "${WAIT_FOR_DB_SECONDS:-0}" != "0" ]; then
  echo "==> Waiting ${WAIT_FOR_DB_SECONDS}s for database/network..."
  sleep "${WAIT_FOR_DB_SECONDS}"
fi

# Run migrations by default (recommended for automated deployments)
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "==> Running migrations..."
  npm run migrate
fi

# Seed superadmin ONLY when you explicitly enable it (recommended: do once, then disable)
if [ "${SEED_SUPERADMIN_ON_START:-false}" = "true" ]; then
  echo "==> Seeding superadmin..."
  npm run seed:admin
fi

echo "==> Starting Next.js..."
# Bind to 0.0.0.0 so it is reachable from Coolify proxy
exec npm run start -- -p "${PORT:-3000}" -H 0.0.0.0