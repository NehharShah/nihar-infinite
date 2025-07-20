import { Database } from '../database/database.js';
import { ExchangeRate } from '../types/payment.js';

export class ExchangeRateService {
  private db: Database;
  private cacheExpiryMinutes: number = 15; // Cache exchange rates for 15 minutes

  // Mock exchange rates (in production, would fetch from external API)
  private mockRates: Record<string, Record<string, number>> = {
    'USD': {
      'EUR': 0.85,
      'GBP': 0.73,
      'CAD': 1.25,
      'AUD': 1.35,
      'JPY': 110.0,
      'INR': 74.5,
      'BRL': 5.2,
      'MXN': 20.1,
      'CHF': 0.92,
      'SEK': 8.7,
      'NOK': 8.9
    }
  };

  constructor() {
    this.db = Database.getInstance();
    this.initializeBaseCurrencies();
  }

  /**
   * Get exchange rate from source to destination currency
   */
  async getExchangeRate(sourceCurrency: string, destinationCurrency: string): Promise<number> {
    // Same currency
    if (sourceCurrency === destinationCurrency) {
      return 1.0;
    }

    // Check cache first
    const cachedRate = await this.getCachedRate(sourceCurrency, destinationCurrency);
    if (cachedRate) {
      return cachedRate.rate;
    }

    // Fetch new rate
    const rate = await this.fetchExchangeRate(sourceCurrency, destinationCurrency);
    
    // Cache the rate
    await this.cacheRate(sourceCurrency, destinationCurrency, rate);
    
    return rate;
  }

