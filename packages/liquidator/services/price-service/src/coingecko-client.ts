import type { Price } from '@liquidator/shared';
import type { Logger } from 'pino';
import Coingecko from '@coingecko/coingecko-typescript';

/**
 * Symbol to CoinGecko ID mapping
 * CoinGecko uses IDs like "zcash" instead of symbols like "ZEC"
 */
const SYMBOL_TO_ID: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  USDC: 'usd-coin',
  USDT: 'tether',
  DAI: 'dai',
  ZEC: 'zcash',
  WETH: 'weth',
  WBTC: 'wrapped-bitcoin',
};

export class CoinGeckoClient {
  private client: Coingecko;
  private logger: Logger;

  constructor(apiKey: string, logger: Logger) {
    this.logger = logger;

    // Initialize with demo or pro API based on key
    const isDemoKey = apiKey.startsWith('CG-');
    this.client = new Coingecko({
      ...(isDemoKey
        ? { demoAPIKey: apiKey, environment: 'demo' }
        : { proAPIKey: apiKey, environment: 'pro' }),
      maxRetries: 3,
    });

    this.logger.info(
      { environment: isDemoKey ? 'demo' : 'pro' },
      'CoinGecko client initialized'
    );
  }

  /**
   * Convert symbol to CoinGecko ID
   */
  private symbolToId(symbol: string): string | undefined {
    return SYMBOL_TO_ID[symbol.toUpperCase()];
  }

  /**
   * Fetch prices for multiple assets
   */
  async fetchPrices(symbols: string[]): Promise<Price[]> {
    this.logger.info({ symbols }, 'Fetching prices from CoinGecko');

    // Convert symbols to CoinGecko IDs
    const idMap = new Map<string, string>();
    const ids: string[] = [];

    for (const symbol of symbols) {
      const id = this.symbolToId(symbol);
      if (id) {
        idMap.set(id, symbol);
        ids.push(id);
      } else {
        this.logger.warn({ symbol }, 'Unknown symbol, no CoinGecko ID mapping');
      }
    }

    if (ids.length === 0) {
      this.logger.warn('No valid symbols to fetch');
      return [];
    }

    try {
      const response = await this.client.simple.price.get({
        ids: ids.join(','),
        vs_currencies: 'usd',
      });

      const prices: Price[] = [];
      const timestamp = Date.now();

      for (const [id, symbol] of idMap) {
        const priceData = response[id];
        if (priceData && typeof priceData.usd === 'number') {
          prices.push({
            asset: symbol,
            price: priceData.usd,
            timestamp,
            source: 'CoinGecko',
          });
          this.logger.debug({ symbol, price: priceData.usd }, 'Price fetched');
        } else {
          this.logger.warn({ symbol, id }, 'No price data returned');
        }
      }

      return prices;
    } catch (error) {
      if (error instanceof Coingecko.APIError) {
        this.logger.error(
          { status: error.status, message: error.message },
          'CoinGecko API error'
        );
      } else {
        this.logger.error({ error }, 'Failed to fetch prices from CoinGecko');
      }
      throw error;
    }
  }

  /**
   * Add a new symbol to ID mapping at runtime
   */
  addSymbolMapping(symbol: string, coingeckoId: string): void {
    SYMBOL_TO_ID[symbol.toUpperCase()] = coingeckoId;
    this.logger.info({ symbol, coingeckoId }, 'Added symbol mapping');
  }

  /**
   * Check if a symbol has a known mapping
   */
  hasSymbolMapping(symbol: string): boolean {
    return !!SYMBOL_TO_ID[symbol.toUpperCase()];
  }
}
