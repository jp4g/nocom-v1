#!/usr/bin/env bun
/**
 * Script to manually set the ZEC price via the price-service API
 *
 * Usage: bun scripts/set-zec-price.ts <price>
 * Example: bun scripts/set-zec-price.ts 42.50
 */

const PRICE_SERVICE_URL = process.env.PRICE_SERVICE_URL || 'http://localhost:9000';

async function main() {
  const args = process.argv.slice(2);

  if (args.length !== 1) {
    console.error('Usage: bun scripts/set-zec-price.ts <price>');
    console.error('Example: bun scripts/set-zec-price.ts 42.50');
    process.exit(1);
  }

  const price = parseFloat(args[0]!);

  if (isNaN(price) || price <= 0) {
    console.error('Error: Price must be a positive number');
    console.error('Example: bun scripts/set-zec-price.ts 42.50');
    process.exit(1);
  }

  console.log(`Setting ZEC price to $${price.toFixed(2)}...`);
  console.log(`Price service URL: ${PRICE_SERVICE_URL}`);

  try {
    const response = await fetch(`${PRICE_SERVICE_URL}/prices/ZEC/set`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ price }),
    });

    const result = await response.json();

    if (result.success) {
      console.log(`\nSuccess! ZEC price set to $${price.toFixed(2)}`);
      if (result.txHash) {
        console.log(`Transaction hash: ${result.txHash}`);
      }
    } else {
      console.error(`\nFailed to set price: ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`\nError connecting to price service: ${error}`);
    console.error(`Make sure the price service is running at ${PRICE_SERVICE_URL}`);
    process.exit(1);
  }
}

main();
