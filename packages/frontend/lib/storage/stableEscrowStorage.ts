/**
 * Local storage utility for managing stable escrow contract address mappings.
 * Maps userAddress -> stablePoolAddress -> { escrowAddress, secretKey }.
 * This allows different users to have their own stable escrow contracts per market.
 * The secretKey is needed to re-register the escrow with the PXE on page reload.
 */

const STABLE_ESCROW_STORAGE_KEY = 'nocom_stable_escrow_mappings';

export interface StableEscrowData {
  escrowAddress: string;
  secretKey: string;
  instance: string; // JSON stringified ContractInstanceWithAddress
}

export interface UserStableEscrowMapping {
  [stablePoolAddress: string]: StableEscrowData; // stablePoolAddress -> escrow data
}

export interface StableEscrowStorage {
  [userAddress: string]: UserStableEscrowMapping; // userAddress -> mapping
}

/**
 * Get all stable escrow mappings from local storage
 */
export function getAllStableEscrowMappings(): StableEscrowStorage {
  if (typeof window === 'undefined') return {};

  try {
    const stored = localStorage.getItem(STABLE_ESCROW_STORAGE_KEY);
    if (!stored) return {};
    return JSON.parse(stored);
  } catch (error) {
    console.error('[stableEscrowStorage] Error reading stable escrow mappings:', error);
    return {};
  }
}

/**
 * Get stable escrow mappings for a specific user
 */
export function getStableEscrowMappings(userAddress: string): UserStableEscrowMapping {
  const allMappings = getAllStableEscrowMappings();
  return allMappings[userAddress] ?? {};
}

/**
 * Get stable escrow data for a specific user and stable pool
 */
export function getStableEscrowData(userAddress: string, stablePoolAddress: string): StableEscrowData | undefined {
  const userMappings = getStableEscrowMappings(userAddress);
  return userMappings[stablePoolAddress];
}

/**
 * Store a new stable escrow mapping for a user
 */
export function setStableEscrowData(userAddress: string, stablePoolAddress: string, escrowAddress: string, secretKey: string, instance: string): void {
  if (typeof window === 'undefined') return;

  try {
    const allMappings = getAllStableEscrowMappings();
    if (!allMappings[userAddress]) {
      allMappings[userAddress] = {};
    }
    allMappings[userAddress][stablePoolAddress] = { escrowAddress, secretKey, instance };
    localStorage.setItem(STABLE_ESCROW_STORAGE_KEY, JSON.stringify(allMappings));
    console.log('[stableEscrowStorage] Stored stable escrow mapping:', { userAddress, stablePoolAddress, escrowAddress });
  } catch (error) {
    console.error('[stableEscrowStorage] Error storing stable escrow mapping:', error);
    throw error;
  }
}

/**
 * Remove a stable escrow mapping for a user (for testing/cleanup)
 */
export function removeStableEscrowAddress(userAddress: string, stablePoolAddress: string): void {
  if (typeof window === 'undefined') return;

  try {
    const allMappings = getAllStableEscrowMappings();
    if (allMappings[userAddress]) {
      delete allMappings[userAddress][stablePoolAddress];
      // Clean up empty user entries
      if (Object.keys(allMappings[userAddress]).length === 0) {
        delete allMappings[userAddress];
      }
      localStorage.setItem(STABLE_ESCROW_STORAGE_KEY, JSON.stringify(allMappings));
    }
    console.log('[stableEscrowStorage] Removed stable escrow mapping for:', { userAddress, stablePoolAddress });
  } catch (error) {
    console.error('[stableEscrowStorage] Error removing stable escrow mapping:', error);
  }
}

/**
 * Clear all stable escrow mappings for a specific user (for testing/cleanup)
 */
export function clearUserStableEscrowMappings(userAddress: string): void {
  if (typeof window === 'undefined') return;

  try {
    const allMappings = getAllStableEscrowMappings();
    delete allMappings[userAddress];
    localStorage.setItem(STABLE_ESCROW_STORAGE_KEY, JSON.stringify(allMappings));
    console.log('[stableEscrowStorage] Cleared stable escrow mappings for user:', userAddress);
  } catch (error) {
    console.error('[stableEscrowStorage] Error clearing user stable escrow mappings:', error);
  }
}

/**
 * Clear all stable escrow mappings (for testing/cleanup)
 */
export function clearAllStableEscrowMappings(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(STABLE_ESCROW_STORAGE_KEY);
    console.log('[stableEscrowStorage] Cleared all stable escrow mappings');
  } catch (error) {
    console.error('[stableEscrowStorage] Error clearing stable escrow mappings:', error);
  }
}
