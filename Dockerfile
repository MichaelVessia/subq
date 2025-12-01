# Build stage
FROM oven/bun:1.2-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/api/package.json ./packages/api/
COPY packages/web/package.json ./packages/web/

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source
COPY packages/shared ./packages/shared
COPY packages/api ./packages/api
COPY packages/web ./packages/web
COPY tsconfig.base.json tsconfig.json ./

# Build web frontend
RUN bun run --filter @subq/web build

# Production stage
FROM oven/bun:1.2-alpine

WORKDIR /app

# Copy package files for production install
COPY package.json bun.lock ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/api/package.json ./packages/api/

# Install production dependencies only
RUN bun install --frozen-lockfile --production

# Copy built artifacts and source
COPY packages/shared ./packages/shared
COPY packages/api ./packages/api
COPY --from=builder /app/packages/web/dist ./packages/web/dist

# Create data directory for SQLite
RUN mkdir -p /app/data

# Environment
ENV PORT=8080
ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/subq.db
ENV STATIC_DIR=/app/packages/web/dist

EXPOSE 8080

CMD ["bun", "run", "packages/api/src/server.ts"]
