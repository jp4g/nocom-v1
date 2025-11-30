import type { NoteMonitorStorage } from './storage';
import type { MockPXEClient } from './pxe-mock';
import type { Logger } from 'pino';

export interface NoteSyncConfig {
  syncInterval: number; // milliseconds (60 seconds)
}

/**
 * Note Synchronization Service
 * Handles periodic syncing of private state and note fetching for all registered escrows
 */
export class NoteSyncService {
  private storage: NoteMonitorStorage;
  private pxeClient: MockPXEClient;
  private config: NoteSyncConfig;
  private logger: Logger;
  private intervalId?: Timer;
  private isRunning: boolean = false;

  constructor(
    storage: NoteMonitorStorage,
    pxeClient: MockPXEClient,
    config: NoteSyncConfig,
    logger: Logger
  ) {
    this.storage = storage;
    this.pxeClient = pxeClient;
    this.config = config;
    this.logger = logger;
  }

  /**
   * Start the note synchronization loop
   */
  start(): void {
    if (this.isRunning) {
      this.logger.warn('Note sync service is already running');
      return;
    }

    this.logger.info(
      { interval: this.config.syncInterval },
      'Starting note sync service'
    );

    this.isRunning = true;

    // Run immediately then on interval
    this.runSyncCycle();

    this.intervalId = setInterval(() => {
      this.runSyncCycle();
    }, this.config.syncInterval);
  }

  /**
   * Stop the note synchronization loop
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    this.isRunning = false;
    this.logger.info('Note sync service stopped');
  }

  /**
   * Run a single synchronization cycle
   */
  private async runSyncCycle(): Promise<void> {
    try {
      const escrows = this.storage.getAllEscrows();

      if (escrows.length === 0) {
        this.logger.debug('No escrows registered, skipping sync cycle');
        return;
      }

      this.logger.info(
        { escrowCount: escrows.length },
        'Running note sync cycle'
      );

      // Sync each escrow
      for (const escrow of escrows) {
        await this.syncEscrow(escrow.address);
      }

      this.logger.info('Note sync cycle completed');
    } catch (error) {
      this.logger.error({ error }, 'Error in note sync cycle');
    }
  }

  /**
   * Sync a single escrow account
   */
  private async syncEscrow(escrowAddress: string): Promise<void> {
    try {
      this.logger.debug({ escrowAddress }, 'Syncing escrow');

      // Step 1: Sync private state
      await this.pxeClient.syncPrivateState(escrowAddress);

      // Step 2: Fetch notes
      const notes = await this.pxeClient.fetchNotes(escrowAddress);

      if (notes.length === 0) {
        this.logger.debug({ escrowAddress }, 'No notes found for escrow');
        return;
      }

      // Step 3: Process each note
      for (const note of notes) {
        await this.processNote(note, escrowAddress);
      }

      this.logger.debug(
        { escrowAddress, noteCount: notes.length },
        'Escrow sync completed'
      );
    } catch (error) {
      this.logger.error({ error, escrowAddress }, 'Error syncing escrow');
      // Continue with other escrows even if one fails
    }
  }

  /**
   * Process a single note and update storage
   */
  private async processNote(note: any, escrowAddress: string): Promise<void> {
    try {
      // Parse note to extract position
      const position = this.pxeClient.parseNoteToPosition(note);

      // Check if this is a new or updated position
      const existingPosition = this.storage.getPosition(escrowAddress);

      if (!existingPosition) {
        this.logger.info({ escrowAddress, position }, 'New position detected');
      } else {
        // Check if position has changed
        const hasChanged =
          existingPosition.collateralAmount !== position.collateralAmount ||
          existingPosition.debtAmount !== position.debtAmount ||
          existingPosition.collateralAsset !== position.collateralAsset;

        if (hasChanged) {
          this.logger.info(
            {
              escrowAddress,
              old: existingPosition,
              new: position,
            },
            'Position updated'
          );
        }
      }

      // Update storage
      this.storage.updatePosition(position);
    } catch (error) {
      this.logger.error(
        { error, noteId: note.id, escrowAddress },
        'Error processing note'
      );
    }
  }

  /**
   * Force sync a specific escrow (on-demand)
   */
  async forceSyncEscrow(escrowAddress: string): Promise<void> {
    this.logger.info({ escrowAddress }, 'Force syncing escrow');
    await this.syncEscrow(escrowAddress);
  }

  /**
   * Get sync service status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      syncInterval: this.config.syncInterval,
      lastSync: this.intervalId ? 'running' : 'stopped',
    };
  }
}
