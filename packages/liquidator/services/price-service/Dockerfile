# Price Service Dockerfile
# Build context: monorepo root (packages/liquidator/../../)
# Using Debian Trixie (testing) slim for GLIBCXX_3.4.32 support required by @aztec/native
FROM debian:trixie-slim

# Install dependencies: Node.js, Bun, pnpm, and tools
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

# Add bun to PATH
ENV PATH="/root/.bun/bin:${PATH}"

# Set working directory to monorepo root
WORKDIR /app

# Copy the entire monorepo
COPY . .

# Install all dependencies with pnpm (shamefully-hoist to flat node_modules for Node compatibility)
ENV CI=true
RUN pnpm install --frozen-lockfile --ignore-scripts --shamefully-hoist

# Expose the API port
EXPOSE 9000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:9000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Run with bun
CMD ["bun", "run", "packages/liquidator/services/price-service/src/index.ts"]
