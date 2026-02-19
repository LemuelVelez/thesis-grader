# syntax=docker/dockerfile:1.7

# -----------------------------
# 1) deps (install node_modules)
# -----------------------------
FROM node:20-alpine AS deps
WORKDIR /app

# Some native modules/tools expect glibc compatibility on Alpine
RUN apk add --no-cache libc6-compat

# Copy only dependency manifests first (better caching)
COPY package.json ./
# Copy lockfiles if they exist (all are optional)
COPY package-lock.json* yarn.lock* pnpm-lock.yaml* ./

# Install deps (prefer lockfile-based install)
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

# Build Next.js
RUN npm run build

# Prune devDependencies for smaller runtime image
RUN npm prune --omit=dev

# -----------------------------
# 3) runner (production)
# -----------------------------
FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Run as the built-in "node" user (non-root)
USER node

# Copy only what we need at runtime
COPY --chown=node:node --from=builder /app/package.json ./package.json
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/.next ./.next
COPY --chown=node:node --from=builder /app/public ./public
COPY --chown=node:node --from=builder /app/next.config.ts ./next.config.ts

# Docker entrypoint (runs migrations then starts app)
COPY --chown=node:node docker/entrypoint.sh ./docker/entrypoint.sh
RUN chmod +x ./docker/entrypoint.sh

EXPOSE 3000

# Basic healthcheck (checks home page)
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
    CMD wget -qO- http://127.0.0.1:${PORT}/ >/dev/null 2>&1 || exit 1

ENTRYPOINT ["./docker/entrypoint.sh"]
