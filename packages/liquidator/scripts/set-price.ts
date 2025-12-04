#!/usr/bin/env bun
/**
 * Set the price for any tracked asset
 * Usage: bun scripts/set-price.ts <asset> <price> [url]
 * Example: bun scripts/set-price.ts ZEC 42.50
 *
 * URL priority: CLI arg > LIQUIDATOR_URL env > default (localhost:9000)
 */
import 'dotenv/config';

const DEFAULT_URL = 'http://localhost:9000';

const asset = process.argv[2]?.toUpperCase();
const price = parseFloat(process.argv[3]);
const url = process.argv[4] || process.env.LIQUIDATOR_URL || DEFAULT_URL;

if (!asset || !price || isNaN(price) || price <= 0) {
  console.error('Usage: bun scripts/set-price.ts <asset> <price> [url]');
  console.error('Example: bun scripts/set-price.ts ZEC 42.50');
  console.error('Example: bun scripts/set-price.ts USDC 1.00');
  console.error('');
  console.error('URL priority: CLI arg > LIQUIDATOR_URL env > default (localhost:9000)');
  process.exit(1);
}

async function setPrice() {
  console.log(`Setting ${asset} price to $${price.toFixed(2)} at: ${url}`);

  try {
    const response = await fetch(`${url}/prices/${asset}/set`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ price }),
    });

    const data = await response.json();

    if (response.ok && data.success) {
      console.log(`${asset} price set to $${price.toFixed(2)}`);
      if (data.txHash) {
        console.log(`Transaction hash: ${data.txHash}`);
      }
      process.exit(0);
    } else {
      console.error('Failed to set price');
      console.error(JSON.stringify(data, null, 2));
      process.exit(1);
    }
  } catch (error) {
    console.error('Request failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

setPrice();
