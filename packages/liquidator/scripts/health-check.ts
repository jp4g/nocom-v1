#!/usr/bin/env bun
/**
 * Health check script for the liquidator service
 * Usage: bun scripts/health-check.ts [url]
 *
 * URL priority: CLI arg > LIQUIDATOR_URL env > default (localhost:9000)
 */
import 'dotenv/config';

const DEFAULT_URL = 'http://localhost:9000';
const url = process.argv[2] || process.env.LIQUIDATOR_URL || DEFAULT_URL;

async function healthCheck() {
  console.log(`Checking health at: ${url}`);

  try {
    const response = await fetch(`${url}/health`);
    const data = await response.json();

    if (response.ok && data.status === 'healthy') {
      console.log('Service is healthy');
      console.log(JSON.stringify(data, null, 2));
      process.exit(0);
    } else {
      console.error('Service is unhealthy');
      console.error(JSON.stringify(data, null, 2));
      process.exit(1);
    }
  } catch (error) {
    console.error('Health check failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

healthCheck();
