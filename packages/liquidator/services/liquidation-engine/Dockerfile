# Liquidation Engine Dockerfile
FROM oven/bun:1.3.3-slim

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
