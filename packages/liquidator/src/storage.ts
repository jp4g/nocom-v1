import type { Asset, Price, EscrowAccount, CollateralPosition } from './utils';

/**
 * In-memory storage for tracked assets and their prices
 */
export class AssetStorage {
  private trackedAssets: Map<string, Asset> = new Map();
  private currentPrices: Map<string, Price> = new Map();
  private previousOnChainPrices: Map<string, number> = new Map();
  private lastUpdateTimes: Map<string, number> = new Map();
  private maxAssets: number;

  constructor(maxAssets: number = 50) {
    this.maxAssets = maxAssets;
  }

  /**
   * Add an asset to tracking list
   */
  addAsset(asset: Asset): boolean {
    if (this.trackedAssets.has(asset.symbol)) {
      return false; // Already tracked
    }

    if (this.trackedAssets.size >= this.maxAssets) {
      throw new Error(`Maximum tracked assets limit (${this.maxAssets}) reached`);
    }

    this.trackedAssets.set(asset.symbol, asset);
    return true;
  }

  /**
   * Remove an asset from tracking list
   */
  removeAsset(symbol: string): boolean {
    const removed = this.trackedAssets.delete(symbol);
    if (removed) {
      this.currentPrices.delete(symbol);
      this.previousOnChainPrices.delete(symbol);
      this.lastUpdateTimes.delete(symbol);
    }
    return removed;
  }

  /**
   * Check if asset is being tracked
   */
  isTracked(symbol: string): boolean {
    return this.trackedAssets.has(symbol);
  }

  /**
   * Get all tracked assets
   */
  getAllTrackedAssets(): Asset[] {
    return Array.from(this.trackedAssets.values());
  }

  /**
   * Get all tracked asset symbols
   */
  getTrackedSymbols(): string[] {
    return Array.from(this.trackedAssets.keys());
  }

  /**
   * Get count of tracked assets
   */
  getTrackedCount(): number {
    return this.trackedAssets.size;
  }

  /**
   * Update current price for an asset
   */
  updatePrice(price: Price): void {
    this.currentPrices.set(price.asset, price);
  }

  /**
   * Get current price for an asset
   */
  getCurrentPrice(symbol: string): Price | undefined {
    return this.currentPrices.get(symbol);
  }

  /**
   * Get current prices for multiple assets
   */
  getCurrentPrices(symbols: string[]): Price[] {
    return symbols
      .map((symbol) => this.currentPrices.get(symbol))
      .filter((price): price is Price => price !== undefined);
  }

  /**
   * Get all current prices
   */
  getAllCurrentPrices(): Price[] {
    return Array.from(this.currentPrices.values());
  }

  /**
   * Set previous on-chain price (used for comparison)
   */
  setPreviousOnChainPrice(symbol: string, price: number): void {
    this.previousOnChainPrices.set(symbol, price);
  }

  /**
   * Get previous on-chain price
   */
  getPreviousOnChainPrice(symbol: string): number | undefined {
    return this.previousOnChainPrices.get(symbol);
  }

  /**
   * Set last update time for an asset
   */
  setLastUpdateTime(symbol: string, timestamp: number): void {
    this.lastUpdateTimes.set(symbol, timestamp);
  }

  /**
   * Get last update time for an asset
   */
  getLastUpdateTime(symbol: string): number | undefined {
    return this.lastUpdateTimes.get(symbol);
  }

  /**
   * Get time since last update for an asset
   */
  getTimeSinceLastUpdate(symbol: string): number | undefined {
    const lastUpdate = this.lastUpdateTimes.get(symbol);
    if (!lastUpdate) return undefined;
    return Date.now() - lastUpdate;
  }
}

/**
 * In-memory storage for escrow accounts and their positions
 */
export class SentinelStorage {
  private escrows: Map<string, EscrowAccount> = new Map();
  private positions: Map<string, CollateralPosition> = new Map(); // key: escrowAddress
  private collateralIndex: Map<string, Set<string>> = new Map(); // collateralAsset => Set of escrowAddresses

