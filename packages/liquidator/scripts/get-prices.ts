#!/usr/bin/env bun
/**
 * Get current prices from the liquidator service
 * Usage: bun scripts/get-prices.ts [url]
 *
 * URL priority: CLI arg > LIQUIDATOR_URL env > default (localhost:9000)
 */
import 'dotenv/config';

const DEFAULT_URL = 'http://localhost:9000';
const url = process.argv[2] || process.env.LIQUIDATOR_URL || DEFAULT_URL;

async function getPrices() {
  console.log(`Fetching prices from: ${url}`);

  try {
    // Get cached prices (from sync service)
    const cachedResponse = await fetch(`${url}/cached-prices`);
    const cachedData = await cachedResponse.json();

    console.log('\n=== Cached Prices (for health checks) ===');
    console.log(JSON.stringify(cachedData, null, 2));

    // Get all prices from storage
    const pricesResponse = await fetch(`${url}/prices`);
    const pricesData = await pricesResponse.json();

    console.log('\n=== Storage Prices (from CoinGecko) ===');
    console.log(JSON.stringify(pricesData, null, 2));

  } catch (error) {
    console.error('Failed to fetch prices:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

getPrices();
