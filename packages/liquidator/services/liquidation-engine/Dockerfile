# Liquidation Engine Dockerfile
# Using Debian Trixie (testing) slim for GLIBCXX_3.4.32 support required by @aztec/native
FROM debian:trixie-slim

# Install dependencies: Node.js, Bun, and tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    unzip \
    ca-certificates \
    && curl -fsSL https://bun.sh/install | bash \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Add bun to PATH
ENV PATH="/root/.bun/bin:${PATH}"

# Set working directory
WORKDIR /app

# Copy workspace package files
COPY package.json pnpm-workspace.yaml ./
COPY shared/package.json ./shared/
COPY services/liquidation-engine/package.json ./services/liquidation-engine/

# Install dependencies
RUN bun install

# Copy shared code
COPY shared ./shared/

# Copy service source code
COPY services/liquidation-engine ./services/liquidation-engine/

# Set working directory to service
WORKDIR /app/services/liquidation-engine

# Expose the API port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:3002/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Run the service
CMD ["bun", "src/index.ts"]
