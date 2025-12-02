/**
 * Queue to serialize simulation requests and prevent concurrent IndexedDB access.
 *
 * The Aztec PXE uses IndexedDB internally, and concurrent simulations can cause
 * "TransactionInactiveError" when multiple operations try to access the same
 * IndexedDB store simultaneously.
 */

type QueuedTask<T> = {
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: any) => void;
};

class SimulationQueue {
  private queue: QueuedTask<any>[] = [];
  private isProcessing = false;

  /**
   * Add a simulation task to the queue.
   * Tasks are executed sequentially to avoid IndexedDB transaction conflicts.
   */
  async enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ execute: task, resolve, reject });
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
