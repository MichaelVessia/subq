# Build stage
FROM oven/bun:1.3-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Copy package files (no lockfile - let bun resolve fresh)
COPY package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/api/package.json ./packages/api/
COPY packages/web/package.json ./packages/web/
COPY packages/cli/package.json ./packages/cli/

# Install dependencies (skip prepare script which needs effect-language-service)
RUN bun install --ignore-scripts

# Copy source
COPY packages/shared ./packages/shared
COPY packages/api ./packages/api
COPY packages/web ./packages/web
COPY tsconfig.base.json tsconfig.json ./

# Build web frontend
RUN bun run --filter @subq/web build

# Production stage
FROM oven/bun:1.3-alpine

WORKDIR /app

# Install runtime dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy node_modules from builder (includes properly resolved deps)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Copy built artifacts and source (including workspace node_modules)
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/packages/api ./packages/api
COPY --from=builder /app/packages/web/dist ./packages/web/dist

# Create data directory for SQLite
RUN mkdir -p /app/data

# Environment
ENV PORT=8080
ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/subq.db
ENV STATIC_DIR=/app/packages/web/dist

EXPOSE 8080

CMD ["bun", "run", "packages/api/src/main.ts"]
