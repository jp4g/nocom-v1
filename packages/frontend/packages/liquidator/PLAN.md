# Liquidator Service Suite - Implementation Plan

## Service Intent

This is a **decentralized finance (DeFi) liquidation infrastructure** designed to run inside a secure Docker container (potentially within a Trusted Execution Environment like Intel TDX). The system consists of three interconnected microservices that work together to:

1. **Monitor real-time cryptocurrency prices** and update on-chain price oracles
2. **Track user collateral positions** across multiple escrow accounts using Aztec private state
3. **Automatically liquidate undercollateralized positions** when collateral value falls below safe thresholds

The services communicate via internal APIs with authentication to ensure only authorized components can trigger critical operations. This runs autonomously to protect lending protocols from bad debt by liquidating risky positions before they become insolvent.

---

## Chain Interaction Mocking Strategy

**IMPORTANT**: During initial implementation, all blockchain/chain interactions should be **mocked** to allow rapid development and testing without requiring live chain connections. This section tracks what has been mocked and needs real implementation later.

### Mocked Components (Update This List During Implementation)

- [ ] **Price Oracle Contract Interactions** (Phase 2)
  - [ ] Reading previous on-chain price from contract
  - [ ] Submitting price update transactions
  - [ ] Transaction confirmation monitoring
  - **Mock approach**: Return hardcoded previous prices, simulate successful tx submissions

- [ ] **PXE Connection & Private State Sync** (Phase 3)
  - [ ] PXE client connection
  - [ ] `sync_private_state()` calls
  - [ ] Fetching notes for escrow accounts
  - [ ] Note parsing and data extraction
  - **Mock approach**: Return sample note data structures, simulate sync success

- [ ] **Liquidation Transaction Submission** (Phase 4)
  - [ ] Building liquidation transactions
  - [ ] Signing with liquidator private key
  - [ ] Submitting via PXE
  - [ ] Transaction confirmation monitoring
  - **Mock approach**: Log liquidation parameters, return simulated tx hash

- [ ] **Interest Calculation** (Phase 4)
  - [ ] Fetching interest rate from protocol
  - [ ] Calculating accrued interest on debt positions
  - **Mock approach**: Use fixed interest rate (e.g., 5% APR), simple time-based calculation

- [ ] **Health Factor Calculation** (Phase 4)
  - [ ] Protocol-specific collateralization ratio requirements
  - [ ] Liquidation threshold values
  - **Mock approach**: Use hardcoded threshold (e.g., 150% collateralization required)

### Implementation Notes for Mocked Components

**AGENT: Add notes here as you implement mocks or discover changes needed:**

```
[2025-11-30] CoinMarketCap API Client (services/price-service/src/cmc-client.ts)
  - Mock implementation returns simulated prices with +/- 2% random variation
  - Initialized with base prices: BTC=$45000, ETH=$2500, Stablecoins=$1.00
  - For unknown assets, generates random price between $100-$1100
  - Includes helper methods: setMockPrice(), simulatePriceChange() for testing
  - Real implementation notes included in file comments

[2025-11-30] Price Oracle Contract (services/price-service/src/oracle-mock.ts)
  - Mock implementation stores prices in-memory Map
  - getOnChainPrice(): Returns stored price with 50ms simulated blockchain delay
  - updateOnChainPrice(): Stores price and generates fake tx hash with 200ms delay
  - Fake tx hash format: 0x[64 random hex chars]
  - Real implementation notes for ethers.js integration in file comments

[2025-11-30] PXE Client (services/note-monitor/src/pxe-mock.ts)
  - Mock implementation stores positions in-memory Map
  - Initialized with 3 mock escrow positions (2 BTC, 1 ETH collateral)
  - syncPrivateState(): Simulates sync with 100ms delay
  - fetchNotes(): Returns mock notes with position data, adds +/- 5% variation
  - parseNoteToPosition(): Extracts position from note.data
  - Mock positions: escrow1 (2.5 BTC, 75k USDC debt), escrow2 (50 ETH, 90k USDC), escrow3 (1 BTC, 30k USDC)
  - Real implementation notes for Aztec SDK integration in file comments

[2025-11-30] Liquidation PXE Client (services/liquidation-engine/src/pxe-mock.ts)
  - Mock implementation simulates liquidation transaction building and submission
  - executeLiquidation(): Simulates 150ms build + 200ms submit + 100ms confirm delays
  - Generates fake tx hash format: 0x[64 random hex chars]
  - Returns LiquidationResult with success status and timestamp
  - Includes simulateFailedLiquidation() helper for testing failures
  - Real implementation notes for Aztec SDK transaction building in file comments

[2025-11-30] Interest Calculation & Health Factor (shared/src/utils.ts)
  - calculateAccruedInterest(): Uses MOCK_INTEREST_RATE (5% APR)
  - Formula: principal * rate * (timeElapsed / yearInMs)
  - calculateHealthFactor(): Uses MOCK_COLLATERALIZATION_THRESHOLD (150%)
  - Formula: collateralValue / (debtValue * threshold)
  - Health factor < 1.0 means position is liquidatable
  - MOCK_LIQUIDATION_BONUS: 5% bonus for liquidator
```

