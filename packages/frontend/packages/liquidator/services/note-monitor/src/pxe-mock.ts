import type { Note, CollateralPosition } from '@liquidator/shared';
import type { Logger } from 'pino';

/**
 * Mock PXE Client for Aztec private state synchronization
 *
 * This mocks the PXE (Private Execution Environment) client that would
 * interact with Aztec for private state synchronization and note fetching.
 */
export class MockPXEClient {
  private pxeUrl: string;
  private logger: Logger;
  private mockNotes: Map<string, Note[]> = new Map(); // escrowAddress => notes
  private mockPositions: Map<string, CollateralPosition> = new Map();

  constructor(pxeUrl: string, logger: Logger) {
    this.pxeUrl = pxeUrl;
    this.logger = logger;
    this.initializeMockData();
  }

  /**
   * Initialize with some mock data for testing
   */
  private initializeMockData(): void {
    // Create mock positions for testing
    const mockEscrow1 = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1';
    const mockEscrow2 = '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199';
    const mockEscrow3 = '0xdD2FD4581271e230360230F9337D5c0430Bf44C0';

    this.mockPositions.set(mockEscrow1, {
      escrowAddress: mockEscrow1,
      collateralAsset: 'BTC',
      collateralAmount: 2.5,
      debtAsset: 'USDC',
      debtAmount: 75000,
      poolId: 'pool-1',
      lastUpdated: Date.now(),
    });

    this.mockPositions.set(mockEscrow2, {
      escrowAddress: mockEscrow2,
      collateralAsset: 'ETH',
      collateralAmount: 50,
      debtAsset: 'USDC',
      debtAmount: 90000,
      poolId: 'pool-1',
      lastUpdated: Date.now(),
    });

    this.mockPositions.set(mockEscrow3, {
      escrowAddress: mockEscrow3,
      collateralAsset: 'BTC',
      collateralAmount: 1.0,
      debtAsset: 'USDC',
      debtAmount: 30000,
      poolId: 'pool-2',
      lastUpdated: Date.now(),
    });
  }

  /**
   * Sync private state for an escrow account
   * MOCK: Simulates the sync operation
   */
  async syncPrivateState(escrowAddress: string): Promise<void> {
    this.logger.debug({ escrowAddress }, 'Syncing private state (MOCK)');

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    this.logger.debug({ escrowAddress }, 'Private state synced (MOCK)');
  }

  /**
   * Fetch notes for an escrow account
   * MOCK: Returns mock note data
   */
  async fetchNotes(escrowAddress: string): Promise<Note[]> {
    this.logger.debug({ escrowAddress }, 'Fetching notes (MOCK)');

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Get or create mock position
    let position = this.mockPositions.get(escrowAddress);

    if (!position) {
      // If no position exists, this escrow has no notes yet
      return [];
    }

    // Add some random variation to simulate position changes
    const variation = (Math.random() - 0.5) * 0.1; // +/- 5%
    position = {
      ...position,
      collateralAmount: position.collateralAmount * (1 + variation),
      debtAmount: position.debtAmount * (1 + variation * 0.5),
      lastUpdated: Date.now(),
    };

    // Update stored position
    this.mockPositions.set(escrowAddress, position);

    // Create a mock note containing the position data
    const note: Note = {
      id: `note-${escrowAddress}-${Date.now()}`,
      escrowAddress,
      data: position, // In reality, this would be encrypted note data
    };

    return [note];
  }

  /**
   * Parse note data to extract position information
   * MOCK: Simply returns the embedded position data
   */
  parseNoteToPosition(note: Note): CollateralPosition {
    // In reality, this would decrypt and parse the note data
    return note.data as CollateralPosition;
  }

  /**
   * Check if PXE connection is healthy
   * MOCK: Always returns true
   */
  async healthCheck(): Promise<boolean> {
    this.logger.debug({ pxeUrl: this.pxeUrl }, 'PXE health check (MOCK)');

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 30));

    return true;
  }

  /**
   * Manually add a mock position for testing
   */
  addMockPosition(position: CollateralPosition): void {
    this.mockPositions.set(position.escrowAddress, position);
    this.logger.debug({ position }, 'Mock position added');
  }

  /**
   * Simulate a position update (for testing)
   */
  updateMockPosition(
    escrowAddress: string,
    updates: Partial<CollateralPosition>
  ): void {
    const existing = this.mockPositions.get(escrowAddress);
    if (existing) {
      const updated = {
        ...existing,
        ...updates,
        lastUpdated: Date.now(),
      };
      this.mockPositions.set(escrowAddress, updated);
      this.logger.debug({ escrowAddress, updates }, 'Mock position updated');
    }
  }
}

/*
 * IMPLEMENTATION NOTE FOR PHASE 8:
 *
 * Replace this mock with actual PXE (Private Execution Environment) integration:
 *
 * 1. Import Aztec SDK and PXE client libraries
 * 2. Connect to actual PXE service using the provided URL
 * 3. Implement syncPrivateState() to call real PXE sync methods
 * 4. Implement fetchNotes() to retrieve actual encrypted notes
 * 5. Implement parseNoteToPosition() to decrypt and parse real note structures
 * 6. Handle PXE connection failures with retry logic
 * 7. Add proper error handling for decryption failures
 *
 * Example real implementation:
 *
 * import { createPXEClient } from '@aztec/aztec.js';
 *
 * class PXEClient {
 *   private client: PXE;
 *
 *   constructor(pxeUrl: string) {
 *     this.client = createPXEClient(pxeUrl);
 *   }
 *
 *   async syncPrivateState(escrowAddress: string) {
 *     await this.client.syncPrivateState(escrowAddress);
 *   }
 *
 *   async fetchNotes(escrowAddress: string) {
 *     return await this.client.getNotes(escrowAddress);
 *   }
 *
 *   parseNoteToPosition(note: Note): CollateralPosition {
 *     // Decrypt note and extract position data
 *     const decrypted = this.client.decryptNote(note);
 *     return {
 *       escrowAddress: decrypted.escrowAddress,
 *       collateralAsset: decrypted.collateralAsset,
 *       collateralAmount: decrypted.collateralAmount,
 *       debtAsset: decrypted.debtAsset,
 *       debtAmount: decrypted.debtAmount,
 *       poolId: decrypted.poolId,
 *       lastUpdated: Date.now(),
 *     };
 *   }
 * }
 */
