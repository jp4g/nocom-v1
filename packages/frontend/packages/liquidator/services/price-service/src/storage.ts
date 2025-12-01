import type { Asset, Price } from '@liquidator/shared';

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
