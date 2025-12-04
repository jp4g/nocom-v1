# Unified Liquidator Service Dockerfile
# Multi-stage build for smaller image size
# Build context: monorepo root (packages/liquidator/../../)

# =============================================================================
# Stage 1: Builder - Install dependencies and prepare the app
# =============================================================================
FROM debian:trixie-slim AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    unzip \
    ca-certificates \
    nodejs \
    npm \
    && npm install -g pnpm \
    && curl -fsSL https://bun.sh/install | bash \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /app

# Copy package files first for better layer caching
COPY pnpm-workspace.yaml package.json ./

# Copy workspace package.json files
COPY packages/liquidator/package.json packages/liquidator/
COPY packages/contracts/package.json packages/contracts/

# Install dependencies (no lock file for smaller context)
ENV CI=true
RUN pnpm install --ignore-scripts --shamefully-hoist

# Copy source files (only what's needed)
COPY packages/liquidator/src packages/liquidator/src/
COPY packages/liquidator/deployments.json packages/liquidator/
COPY packages/liquidator/tsconfig.json packages/liquidator/

# Copy contracts package (needed for imports)
COPY packages/contracts/ts packages/contracts/ts/

# =============================================================================
# Stage 2: Runtime - Minimal image for running the service
# =============================================================================
FROM debian:trixie-slim AS runtime

# Install only runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    unzip \
    && curl -fsSL https://bun.sh/install | bash \
    && apt-get remove -y curl unzip \
    && apt-get autoremove -y \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /app

# Copy only the necessary files from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/liquidator ./packages/liquidator
COPY --from=builder /app/packages/contracts ./packages/contracts

# Expose the API port
EXPOSE 9000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD bun -e "fetch('http://localhost:9000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Run the unified service
CMD ["bun", "run", "packages/liquidator/src/index.ts"]
