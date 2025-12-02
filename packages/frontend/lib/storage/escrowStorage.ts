/**
 * Local storage utility for managing escrow contract address mappings.
 * Maps debtPool contract addresses to their corresponding escrow contract addresses.
 */

const ESCROW_STORAGE_KEY = 'nocom_escrow_mappings';

export interface EscrowMapping {
  [debtPoolAddress: string]: string; // debtPoolAddress -> escrowAddress
}

/**
 * Get all escrow mappings from local storage
 */
export function getEscrowMappings(): EscrowMapping {
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
 * Get escrow address for a specific debt pool
 */
export function getEscrowAddress(debtPoolAddress: string): string | undefined {
  const mappings = getEscrowMappings();
  return mappings[debtPoolAddress];
}

/**
 * Store a new escrow mapping
 */
export function setEscrowAddress(debtPoolAddress: string, escrowAddress: string): void {
  if (typeof window === 'undefined') return;

  try {
    const mappings = getEscrowMappings();
    mappings[debtPoolAddress] = escrowAddress;
    localStorage.setItem(ESCROW_STORAGE_KEY, JSON.stringify(mappings));
    console.log('[escrowStorage] Stored escrow mapping:', { debtPoolAddress, escrowAddress });
  } catch (error) {
    console.error('[escrowStorage] Error storing escrow mapping:', error);
    throw error;
  }
}

/**
 * Remove an escrow mapping (for testing/cleanup)
 */
export function removeEscrowAddress(debtPoolAddress: string): void {
  if (typeof window === 'undefined') return;

  try {
    const mappings = getEscrowMappings();
    delete mappings[debtPoolAddress];
    localStorage.setItem(ESCROW_STORAGE_KEY, JSON.stringify(mappings));
    console.log('[escrowStorage] Removed escrow mapping for:', debtPoolAddress);
  } catch (error) {
    console.error('[escrowStorage] Error removing escrow mapping:', error);
  }
}

/**
 * Clear all escrow mappings (for testing/cleanup)
 */
export function clearEscrowMappings(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(ESCROW_STORAGE_KEY);
    console.log('[escrowStorage] Cleared all escrow mappings');
  } catch (error) {
    console.error('[escrowStorage] Error clearing escrow mappings:', error);
  }
}