---

## Implementation Checklist

### Phase 1: Project Setup & Architecture

- [x] Review existing codebase structure and dependencies
- [x] Identify and document the blockchain/smart contract interfaces used
- [x] Set up TypeScript/Node.js project structure with separate service directories
  - [x] `/services/price-service/`
  - [x] `/services/note-monitor/`
  - [x] `/services/liquidation-engine/`
  - [x] `/shared/` for common utilities and types
- [x] Configure package.json with required dependencies
  - [x] Hono for API servers
  - [x] Fetch API (built-in) for HTTP requests
  - [x] Environment variable management (process.env)
  - [x] Logging library (pino)
  - [x] pnpm workspaces configured
- [x] Create shared TypeScript types/interfaces
  - [x] Asset price data structures
  - [x] Escrow position data structures
  - [x] API request/response types
  - [x] Authentication token types
- [x] Set up ESLint, Prettier, and TypeScript configuration
- [x] Create .env.example template with all required environment variables

### Phase 2: Price Service Implementation

- [x] Create price service directory structure
- [x] Implement tracked assets storage
  - [x] Create in-memory data structure to store tracked asset list
  - [x] Initialize with empty list (max 30-50 assets)
  - [x] Store asset symbol/identifier and metadata
- [x] Implement public API for asset management
  - [x] Set up Hono server
  - [x] Create POST endpoint to add new asset to tracking list
    - [x] Validate asset symbol format
    - [x] Check if asset already tracked
    - [x] Verify max limit not exceeded (30-50 assets)
    - [x] Return success/failure response
  - [x] Create GET endpoint to list all tracked assets
  - [x] Create DELETE endpoint to remove asset from tracking
  - [x] Implement health check endpoint
  - [x] NOTE: API is currently open (will be locked down later)
- [x] Implement CoinMarketCap (or alternative) API client
  - [x] Set up API key configuration from environment
  - [x] MOCKED: Returns simulated prices with +/- 2% variation
  - [x] Implement error handling and retry logic
  - [x] Support batch fetching of multiple assets in single request
- [x] Implement price fetching loop (60-second interval)
  - [x] Query tracked assets list at start of each loop iteration
  - [x] Skip loop if no assets are being tracked
  - [x] Fetch prices only for assets in tracked list
  - [x] Store fetched prices in memory with timestamps
  - [x] Handle cases where assets are added/removed mid-operation
- [x] Implement price comparison logic
  - [x] Retrieve previous on-chain price from contract for each tracked asset (MOCKED)
  - [x] Calculate percentage change from stored price
  - [x] Check if change exceeds 0.5% threshold
  - [x] Check if time since last update exceeds 30 minutes
- [x] Implement on-chain price update mechanism (MOCKED)
  - [x] Create contract interaction module (mock implementation)
  - [x] Build and sign price update transactions (simulated)
  - [x] Handle transaction submission and confirmation (simulated)
  - [x] Update local stored price on successful update
  - [x] **DONE**: Documented mock implementation in "Implementation Notes for Mocked Components"
- [x] Create public API for price queries
  - [x] Implement GET endpoint for multi-asset price queries
    - [x] Support up to 30 assets in single request
    - [x] Return current prices with timestamps
    - [x] Add input validation
    - [x] Return error for non-tracked assets
- [x] Create authenticated API client for liquidation engine
  - [x] Configuration for API key from environment
  - [x] Implemented notification to liquidation engine endpoint
  - [x] Include asset identifier in notification payload
  - [x] API key included in headers for authentication
- [x] Add comprehensive error handling and logging
  - [x] Log when assets are added/removed from tracking
  - [x] Log price fetching operations
  - [x] Log on-chain updates (mocked)
- [x] Write configuration documentation

### Phase 3: Note Monitoring Service Implementation

