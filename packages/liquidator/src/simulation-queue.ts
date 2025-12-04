/**
 * Queue to serialize Aztec PXE operations and prevent concurrent IndexedDB access.
 *
 * The Aztec PXE uses IndexedDB internally, and concurrent simulations/transactions
 * can cause "TransactionInactiveError" when multiple operations try to access
 * the same IndexedDB store simultaneously.
 *
 * All contract calls (both simulations and sends) must go through this queue.
 */

type QueuedTask<T> = {
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: any) => void;
  description?: string;
};

class SimulationQueue {
  private queue: QueuedTask<any>[] = [];
  private isProcessing = false;
  private logger?: { debug: (obj: object, msg: string) => void };

  /**
   * Set a logger for debugging queue operations
   */
  setLogger(logger: { debug: (obj: object, msg: string) => void }): void {
    this.logger = logger;
  }

  /**
   * Add a task to the queue.
   * Tasks are executed sequentially to avoid IndexedDB transaction conflicts.
   */
  async enqueue<T>(task: () => Promise<T>, description?: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ execute: task, resolve, reject, description });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      try {
        if (this.logger && task.description) {
          this.logger.debug({ queueSize: this.queue.length }, `Executing: ${task.description}`);
        }
        const result = await task.execute();
        task.resolve(result);
      } catch (error) {
        task.reject(error);
      }

      // Small delay between tasks to ensure IndexedDB transactions fully complete
      if (this.queue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    this.isProcessing = false;
  }

  /**
   * Get the current queue size
   */
  get size(): number {
    return this.queue.length;
  }

  /**
   * Check if queue is currently processing
   */
  get processing(): boolean {
    return this.isProcessing;
  }
}

// Global singleton instance
export const simulationQueue = new SimulationQueue();
