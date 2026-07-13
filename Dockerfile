# ============================================================
# finance-whatsapp-bot — multi-stage build
# Decision (approved): Bun for dependency install + tooling,
# Node.js LTS as the runtime for Baileys stability.
# ============================================================

# ---- Stage 1: install dependencies with Bun ----
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

# ---- Stage 2: build (prisma generate + nest build) on Node ----
FROM node:20-alpine AS build
WORKDIR /app
# Prisma needs OpenSSL on Alpine
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npx nest build

# ---- Stage 3: runtime (Node LTS, slim) ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl
# Non-root user
RUN addgroup -g 1001 nodejs && adduser -u 1001 -G nodejs -s /bin/sh -D appuser

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./

# Persisted WhatsApp session lives under /app/storage (mounted volume)
RUN mkdir -p /app/storage/wa-session && chown -R appuser:nodejs /app/storage
USER appuser

EXPOSE 3000

# Apply pending migrations, then start. (migrate deploy is idempotent)
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
