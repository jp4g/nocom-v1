# Price Service Dockerfile
# Build context: monorepo root (packages/liquidator/../../)
FROM node:22-slim

# Install pnpm and tsx
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN npm install -g tsx

# Set working directory to monorepo root
WORKDIR /app

# Copy the entire monorepo
COPY . .

# Install all dependencies with pnpm (shamefully-hoist to flat node_modules for Node compatibility)
RUN pnpm install --frozen-lockfile --ignore-scripts --shamefully-hoist

# Expose the API port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Run with tsx for TypeScript support
CMD ["tsx", "packages/liquidator/services/price-service/src/index.ts"]