  /**
   * Register a new escrow account
   */
  registerEscrow(escrow: EscrowAccount): boolean {
    if (this.escrows.has(escrow.address)) {
      return false; // Already registered
    }

    this.escrows.set(escrow.address, escrow);
    return true;
  }

  /**
   * Check if escrow is registered
   */
  isEscrowRegistered(address: string): boolean {
    return this.escrows.has(address);
  }

  /**
   * Get all registered escrows
   */
  getAllEscrows(): EscrowAccount[] {
    return Array.from(this.escrows.values());
  }

  /**
   * Get escrow by address
   */
  getEscrow(address: string): EscrowAccount | undefined {
    return this.escrows.get(address);
  }

  /**
   * Update or create a position for an escrow
   */
  updatePosition(position: CollateralPosition): void {
    const oldPosition = this.positions.get(position.escrowAddress);

    // If collateral asset changed, update the index
    if (oldPosition && oldPosition.collateralAsset !== position.collateralAsset) {
      this.removeFromCollateralIndex(
        oldPosition.collateralAsset,
        position.escrowAddress
      );
    }

    // Store the new position
    this.positions.set(position.escrowAddress, position);

    // Add to collateral index
    this.addToCollateralIndex(position.collateralAsset, position.escrowAddress);
  }

  /**
   * Get position for an escrow
   */
  getPosition(escrowAddress: string): CollateralPosition | undefined {
    return this.positions.get(escrowAddress);
  }

  /**
   * Get all positions
   */
  getAllPositions(): CollateralPosition[] {
    return Array.from(this.positions.values());
  }

  /**
   * Get positions by collateral asset
   */
  getPositionsByCollateral(
    collateralAsset: string,
    limit: number = 100,
    offset: number = 0
  ): {
    positions: CollateralPosition[];
    total: number;
  } {
    const escrowAddresses = this.collateralIndex.get(collateralAsset);

    if (!escrowAddresses) {
      return { positions: [], total: 0 };
    }

    const allAddresses = Array.from(escrowAddresses);
    const total = allAddresses.length;

    // Apply pagination
    const paginatedAddresses = allAddresses.slice(offset, offset + limit);

    const positions = paginatedAddresses
      .map((addr) => this.positions.get(addr))
      .filter((pos): pos is CollateralPosition => pos !== undefined);

    return { positions, total };
  }

  /**
   * Add escrow to collateral index
   */
  private addToCollateralIndex(
    collateralAsset: string,
    escrowAddress: string
  ): void {
    let escrowSet = this.collateralIndex.get(collateralAsset);

    if (!escrowSet) {
      escrowSet = new Set();
      this.collateralIndex.set(collateralAsset, escrowSet);
    }

    escrowSet.add(escrowAddress);
  }

  /**
   * Remove escrow from collateral index
   */
  private removeFromCollateralIndex(
    collateralAsset: string,
    escrowAddress: string
  ): void {
    const escrowSet = this.collateralIndex.get(collateralAsset);

    if (escrowSet) {
      escrowSet.delete(escrowAddress);

      // Clean up empty sets
      if (escrowSet.size === 0) {
        this.collateralIndex.delete(collateralAsset);
      }
    }
  }

  /**
   * Get count of positions by collateral asset
   */
  getPositionCountByCollateral(collateralAsset: string): number {
    const escrowSet = this.collateralIndex.get(collateralAsset);
    return escrowSet ? escrowSet.size : 0;
  }

  /**
   * Get all collateral assets being tracked
   */
  getTrackedCollateralAssets(): string[] {
    return Array.from(this.collateralIndex.keys());
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      totalEscrows: this.escrows.size,
      totalPositions: this.positions.size,
      uniqueCollateralAssets: this.collateralIndex.size,
    };
  }
}
