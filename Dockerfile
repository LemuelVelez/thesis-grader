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

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build
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

# ✅ Use JS config to prevent Next.js from trying to install TypeScript at runtime
COPY --chown=node:node --from=builder /app/next.config.js ./next.config.js

# ✅ REQUIRED: migrations + seed scripts live here
COPY --chown=node:node --from=builder /app/database ./database

COPY --chown=node:node docker/entrypoint.sh ./docker/entrypoint.sh
RUN chmod +x ./docker/entrypoint.sh

EXPOSE 3000

# Give more time for cold start, and more time for the check itself
HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=5 \
    CMD curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1

ENTRYPOINT ["./docker/entrypoint.sh"]