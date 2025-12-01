// Asset and Price Types
export interface Asset {
  symbol: string; // e.g., "BTC", "ETH"
  name?: string;
  decimals?: number;
}

export interface Price {
  asset: string; // Asset symbol
  price: number; // Price in USD
  timestamp: number; // Unix timestamp
  source?: string; // e.g., "CoinMarketCap"
}

export interface PriceUpdate {
  asset: string;
  previousPrice: number;
  newPrice: number;
  percentageChange: number;
  timestamp: number;
}

// Escrow and Position Types
export interface EscrowAccount {
  address: string;
  registeredAt: number;
}

export interface CollateralPosition {
  escrowAddress: string;
  collateralAsset: string;
  collateralAmount: number;
  debtAsset: string;
  debtAmount: number;
  poolId: string;
  lastUpdated: number;
}

export interface Note {
  id: string;
  escrowAddress: string;
  data: unknown; // Actual note structure from chain
}

// Liquidation Types
export interface LiquidationEligibility {
  escrowAddress: string;
  collateralValue: number;
  debtValue: number;
  healthFactor: number;
  isLiquidatable: boolean;
}

export interface LiquidationParams {
  escrowAddress: string;
  collateralAsset: string;
  debtAsset: string;
  liquidationAmount: number; // 50% max of debt
  collateralToSeize: number;
  expectedProfit: number;
}

export interface LiquidationResult {
  success: boolean;
  txHash?: string;
  escrowAddress: string;
  liquidationAmount: number;
  timestamp: number;
  error?: string;
}

// API Request/Response Types
export interface AddAssetRequest {
  symbol: string;
  name?: string;
}

export interface AddAssetResponse {
  success: boolean;
  asset?: Asset;
  error?: string;
}

export interface GetPricesRequest {
  assets: string[]; // Array of asset symbols
}

export interface GetPricesResponse {
  prices: Price[];
  timestamp: number;
}

export interface RegisterEscrowRequest {
  address: string;
}

export interface RegisterEscrowResponse {
  success: boolean;
  escrow?: EscrowAccount;
  error?: string;
}

export interface GetPositionsRequest {
  collateralAsset?: string;
  limit?: number;
  offset?: number;
}

export interface GetPositionsResponse {
  positions: CollateralPosition[];
  total: number;
  limit: number;
  offset: number;
}

export interface PriceUpdateNotification {
  asset: string;
  newPrice: number;
  timestamp: number;
  apiKey: string; // Authentication
}

// Configuration Types
export interface PriceServiceConfig {
  cmcApiKey: string;
  priceUpdateInterval: number; // milliseconds
  priceChangeThreshold: number; // percentage (e.g., 0.5 for 0.5%)
  maxUpdateInterval: number; // milliseconds
  maxTrackedAssets: number;
  contractAddress: string;
  liquidationEngineUrl: string;
  liquidationApiKey: string;
  publicApiPort: number;
}

export interface NoteMonitorConfig {
  pxeUrl: string;
  syncInterval: number; // milliseconds
  apiPort: number;
  databaseUrl?: string;
}

export interface LiquidationEngineConfig {
  pxeUrl: string;
  priceServiceUrl: string;
  noteMonitorUrl: string;
  liquidationApiKey: string;
  liquidatorPrivateKey: string;
  apiPort: number;
}

// Authentication Types
export interface AuthToken {
  apiKey: string;
  service: string;
}

// Error Types
export interface ServiceError {
  code: string;
  message: string;
  details?: unknown;
  timestamp: number;
}