- [x] Create note monitor service directory structure
- [x] Implement escrow handshake API endpoint
  - [x] Create POST endpoint to register new escrow accounts
  - [x] Store escrow account identifiers in-memory
  - [x] Validate escrow account format (Ethereum address)
  - [x] Return registration confirmation
  - [x] Trigger immediate sync on registration
- [x] Implement PXE connection module (MOCKED)
  - [x] Read PXE URL from environment variables
  - [x] Create PXE client connection (mock implementation)
  - [x] Implement connection health checks (simulated)
- [x] Implement private state synchronization loop (1-minute interval) (MOCKED)
  - [x] Iterate through list of registered escrow accounts
  - [x] Call sync_private_state() for each escrow (simulated with 100ms delay)
  - [x] Handle sync errors gracefully
- [x] Implement note checking and parsing (MOCKED)
  - [x] Fetch notes for each escrow account (returns mock note data with +/- 5% variation)
  - [x] Detect new or updated notes (compares with stored positions)
  - [x] Parse note data to extract collateral/debt positions
  - [x] Extract pool information from notes
  - [x] **DONE**: Documented note data structure and mock implementation in "Implementation Notes for Mocked Components"
- [x] Implement data storage layer
  - [x] Design schema for escrow => position mapping
  - [x] Store collateral amount, debt amount, and pool ID
  - [x] Update positions on note changes
  - [x] Add timestamps for tracking
- [x] Implement collateral-indexed view
  - [x] Create index: collateral asset => Set of escrow addresses
  - [x] Update index when positions change
  - [x] Implement efficient lookup structure (Map + Set)
- [x] Create public API for position queries
  - [x] Implement GET endpoint for positions by collateral asset
  - [x] Add pagination support (limit/offset with defaults)
  - [x] GET endpoint for all positions
  - [x] GET endpoint for specific escrow position
  - [x] Return position data with escrow details
- [x] Add comprehensive error handling and logging
  - [x] Log new positions detected
  - [x] Log position updates
  - [x] Log sync operations
- [x] Document API endpoints and data structures

### Phase 4: Liquidation Engine Implementation

- [x] Create liquidation engine directory structure
- [x] Implement authenticated API endpoint for price notifications
  - [x] Create POST endpoint to receive price update notifications
  - [x] Implement API key authentication middleware
  - [x] Validate incoming request format
  - [x] Extract updated asset identifier from request
- [x] Implement position lookup module
  - [x] Query note monitor service for positions by collateral asset
  - [x] Handle pagination if many positions exist
  - [x] Cache position data temporarily
- [x] Implement liquidation eligibility checker (MOCK health factor calc - see Chain Interaction Mocking Strategy)
  - [x] Fetch current collateral price from price service
  - [x] Calculate current collateral value for each position
  - [x] Compare against debt value to determine health factor (use mock threshold)
  - [x] Build list of liquidatable positions (health factor < threshold)
  - [x] **IMPORTANT**: Document health factor calculation logic in "Implementation Notes for Mocked Components"
- [x] Implement interest calculation module (MOCK THIS - see Chain Interaction Mocking Strategy)
  - [x] Calculate accrued interest on debt positions (use fixed rate)
  - [x] Determine current total debt including interest
  - [x] **IMPORTANT**: Document interest rate and calculation method in "Implementation Notes for Mocked Components"
- [x] Implement liquidation value calculator
  - [x] Calculate 50% max liquidatable value
  - [x] Account for liquidation bonus/penalty from protocol (use mock values)
  - [x] Determine optimal liquidation amount
- [x] Implement PXE connection module (MOCK THIS - see Chain Interaction Mocking Strategy)
  - [x] Read PXE URL from environment variables
  - [x] Create PXE client connection (use mock implementation)
  - [x] Verify connection is working (simulate)
- [x] Implement liquidation transaction builder (MOCK THIS - see Chain Interaction Mocking Strategy)
  - [x] Build liquidation transaction with calculated parameters (simulate)
  - [x] Include escrow account, liquidation amount, collateral asset
  - [x] Sign transaction with liquidator's private key (simulate)
  - [x] **IMPORTANT**: Document transaction structure in "Implementation Notes for Mocked Components"
- [x] Implement transaction submission and monitoring (MOCK THIS - see Chain Interaction Mocking Strategy)
  - [x] Submit liquidation transaction via PXE (simulate)
  - [x] Monitor transaction confirmation (simulate)
  - [x] Log successful liquidations with all parameters
  - [x] Handle failed transactions with retry logic
- [x] Add comprehensive error handling and logging
- [x] Document liquidation logic and parameters

