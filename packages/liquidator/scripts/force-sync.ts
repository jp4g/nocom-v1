#!/usr/bin/env bun
/**
 * Force sync script for the liquidator service
 * Triggers an immediate scan of all escrows and health check
 * Usage: bun scripts/force-sync.ts [url]
 *
 * URL priority: CLI arg > LIQUIDATOR_URL env > default (localhost:9000)
 */
import 'dotenv/config';

const DEFAULT_URL = 'http://localhost:9000';
const url = process.argv[2] || process.env.LIQUIDATOR_URL || DEFAULT_URL;

async function forceSync() {
  console.log(`Forcing sync at: ${url}`);

  try {
    const response = await fetch(`${url}/sync`, {
      method: 'POST',
    });
    const data = await response.json();

    if (response.ok && data.success) {
      console.log('Sync completed successfully');
      console.log(JSON.stringify(data, null, 2));
      process.exit(0);
    } else {
      console.error('Sync failed');
      console.error(JSON.stringify(data, null, 2));
      process.exit(1);
    }
  } catch (error) {
    console.error('Force sync failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

forceSync();