  /**
   * Get cached exchange rate if not expired
   */
  private async getCachedRate(
    sourceCurrency: string,
    destinationCurrency: string
  ): Promise<ExchangeRate | undefined> {
    const now = new Date().toISOString();
    
    return await this.db.get<ExchangeRate>(
      `SELECT * FROM exchange_rates 
       WHERE from_currency = ? AND to_currency = ? 
       AND expires_at > ? 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [sourceCurrency, destinationCurrency, now]
    );
  }

  /**
   * Cache exchange rate
   */
  private async cacheRate(
    sourceCurrency: string,
    destinationCurrency: string,
    rate: number
  ): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + this.cacheExpiryMinutes);

    await this.db.run(
      `INSERT OR REPLACE INTO exchange_rates 
       (from_currency, to_currency, rate, provider, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [sourceCurrency, destinationCurrency, rate, 'mock_provider', expiresAt.toISOString()]
    );
  }

  /**
   * Fetch exchange rate (mock implementation)
   */
  private async fetchExchangeRate(sourceCurrency: string, destinationCurrency: string): Promise<number> {
    // Add some random variation to simulate market fluctuations (±2%)
    const baseRate = this.getBaseRate(sourceCurrency, destinationCurrency);
    const variation = 1 + ((Math.random() - 0.5) * 0.04); // ±2% variation
    
    return Math.round(baseRate * variation * 100000) / 100000; // Round to 5 decimal places
  }

  /**
   * Get base exchange rate from mock data
   */
  private getBaseRate(sourceCurrency: string, destinationCurrency: string): number {
    // Direct rate
    if (this.mockRates[sourceCurrency]?.[destinationCurrency]) {
      return this.mockRates[sourceCurrency][destinationCurrency];
    }

    // Inverse rate
    if (this.mockRates[destinationCurrency]?.[sourceCurrency]) {
      return 1 / this.mockRates[destinationCurrency][sourceCurrency];
    }

    // Cross rate via USD
    if (sourceCurrency !== 'USD' && destinationCurrency !== 'USD') {
      const sourceToUSD = this.mockRates[sourceCurrency]?.['USD'] || (1 / this.mockRates['USD']?.[sourceCurrency] || 1);
      const usdToDestination = this.mockRates['USD']?.[destinationCurrency] || (1 / this.mockRates[destinationCurrency]?.['USD'] || 1);
      return sourceToUSD * usdToDestination;
    }

    // Default fallback
    console.warn(`Exchange rate not found for ${sourceCurrency} to ${destinationCurrency}, using 1.0`);
    return 1.0;
  }

  /**
   * Initialize reverse rates for base currencies
   */
  private initializeBaseCurrencies(): void {
    // Add reverse USD rates
    Object.entries(this.mockRates['USD']).forEach(([currency, rate]) => {
      if (!this.mockRates[currency]) {
        this.mockRates[currency] = {};
      }
      this.mockRates[currency]['USD'] = 1 / rate;
    });
  }

  /**
   * Get all supported currencies
   */
  getSupportedCurrencies(): string[] {
    const currencies = new Set<string>();
    
    Object.keys(this.mockRates).forEach(from => {
      currencies.add(from);
      Object.keys(this.mockRates[from]).forEach(to => {
        currencies.add(to);
      });
    });

    return Array.from(currencies).sort();
  }

  /**
   * Get exchange rate with metadata
   */
  async getExchangeRateWithMetadata(
    sourceCurrency: string,
    destinationCurrency: string
  ): Promise<{
    rate: number;
    source_currency: string;
    destination_currency: string;
    timestamp: string;
    provider: string;
    cached: boolean;
    expires_at?: string;
  }> {
    const cachedRate = await this.getCachedRate(sourceCurrency, destinationCurrency);
    
    if (cachedRate) {
      return {
        rate: cachedRate.rate,
        source_currency: sourceCurrency,
        destination_currency: destinationCurrency,
        timestamp: cachedRate.created_at,
        provider: cachedRate.provider,
        cached: true,
        expires_at: cachedRate.expires_at
      };
    }

    const rate = await this.getExchangeRate(sourceCurrency, destinationCurrency);
    
    return {
      rate,
      source_currency: sourceCurrency,
      destination_currency: destinationCurrency,
      timestamp: new Date().toISOString(),
      provider: 'mock_provider',
      cached: false
    };
  }

  /**
   * Get multiple exchange rates at once
   */
  async getMultipleExchangeRates(
    sourceCurrency: string,
    destinationCurrencies: string[]
  ): Promise<Record<string, number>> {
    const rates: Record<string, number> = {};
    
    await Promise.all(
      destinationCurrencies.map(async (destCurrency) => {
        rates[destCurrency] = await this.getExchangeRate(sourceCurrency, destCurrency);
      })
    );

    return rates;
  }

  /**
   * Convert amount from one currency to another
   */
  async convertCurrency(
    amount: number,
    sourceCurrency: string,
    destinationCurrency: string
  ): Promise<{
    source_amount: number;
    source_currency: string;
    destination_amount: number;
    destination_currency: string;
    exchange_rate: number;
    timestamp: string;
  }> {
    const exchangeRate = await this.getExchangeRate(sourceCurrency, destinationCurrency);
    const destinationAmount = amount * exchangeRate;

    return {
      source_amount: amount,
      source_currency: sourceCurrency,
      destination_amount: Math.round(destinationAmount * 100) / 100,
      destination_currency: destinationCurrency,
      exchange_rate: exchangeRate,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get exchange rate history for a currency pair
   */
  async getExchangeRateHistory(
    sourceCurrency: string,
    destinationCurrency: string,
    limit: number = 10
  ): Promise<ExchangeRate[]> {
    return await this.db.all<ExchangeRate>(
      `SELECT * FROM exchange_rates 
       WHERE from_currency = ? AND to_currency = ? 
       ORDER BY created_at DESC 
       LIMIT ?`,
      [sourceCurrency, destinationCurrency, limit]
    );
  }

  /**
   * Clean up expired exchange rates
   */
  async cleanupExpiredRates(): Promise<number> {
    const now = new Date().toISOString();
    
    const result = await this.db.run(
      'DELETE FROM exchange_rates WHERE expires_at < ?',
      [now]
    );

    return result.changes || 0;
  }

  /**
   * Update mock exchange rates (for testing/simulation)
   */
  updateMockRates(newRates: Record<string, Record<string, number>>): void {
    this.mockRates = { ...this.mockRates, ...newRates };
    this.initializeBaseCurrencies();
  }

  /**
   * Get current mock rates
   */
  getMockRates(): Record<string, Record<string, number>> {
    return { ...this.mockRates };
  }

  /**
   * Simulate market volatility by updating rates
   */
  simulateMarketVolatility(): void {
    Object.keys(this.mockRates).forEach(fromCurrency => {
      Object.keys(this.mockRates[fromCurrency]).forEach(toCurrency => {
        const currentRate = this.mockRates[fromCurrency][toCurrency];
        // Apply random volatility (±5%)
        const volatility = 1 + ((Math.random() - 0.5) * 0.1);
        this.mockRates[fromCurrency][toCurrency] = currentRate * volatility;
      });
    });
    
    this.initializeBaseCurrencies();
    console.log('Market volatility simulated - exchange rates updated');
  }

  /**
   * Get best available rate from multiple providers (placeholder for future enhancement)
   */
  async getBestRate(
    sourceCurrency: string,
    destinationCurrency: string,
    providers: string[] = ['mock_provider']
  ): Promise<{
    rate: number;
    provider: string;
    timestamp: string;
  }> {
    // In a real implementation, this would query multiple providers
    // For now, just return the mock rate
    const rate = await this.getExchangeRate(sourceCurrency, destinationCurrency);
    
    return {
      rate,
      provider: 'mock_provider',
      timestamp: new Date().toISOString()
    };
  }
} 