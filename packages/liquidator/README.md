# Liquidator Service Suite

A DeFi liquidation infrastructure designed to run inside a secure Docker container (potentially within a Trusted Execution Environment like Intel TDX). The system consists of three interconnected microservices that work together to monitor cryptocurrency prices, track user collateral positions, and automatically liquidate undercollateralized positions.

## Architecture

```
┌─────────────────────┐      ┌──────────────────────┐      ┌───────────────────────┐
│   Price Service     │─────▶│  Liquidation Engine  │◀─────│   Note Monitor       │
│                     │      │                      │      │                       │
│ - Fetches prices    │      │ - Checks positions   │      │ - Tracks escrows     │
│ - Updates oracle    │      │ - Executes liq.      │      │ - Syncs notes        │
│ - Notifies on       │      │ - Calc. health       │      │ - Stores positions   │
│   changes           │      │                      │      │                       │
└─────────────────────┘      └──────────────────────┘      └───────────────────────┘
         ▲                                                            │
         │                                                            │
         └────────────────── Public API ─────────────────────────────┘
```

## Services

### 1. Price Service (Port 3000)
- **Status**: ✅ Implemented (Phase 2 Complete)
- Monitors cryptocurrency prices from CoinMarketCap API
- Dynamically tracks user-added assets (max 30-50)
- Updates on-chain price oracle when:
  - Price changes by more than 0.5%
  - 30 minutes have elapsed since last update
- Fetches prices every 60 seconds
- Notifies liquidation engine on price updates

**API Endpoints:**
- `POST /assets` - Add asset to tracking list
- `GET /assets` - Get all tracked assets
- `DELETE /assets/:symbol` - Remove asset from tracking
- `POST /prices` - Get prices for specific assets
- `GET /prices` - Get all current prices
- `GET /health` - Health check

### 2. Note Monitor Service (Port 3001)
- **Status**: ✅ Implemented (Phase 3 Complete)
- Handshakes with escrow accounts
- Syncs private state every minute (MOCKED)
- Tracks collateral/debt positions
- Indexes positions by collateral asset

**API Endpoints:**
- `POST /escrows` - Register new escrow account
- `GET /escrows` - Get all registered escrows
- `GET /positions` - Get all positions (with pagination)
- `GET /positions/by-collateral/:asset` - Get positions by collateral asset
- `GET /health` - Health check

### 3. Liquidation Engine (Port 3002)
- **Status**: ✅ Implemented (Phase 4 Complete)
- Receives price update notifications (authenticated)
- Queries positions from Note Monitor
- Calculates liquidation eligibility (health factor)
- Executes liquidations via PXE (MOCKED)

**API Endpoints:**
- `POST /price-update` - Receive price update notification (authenticated)
- `GET /health` - Health check

## Project Structure

```
liquidator/
├── services/
│   ├── price-service/          ✅ Complete
│   │   ├── src/
│   │   │   ├── index.ts        # Main entry point
│   │   │   ├── api.ts          # Hono API server
│   │   │   ├── storage.ts      # In-memory asset storage
│   │   │   ├── cmc-client.ts   # CoinMarketCap client (MOCKED)
│   │   │   ├── oracle-mock.ts  # Price oracle contract (MOCKED)
│   │   │   └── price-monitor.ts # Price comparison & update logic
│   │   ├── Dockerfile          # Docker container config
│   │   └── package.json
│   ├── note-monitor/           ✅ Complete
│   │   ├── src/
│   │   │   ├── index.ts        # Main entry point
│   │   │   ├── api.ts          # Hono API server
│   │   │   ├── storage.ts      # Position storage with indexing
│   │   │   ├── pxe-mock.ts     # PXE client (MOCKED)
│   │   │   └── note-sync.ts    # Note synchronization loop
│   │   ├── Dockerfile          # Docker container config
│   │   └── package.json
│   └── liquidation-engine/     ✅ Complete
│       ├── src/
│       │   ├── index.ts        # Main entry point
│       │   ├── api.ts          # Hono API server
│       │   ├── liquidation-checker.ts  # Health factor calc
│       │   └── pxe-mock.ts     # Liquidation PXE (MOCKED)
│       ├── Dockerfile          # Docker container config
│       └── package.json
├── shared/                     ✅ Complete
│   ├── src/
│   │   ├── types.ts           # Shared TypeScript types
│   │   ├── constants.ts       # Configuration constants
│   │   ├── utils.ts           # Utility functions (health factor, etc.)
│   │   └── index.ts           # Barrel export
│   └── package.json
├── docker-compose.yml         # Docker orchestration config
├── .dockerignore              # Docker build exclusions
├── PLAN.md                    # Detailed implementation plan
├── .env.example               # Environment variable template
├── .env.docker                # Docker environment template
└── README.md                  # This file
```

## Quick Start

### Prerequisites

**For Local Development:**
- Bun runtime
- pnpm package manager
- curl & jq (for testing)

**For Docker Deployment:**
- Docker
- Docker Compose

