/**
 * Local storage utility for managing escrow contract address mappings.
 * Maps userAddress -> debtPoolAddress -> { escrowAddress, secretKey }.
 * This allows different users to have their own escrow contracts per market.
 * The secretKey is needed to re-register the escrow with the PXE on page reload.
 */

const ESCROW_STORAGE_KEY = 'nocom_escrow_mappings';

export interface EscrowData {
  escrowAddress: string;
  secretKey: string;
  instance: string; // JSON stringified ContractInstanceWithAddress
}

export interface UserEscrowMapping {
  [debtPoolAddress: string]: EscrowData; // debtPoolAddress -> escrow data
}

export interface EscrowStorage {
  [userAddress: string]: UserEscrowMapping; // userAddress -> mapping
}

/**
 * Get all escrow mappings from local storage
 */
export function getAllEscrowMappings(): EscrowStorage {
  if (typeof window === 'undefined') return {};

  try {
    const stored = localStorage.getItem(ESCROW_STORAGE_KEY);
    if (!stored) return {};
    return JSON.parse(stored);
  } catch (error) {
    console.error('[escrowStorage] Error reading escrow mappings:', error);
    return {};
  }
}

/**
 * Get escrow mappings for a specific user
 */
export function getEscrowMappings(userAddress: string): UserEscrowMapping {
  const allMappings = getAllEscrowMappings();
  return allMappings[userAddress] ?? {};
}

/**
 * Get escrow data for a specific user and debt pool
 */
export function getEscrowData(userAddress: string, debtPoolAddress: string): EscrowData | undefined {
  const userMappings = getEscrowMappings(userAddress);
  return userMappings[debtPoolAddress];
}

/**
 * Store a new escrow mapping for a user
 */
export function setEscrowData(userAddress: string, debtPoolAddress: string, escrowAddress: string, secretKey: string, instance: string): void {
  if (typeof window === 'undefined') return;

  try {
    const allMappings = getAllEscrowMappings();
    if (!allMappings[userAddress]) {
      allMappings[userAddress] = {};
    }
    allMappings[userAddress][debtPoolAddress] = { escrowAddress, secretKey, instance };
    localStorage.setItem(ESCROW_STORAGE_KEY, JSON.stringify(allMappings));
    console.log('[escrowStorage] Stored escrow mapping:', { userAddress, debtPoolAddress, escrowAddress });
  } catch (error) {
    console.error('[escrowStorage] Error storing escrow mapping:', error);
    throw error;
  }
}

/**
 * Remove an escrow mapping for a user (for testing/cleanup)
 */
export function removeEscrowAddress(userAddress: string, debtPoolAddress: string): void {
  if (typeof window === 'undefined') return;

  try {
    const allMappings = getAllEscrowMappings();
    if (allMappings[userAddress]) {
      delete allMappings[userAddress][debtPoolAddress];
      // Clean up empty user entries
      if (Object.keys(allMappings[userAddress]).length === 0) {
        delete allMappings[userAddress];
      }
      localStorage.setItem(ESCROW_STORAGE_KEY, JSON.stringify(allMappings));
    }
    console.log('[escrowStorage] Removed escrow mapping for:', { userAddress, debtPoolAddress });
  } catch (error) {
    console.error('[escrowStorage] Error removing escrow mapping:', error);
  }
}

/**
 * Clear all escrow mappings for a specific user (for testing/cleanup)
 */
export function clearUserEscrowMappings(userAddress: string): void {
  if (typeof window === 'undefined') return;

  try {
    const allMappings = getAllEscrowMappings();
    delete allMappings[userAddress];
    localStorage.setItem(ESCROW_STORAGE_KEY, JSON.stringify(allMappings));
    console.log('[escrowStorage] Cleared escrow mappings for user:', userAddress);
  } catch (error) {
    console.error('[escrowStorage] Error clearing user escrow mappings:', error);
  }
}

/**
 * Clear all escrow mappings (for testing/cleanup)
 */
export function clearAllEscrowMappings(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(ESCROW_STORAGE_KEY);
    console.log('[escrowStorage] Cleared all escrow mappings');
  } catch (error) {
    console.error('[escrowStorage] Error clearing escrow mappings:', error);
  }
}
