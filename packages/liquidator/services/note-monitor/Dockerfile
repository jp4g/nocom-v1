# Note Monitor Service Dockerfile
FROM oven/bun:1.3.3-slim

# Set working directory
WORKDIR /app

# Copy workspace package files
COPY package.json pnpm-workspace.yaml ./
COPY shared/package.json ./shared/
COPY services/note-monitor/package.json ./services/note-monitor/

# Install dependencies
RUN bun install

# Copy shared code
COPY shared ./shared/

# Copy service source code
COPY services/note-monitor ./services/note-monitor/

# Set working directory to service
WORKDIR /app/services/note-monitor

# Expose the API port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:3001/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Run the service
CMD ["bun", "src/index.ts"]
