import type { EscrowAccount, CollateralPosition } from '@liquidator/shared';

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
