# Liquidation Engine Dockerfile
FROM oven/bun:1.3.3-slim

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
COPY package.json ./
COPY ../../shared/package.json ../../shared/

# Install dependencies
RUN bun install --frozen-lockfile

# Copy shared code
COPY ../../shared ../../shared/

# Copy service source code
COPY . .

# Expose the API port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:3002/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Run the service
CMD ["bun", "src/index.ts"]
