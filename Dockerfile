# syntax=docker/dockerfile:1

# -----------------------------
# 1) deps (install node_modules)
# -----------------------------
FROM node:20-alpine AS deps
WORKDIR /app

RUN apk add --no-cache libc6-compat

COPY package.json ./
COPY package-lock.json* yarn.lock* pnpm-lock.yaml* ./

RUN set -eux; \
    if [ -f package-lock.json ]; then \
    npm ci; \
    elif [ -f pnpm-lock.yaml ]; then \
    corepack enable && pnpm i --frozen-lockfile; \
    elif [ -f yarn.lock ]; then \
    corepack enable && yarn install --frozen-lockfile; \
    else \
    npm i; \
    fi

# -----------------------------
# 2) builder (next build)
# -----------------------------
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat

ENV NEXT_TELEMETRY_DISABLED=1
# Helps avoid unexplained build exits on low-memory builders
ENV NODE_OPTIONS=--max_old_space_size=2048

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Coolify passes envs as build secrets; if any are empty/missing, Next build can fail
# during "Collecting page data". Provide safe defaults for build-time only.
RUN set -eux; \
    export APP_URL="${APP_URL:-http://localhost:3000}"; \
    export DATABASE_SSL="${DATABASE_SSL:-false}"; \
    export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/postgres}"; \
    export PUSH_NOTIFICATIONS_ENABLED="${PUSH_NOTIFICATIONS_ENABLED:-false}"; \
    export VAPID_SUBJECT="${VAPID_SUBJECT:-mailto:build@localhost}"; \
    export VAPID_PUBLIC_KEY="${VAPID_PUBLIC_KEY:-build-placeholder}"; \
    export VAPID_PRIVATE_KEY="${VAPID_PRIVATE_KEY:-build-placeholder}"; \
    export AWS_REGION="${AWS_REGION:-ap-southeast-2}"; \
    export S3_BUCKET_NAME="${S3_BUCKET_NAME:-thesisgrader}"; \
    export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-build-placeholder}"; \
    export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-build-placeholder}"; \
    export GMAIL_USER="${GMAIL_USER:-build@localhost}"; \
    export GMAIL_APP_PASSWORD="${GMAIL_APP_PASSWORD:-build-placeholder}"; \
    export SUPERADMIN_EMAIL="${SUPERADMIN_EMAIL:-superadmin@thesisgrader.local}"; \
    export SUPERADMIN_PASSWORD="${SUPERADMIN_PASSWORD:-87654321}"; \
    npm run build

RUN npm prune --omit=dev

# -----------------------------
# 3) runner (production)
# -----------------------------
FROM node:20-alpine AS runner
WORKDIR /app

# add curl so Coolify healthcheck won't complain
RUN apk add --no-cache libc6-compat curl

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

USER node

COPY --chown=node:node --from=builder /app/package.json ./package.json
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/.next ./.next
COPY --chown=node:node --from=builder /app/public ./public
COPY --chown=node:node --from=builder /app/next.config.ts ./next.config.ts

# ✅ REQUIRED: migrations + seed scripts live here
COPY --chown=node:node --from=builder /app/database ./database

COPY --chown=node:node docker/entrypoint.sh ./docker/entrypoint.sh
RUN chmod +x ./docker/entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1

ENTRYPOINT ["./docker/entrypoint.sh"]