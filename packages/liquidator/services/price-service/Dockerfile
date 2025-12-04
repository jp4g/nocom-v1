# Price Service Dockerfile
# Build context: monorepo root (packages/liquidator/../../)
FROM oven/bun:1-debian

# Install pnpm and debugging tools
RUN apt-get update && apt-get install -y nodejs npm curl && npm install -g pnpm && rm -rf /var/lib/apt/lists/*

# Set working directory to monorepo root
WORKDIR /app

# Copy the entire monorepo
COPY . .

# Install all dependencies with pnpm (shamefully-hoist to flat node_modules for Node compatibility)
ENV CI=true
RUN pnpm install --frozen-lockfile --ignore-scripts --shamefully-hoist

# Expose the API port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Run with bun
CMD ["bun", "run", "packages/liquidator/services/price-service/src/index.ts"]