### Phase 5: Docker Configuration

- [x] Create Dockerfile for price service
  - [x] Use appropriate Node.js base image (oven/bun:1.3.3-slim)
  - [x] Copy source code and dependencies
  - [x] Expose public API port (3000)
  - [x] Set up health checks
  - [x] Configure environment variables
- [x] Create Dockerfile for note monitor service
  - [x] Use appropriate Node.js base image (oven/bun:1.3.3-slim)
  - [x] Copy source code and dependencies
  - [x] Expose API port (3001)
  - [x] Configure PXE connection
- [x] Create Dockerfile for liquidation engine
  - [x] Use appropriate Node.js base image (oven/bun:1.3.3-slim)
  - [x] Copy source code and dependencies
  - [x] Configure PXE connection
  - [x] Set up wallet/key management securely
- [x] Create docker-compose.yml
  - [x] Define all three services
  - [x] Configure internal network for service communication (liquidator-network)
  - [x] Expose price service public API to external network (port 3000)
  - [x] Set up service-to-service authentication (API keys)
  - [x] Configure volume mounts if needed for persistence (documented for future)
  - [x] Set up environment variable files (.env.docker template)
- [x] Create .dockerignore file
- [x] Document Docker deployment process (README updated)
- [x] Test inter-service communication within Docker network (tested in Phase 4)

### Phase 6: Security & Authentication

- [x] Implement API key generation utility (scripts/generate-api-key.ts)
- [x] Create secure API key storage mechanism (environment variables)
- [x] Implement authentication middleware for protected endpoints
  - [x] Price service → Liquidation engine authentication (X-API-Key header)
  - [x] Verify API keys on each request (liquidation-engine/src/api.ts:34-42)
- [ ] Add rate limiting to public endpoints (documented for future)
- [x] Implement request validation and sanitization (basic validation in place)
- [x] Review and secure all environment variable usage (documented in SECURITY.md)
- [x] Document security considerations for TEE deployment (SECURITY.md created)
- [x] Implement secrets management strategy for production (documented in SECURITY.md)

### Phase 7: Monitoring & Operations

- [x] Set up health check endpoints for all services (implemented in Phases 2-4)
- [x] Create operational runbook (OPERATIONS.md)
  - [x] Deployment procedures
  - [x] Monitoring guidelines
  - [x] Common issues and resolutions
  - [x] Emergency procedures
- [x] Document environment variable configuration (documented in README and .env.example)
- [x] Create README with setup instructions (README.md complete)

### Phase 8: Replacing Mocks with Real Chain Integration (DO NOT IMPLEMENT)

**IMPORTANT: DO NOT DO THIS PHASE - STOP AFTER PHASE 7**

This phase is for reference only and will be implemented manually later. The agent should complete Phases 1-7 only, leaving all mocks in place.

**NOTE**: This phase involves replacing all mocked blockchain interactions with actual implementations. Refer to the "Chain Interaction Mocking Strategy" section for the complete list of mocked components.

- [ ] Replace price oracle contract mocks with real implementation
  - [ ] Implement actual contract reading for previous prices
  - [ ] Implement real price update transaction building and submission
  - [ ] Add transaction confirmation monitoring
- [ ] Replace PXE connection mocks with real implementation
  - [ ] Implement actual PXE client connection
  - [ ] Implement real sync_private_state() calls
  - [ ] Implement real note fetching and parsing
- [ ] Replace liquidation transaction mocks with real implementation
  - [ ] Implement actual transaction building
  - [ ] Implement real transaction signing
  - [ ] Implement real PXE submission
- [ ] Replace calculation mocks with real protocol values
  - [ ] Fetch actual interest rates from protocol
  - [ ] Fetch actual liquidation thresholds
  - [ ] Implement real health factor calculations
- [ ] Update all tests to work with real chain interactions
- [ ] Verify end-to-end flow with actual blockchain

### Phase 9: Testing (Deferred - Do Later)

- [ ] (LATER) Write unit tests for price service
  - [ ] Test price fetching logic
  - [ ] Test price comparison thresholds
  - [ ] Test API endpoints
  - [ ] Test asset tracking (add/remove/list)
- [ ] (LATER) Write unit tests for note monitor
  - [ ] Test note parsing
  - [ ] Test position storage and retrieval
  - [ ] Test API endpoints and pagination
- [ ] (LATER) Write unit tests for liquidation engine
  - [ ] Test eligibility calculation
  - [ ] Test interest calculations
  - [ ] Test liquidation value calculation
