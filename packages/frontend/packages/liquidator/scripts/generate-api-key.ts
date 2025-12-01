#!/usr/bin/env bun

/**
 * API Key Generation Utility
 *
 * Generates a cryptographically secure random API key for
 * authenticating service-to-service communication.
 *
 * Usage:
 *   bun scripts/generate-api-key.ts
 *   bun scripts/generate-api-key.ts --length 64
 */

const DEFAULT_LENGTH = 32;

function generateApiKey(length: number = DEFAULT_LENGTH): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const randomBytes = new Uint8Array(length);

  // Use crypto.getRandomValues for cryptographically secure random numbers
  crypto.getRandomValues(randomBytes);

  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[randomBytes[i] % chars.length];
  }

  return result;
}

function main() {
  const args = process.argv.slice(2);
  let length = DEFAULT_LENGTH;

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--length' && i + 1 < args.length) {
      const parsedLength = parseInt(args[i + 1], 10);
      if (parsedLength > 0 && parsedLength <= 128) {
        length = parsedLength;
      } else {
        console.error('Error: Length must be between 1 and 128');
        process.exit(1);
      }
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log('API Key Generation Utility');
      console.log('');
      console.log('Usage:');
      console.log('  bun scripts/generate-api-key.ts [--length N]');
      console.log('');
      console.log('Options:');
      console.log('  --length N    Generate key of length N (default: 32, max: 128)');
      console.log('  --help, -h    Show this help message');
      console.log('');
      console.log('Example:');
      console.log('  bun scripts/generate-api-key.ts --length 64');
      process.exit(0);
    }
  }

  const apiKey = generateApiKey(length);

  console.log('');
  console.log('='.repeat(60));
  console.log('  Liquidator API Key Generator');
  console.log('='.repeat(60));
  console.log('');
  console.log(`Generated API Key (${length} characters):`);
  console.log('');
  console.log(`  ${apiKey}`);
  console.log('');
  console.log('Add this to your .env file:');
  console.log('');
  console.log(`  LIQUIDATION_API_KEY=${apiKey}`);
  console.log('');
  console.log('WARNING: Keep this key secret! Do not commit to version control.');
  console.log('');
  console.log('='.repeat(60));
  console.log('');
}

main();
