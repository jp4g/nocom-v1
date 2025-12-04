#!/usr/bin/env bun
/**
 * Set the price update interval for the liquidator service
 * Usage: bun scripts/set-update-interval.ts <seconds> [url]
 * Example: bun scripts/set-update-interval.ts 30
 *
 * URL priority: CLI arg > LIQUIDATOR_URL env > default (localhost:9000)
 */
import 'dotenv/config';

const DEFAULT_URL = 'http://localhost:9000';

const seconds = parseInt(process.argv[2]);
const url = process.argv[3] || process.env.LIQUIDATOR_URL || DEFAULT_URL;

if (!seconds || isNaN(seconds) || seconds < 1) {
  console.error('Usage: bun scripts/set-update-interval.ts <seconds> [url]');
  console.error('Example: bun scripts/set-update-interval.ts 30');
  console.error('');
  console.error('URL priority: CLI arg > LIQUIDATOR_URL env > default (localhost:9000)');
  process.exit(1);
}

async function setUpdateInterval() {
  console.log(`Setting update interval to ${seconds}s at: ${url}`);

  try {
    const response = await fetch(`${url}/config/update-interval`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seconds }),
    });

    const data = await response.json();

    if (response.ok && data.success) {
      console.log(`Update interval set to ${seconds} seconds`);
      console.log(JSON.stringify(data, null, 2));
      process.exit(0);
    } else {
      console.error('Failed to set update interval');
      console.error(JSON.stringify(data, null, 2));
      process.exit(1);
    }
  } catch (error) {
    console.error('Request failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

setUpdateInterval();