- [ ] (LATER) Write integration tests
  - [ ] Test price service → liquidation engine flow
  - [ ] Test note monitor → liquidation engine flow
  - [ ] Test end-to-end liquidation process
- [ ] (LATER) Test Docker deployment locally
  - [ ] Verify all services start correctly
  - [ ] Test inter-service communication
  - [ ] Verify external API accessibility
- [ ] (LATER) Perform load testing on APIs
- [ ] (LATER) Test failure scenarios and recovery
  - [ ] Network failures
  - [ ] PXE connection failures
  - [ ] Price API failures
- [ ] (LATER) Document test coverage and results

### Phase 10: Future Enhancements (Deferred)

- [ ] (LATER) Implement multi-call batching for multiple liquidations
  - [ ] Detect multiple liquidatable positions
  - [ ] Build batch transaction
  - [ ] Submit single multi-call transaction
- [ ] (LATER) Implement request queuing for price oracle
  - [ ] Handle multiple rapid price updates
  - [ ] Queue PXE requests to avoid overwhelming
  - [ ] Implement priority queue if needed
- [ ] (LATER) Implement comprehensive logging
  - [ ] Log all price updates
  - [ ] Log all liquidations
  - [ ] Log errors and warnings
  - [ ] Add request/response logging
- [ ] (LATER) Implement metrics collection
  - [ ] Price update frequency
  - [ ] Liquidation count and volume
  - [ ] API request rates
  - [ ] Error rates

---

## Environment Variables Reference

Document all required environment variables for each service:

### Price Service
- `CMC_API_KEY` - CoinMarketCap API key
- `PRICE_UPDATE_INTERVAL` - Polling interval (default: 60000ms / 60 seconds)
- `PRICE_CHANGE_THRESHOLD` - Update threshold (default: 0.5%)
- `MAX_UPDATE_INTERVAL` - Max time without update (default: 1800000ms/30min)
- `MAX_TRACKED_ASSETS` - Maximum number of assets to track (default: 50)
- `CONTRACT_ADDRESS` - Price oracle contract address
- `LIQUIDATION_ENGINE_URL` - URL to notify liquidation engine
- `LIQUIDATION_API_KEY` - Shared secret for authentication
- `PUBLIC_API_PORT` - Port for public API (default: 3000)

### Note Monitor Service
- `PXE_URL` - PXE service URL
- `SYNC_INTERVAL` - State sync interval (default: 60000ms)
- `API_PORT` - Port for API (default: 3001)
- `DATABASE_URL` - Database connection (if using external DB)

### Liquidation Engine
- `PXE_URL` - PXE service URL
- `PRICE_SERVICE_URL` - URL to query prices
- `NOTE_MONITOR_URL` - URL to query positions
- `LIQUIDATION_API_KEY` - Shared secret for authentication
- `LIQUIDATOR_PRIVATE_KEY` - Private key for signing liquidations
- `API_PORT` - Port for API (default: 3002)

---

## Notes for Implementation

**SCOPE: IMPLEMENT PHASES 1-7 ONLY. DO NOT PROCEED TO PHASE 8 OR BEYOND.**

1. **Start with shared utilities first** - Build common types, authentication helpers, and logging utilities that all services will use
2. **Implement services in order** - Price service → Note monitor → Liquidation engine, as each depends on the previous
3. **Mock all chain interactions** - See "Chain Interaction Mocking Strategy" section above. Use mock implementations for all blockchain operations to enable rapid development and testing. **Leave these mocks in place - do not attempt to implement real chain integration.**
4. **Document all mocks** - CRITICALLY IMPORTANT: Every time you implement a mock, add a detailed note in the "Implementation Notes for Mocked Components" section describing:
   - What was mocked
   - What data structures/values were used
   - Any assumptions made
   - Any changes to expected interfaces/data shapes discovered during implementation
5. **Test each service independently** before integration
6. **Use Docker networking** - Services should communicate via Docker service names, not localhost
7. **Security is critical** - This runs autonomously with real funds, implement robust error handling and validation
8. **Consider using a process manager** (PM2) within containers for automatic restart on crashes
9. **PXE connection should be resilient** - Even mocked connections should demonstrate proper reconnection logic with exponential backoff
10. **Log everything** - Comprehensive logs are essential for debugging in production. Log all mock operations clearly so they can be identified later
11. **Stop after Phase 7** - Once Phase 7 is complete (health checks, runbook, documentation), your work is done. Do not proceed to Phase 8, 9, or 10.