## Deployment Options

### Option 1: Docker Deployment (Recommended)

1. **Copy environment configuration:**
```bash
cp .env.docker .env
# Edit .env with your configuration (API keys, etc.)
```

2. **Build and start all services:**
```bash
docker-compose up --build
```

3. **Services will be available at:**
- Price Service: http://localhost:3000 (external)
- Note Monitor: http://localhost:3001 (internal)
- Liquidation Engine: http://localhost:3002 (internal)

4. **View logs:**
```bash
docker-compose logs -f
```

5. **Stop services:**
```bash
docker-compose down
```

### Option 2: Local Development

**Installation:**
```bash
# Install dependencies
pnpm install
```

**Start Individual Services:**
```bash
# Start the price service
pnpm --filter @liquidator/price-service start

# Start the note monitor
pnpm --filter @liquidator/note-monitor start

# Start the liquidation engine
pnpm --filter @liquidator/liquidation-engine start
```

**Start All Services (recommended for development):**
```bash
# Runs all three services concurrently with color-coded output
pnpm dev:all

# Press Ctrl+C to stop all services
```

This uses `concurrently` to run all services in parallel with labeled output.

### Testing the Price Service

```bash
# Add Bitcoin to tracking
curl -X POST http://localhost:3000/assets \
  -H "Content-Type: application/json" \
  -d '{"symbol": "BTC", "name": "Bitcoin"}'

# Add Ethereum
curl -X POST http://localhost:3000/assets \
  -H "Content-Type: application/json" \
  -d '{"symbol": "ETH", "name": "Ethereum"}'

# Get all tracked assets
curl http://localhost:3000/assets | jq

# Wait for price fetch cycle (runs every 60s)
sleep 60

# Get all current prices
curl http://localhost:3000/prices | jq
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
# Price Service
CMC_API_KEY=your_api_key_here          # CoinMarketCap API key
PRICE_UPDATE_INTERVAL=60000            # 60 seconds
PRICE_CHANGE_THRESHOLD=0.5             # 0.5% price change threshold
MAX_UPDATE_INTERVAL=1800000            # 30 minutes max without update
MAX_TRACKED_ASSETS=50                  # Maximum assets to track
PUBLIC_API_PORT=3000                   # API server port
LIQUIDATION_API_KEY=your_secure_key    # Shared secret for auth

# Contract addresses and URLs (mocked in Phase 1-7)
CONTRACT_ADDRESS=0x...                 # Price oracle contract
LIQUIDATION_ENGINE_URL=http://localhost:3002
```

## Mocked Components (Phase 1-7)

The following components are currently **mocked** for rapid development:

### CoinMarketCap API Client
- Returns simulated prices with +/- 2% random variation
- Base prices: BTC=$45000, ETH=$2500, Stablecoins=$1.00
- Location: `services/price-service/src/cmc-client.ts`

### Price Oracle Contract
- Stores prices in-memory instead of on-chain
- Simulates blockchain delays (50ms reads, 200ms writes)
- Generates fake transaction hashes
- Location: `services/price-service/src/oracle-mock.ts`

### PXE Connections (Not yet implemented)
- Will be mocked when Note Monitor and Liquidation Engine are built

See `PLAN.md` section "Chain Interaction Mocking Strategy" for details on replacing mocks with real implementations in Phase 8.

## Development

```bash
# Lint code
pnpm lint

# Format code
pnpm format

# Run all services in development mode (hot reload)
pnpm dev:all
```

## Implementation Status

- ✅ Phase 1: Project Setup & Architecture - **COMPLETE**
- ✅ Phase 2: Price Service - **COMPLETE**
- ✅ Phase 3: Note Monitor Service - **COMPLETE**
- ✅ Phase 4: Liquidation Engine - **COMPLETE**
- ✅ Phase 5: Docker Configuration - **COMPLETE**
- ✅ Phase 6: Security & Authentication - **COMPLETE**
- ✅ Phase 7: Monitoring & Operations - **COMPLETE**
- ⏭️  Phase 8: Replace Mocks (Manual, not by agent)
- ⏭️  Phase 9: Testing (Deferred)
- ⏭️  Phase 10: Future Enhancements (Deferred)

See `PLAN.md` for detailed implementation checklist.

## Documentation

- **[README.md](README.md)** - This file: Overview, quick start, configuration
- **[PLAN.md](PLAN.md)** - Detailed implementation plan with 10 phases
- **[SECURITY.md](SECURITY.md)** - Security measures, TEE deployment guidelines, best practices
- **[OPERATIONS.md](OPERATIONS.md)** - Deployment procedures, monitoring, troubleshooting, emergency procedures
- **[.env.example](.env.example)** - Local development environment template
- **[.env.docker](.env.docker)** - Docker deployment environment template

## Technologies

- **Runtime**: Bun
- **API Framework**: Hono
- **Logging**: Pino
- **Language**: TypeScript
- **Package Manager**: pnpm (workspaces)

## License

Private - Internal use only
