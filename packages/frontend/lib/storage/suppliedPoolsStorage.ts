/**
 * Local storage utility for tracking debt pools the user has supplied to.
 * Maps userAddress -> [poolAddresses]
 * This allows us to only query loan positions for pools we've actually interacted with.
 */

const SUPPLIED_POOLS_STORAGE_KEY = 'nocom_supplied_pools';

export interface SuppliedPoolsStorage {
  [userAddress: string]: string[]; // userAddress -> array of pool addresses
}

/**
 * Get all supplied pool mappings from local storage
 */
export function getAllSuppliedPools(): SuppliedPoolsStorage {
  if (typeof window === 'undefined') return {};

  try {
    const stored = localStorage.getItem(SUPPLIED_POOLS_STORAGE_KEY);
    if (!stored) return {};
    return JSON.parse(stored);
  } catch (error) {
    console.error('[suppliedPoolsStorage] Error reading supplied pools:', error);
    return {};
  }
}

/**
 * Get supplied pools for a specific user
 */
export function getSuppliedPoolsForUser(userAddress: string): string[] {
  const allMappings = getAllSuppliedPools();
  return allMappings[userAddress] ?? [];
}

/**
 * Check if a pool is already tracked for a user
 */
export function isPoolSupplied(userAddress: string, poolAddress: string): boolean {
  const userPools = getSuppliedPoolsForUser(userAddress);
  return userPools.includes(poolAddress);
}

/**
 * Add a pool to the user's supplied pools list (no duplicates)
 */
export function addSuppliedPool(userAddress: string, poolAddress: string): void {
  if (typeof window === 'undefined') return;

  try {
    const allMappings = getAllSuppliedPools();
    if (!allMappings[userAddress]) {
      allMappings[userAddress] = [];
    }

    // Only add if not already present
    if (!allMappings[userAddress].includes(poolAddress)) {
      allMappings[userAddress].push(poolAddress);
      localStorage.setItem(SUPPLIED_POOLS_STORAGE_KEY, JSON.stringify(allMappings));
      console.log('[suppliedPoolsStorage] Added supplied pool:', { userAddress, poolAddress });
    } else {
      console.log('[suppliedPoolsStorage] Pool already tracked:', { userAddress, poolAddress });
    }
  } catch (error) {
    console.error('[suppliedPoolsStorage] Error adding supplied pool:', error);
    throw error;
  }
}

/**
 * Remove a pool from the user's supplied pools list
 */
export function removeSuppliedPool(userAddress: string, poolAddress: string): void {
  if (typeof window === 'undefined') return;

  try {
    const allMappings = getAllSuppliedPools();
    if (allMappings[userAddress]) {
      allMappings[userAddress] = allMappings[userAddress].filter(addr => addr !== poolAddress);
      // Clean up empty user entries
      if (allMappings[userAddress].length === 0) {
        delete allMappings[userAddress];
      }
      localStorage.setItem(SUPPLIED_POOLS_STORAGE_KEY, JSON.stringify(allMappings));
    }
    console.log('[suppliedPoolsStorage] Removed supplied pool:', { userAddress, poolAddress });
  } catch (error) {
    console.error('[suppliedPoolsStorage] Error removing supplied pool:', error);
  }
}

/**
 * Clear all supplied pools for a specific user
 */
export function clearUserSuppliedPools(userAddress: string): void {
  if (typeof window === 'undefined') return;

  try {
    const allMappings = getAllSuppliedPools();
    delete allMappings[userAddress];
    localStorage.setItem(SUPPLIED_POOLS_STORAGE_KEY, JSON.stringify(allMappings));
    console.log('[suppliedPoolsStorage] Cleared supplied pools for user:', userAddress);
  } catch (error) {
    console.error('[suppliedPoolsStorage] Error clearing user supplied pools:', error);
  }
}

/**
 * Clear all supplied pools (for testing/cleanup)
 */
export function clearAllSuppliedPools(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(SUPPLIED_POOLS_STORAGE_KEY);
    console.log('[suppliedPoolsStorage] Cleared all supplied pools');
  } catch (error) {
    console.error('[suppliedPoolsStorage] Error clearing supplied pools:', error);
  }
}
