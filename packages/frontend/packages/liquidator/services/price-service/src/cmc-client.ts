import type { Price } from '@liquidator/shared';
import type { Logger } from 'pino';

/**
 * CoinMarketCap API Client (MOCKED for Phase 1-7)
 *
 * This is a mock implementation that simulates fetching prices from CoinMarketCap.
 * In Phase 8, this should be replaced with actual API calls to CoinMarketCap.
 */
export class CoinMarketCapClient {
  private apiKey: string;
  private logger: Logger;
  private mockPrices: Map<string, number>;

  constructor(apiKey: string, logger: Logger) {
    this.apiKey = apiKey;
    this.logger = logger;
    this.mockPrices = new Map();

    // Initialize with some mock base prices
    this.initializeMockPrices();
  }

  /**
   * Initialize mock prices for common assets
   */
  private initializeMockPrices(): void {
    this.mockPrices.set('BTC', 45000);
    this.mockPrices.set('ETH', 2500);
    this.mockPrices.set('USDC', 1.0);
    this.mockPrices.set('USDT', 1.0);
    this.mockPrices.set('DAI', 1.0);
    this.mockPrices.set('WETH', 2500);
    this.mockPrices.set('WBTC', 45000);
  }

  /**
   * Fetch prices for multiple assets
   * MOCK: Returns simulated prices with small random variations
   */
  async fetchPrices(symbols: string[]): Promise<Price[]> {
    this.logger.info({ symbols }, 'Fetching prices (MOCK)');

    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    const prices: Price[] = [];
    const timestamp = Date.now();

    for (const symbol of symbols) {
      let basePrice = this.mockPrices.get(symbol);

      // If we don't have a mock price, generate a random one
      if (!basePrice) {
        basePrice = Math.random() * 1000 + 100;
        this.mockPrices.set(symbol, basePrice);
      }

      // Add small random variation (+/- 2%)
      const variation = (Math.random() - 0.5) * 0.04; // -2% to +2%
      const price = basePrice * (1 + variation);

      // Update base price for next fetch
      this.mockPrices.set(symbol, price);

      prices.push({
        asset: symbol,
        price: parseFloat(price.toFixed(2)),
        timestamp,
        source: 'CoinMarketCap (MOCK)',
      });
    }

    return prices;
  }

  /**
   * Manually set a mock price for testing
   */
  setMockPrice(symbol: string, price: number): void {
    this.mockPrices.set(symbol, price);
    this.logger.debug({ symbol, price }, 'Mock price set');
  }

  /**
   * Trigger a significant price change for testing
   */
  simulatePriceChange(symbol: string, percentageChange: number): void {
    const currentPrice = this.mockPrices.get(symbol) || 100;
    const newPrice = currentPrice * (1 + percentageChange / 100);
    this.mockPrices.set(symbol, newPrice);
    this.logger.info(
      { symbol, oldPrice: currentPrice, newPrice, percentageChange },
      'Simulated price change (MOCK)'
    );
  }
}

/*
 * IMPLEMENTATION NOTE FOR PHASE 8:
 *
 * Replace this mock implementation with actual CoinMarketCap API integration:
 *
 * 1. Use the CMC API endpoint: https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest
 * 2. Include API key in headers: { 'X-CMC_PRO_API_KEY': this.apiKey }
 * 3. Handle rate limiting (free tier: 333 calls/day, ~10k calls/month)
 * 4. Implement retry logic with exponential backoff
 * 5. Handle API errors gracefully
 * 6. Parse the response to extract price data
 *
 * Example real implementation:
 *
 * async fetchPrices(symbols: string[]): Promise<Price[]> {
 *   const response = await fetch(
 *     `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${symbols.join(',')}`,
 *     {
 *       headers: {
 *         'X-CMC_PRO_API_KEY': this.apiKey,
 *         'Accept': 'application/json',
 *       },
 *     }
 *   );
 *
 *   if (!response.ok) {
 *     throw new Error(`CMC API error: ${response.status}`);
 *   }
 *
 *   const data = await response.json();
 *   // Parse and return prices...
 * }
 */
