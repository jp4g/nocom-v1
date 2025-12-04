import type { ServiceError } from './types';
import { ERROR_CODES } from './constants';

/**
 * Create a standardized service error object
 */
export function createError(
  code: keyof typeof ERROR_CODES,
  message: string,
  details?: unknown
): ServiceError {
  return {
    code: ERROR_CODES[code],
    message,
    details,
    timestamp: Date.now(),
  };
}

/**
 * Calculate percentage change between two numbers
 */
export function calculatePercentageChange(
  oldValue: number,
  newValue: number
): number {
  if (oldValue === 0) return 100;
  return ((newValue - oldValue) / oldValue) * 100;
}

/**
 * Validate API key format
 */
export function isValidApiKey(apiKey: string): boolean {
  return typeof apiKey === 'string' && apiKey.length >= 32;
}

/**
 * Generate a random API key
 */
export function generateApiKey(): string {
  return Array.from({ length: 32 }, () =>
    Math.random().toString(36).charAt(2)
  ).join('');
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Validate asset symbol format (alphanumeric, 2-10 chars)
 */
export function isValidAssetSymbol(symbol: string): boolean {
  return /^[A-Z0-9]{2,10}$/.test(symbol);
}

/**
 * Validate ethereum-style address
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Format timestamp to ISO string
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

/**
 * Calculate accrued interest
 * @param principal - Original debt amount
 * @param rate - Annual interest rate (e.g., 0.05 for 5%)
 * @param timeElapsed - Time elapsed in milliseconds
 */
export function calculateAccruedInterest(
  principal: number,
  rate: number,
  timeElapsed: number
): number {
  const timeInYears = timeElapsed / (1000 * 60 * 60 * 24 * 365);
  return principal * rate * timeInYears;
}

/**
 * Calculate health factor
 * @param collateralValue - Total collateral value in USD
 * @param debtValue - Total debt value in USD
 * @param threshold - Collateralization threshold (e.g., 1.5 for 150%)
 */
export function calculateHealthFactor(
  collateralValue: number,
  debtValue: number,
  threshold: number
): number {
  if (debtValue === 0) return Infinity;
  return collateralValue / (debtValue * threshold);
}
