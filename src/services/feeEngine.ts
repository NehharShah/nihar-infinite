import { Database } from '../database/database.js';
import { FeeConfig, FeeCalculation } from '../types/payment.js';

export class FeeEngine {
  private db: Database;

  constructor() {
    this.db = Database.getInstance();
  }

  /**
   * Calculate fees for a payment based on destination currency and amount
   */
  async calculateFees(
    destinationCurrency: string,
    destinationAmount: number
  ): Promise<FeeCalculation> {
    const feeConfig = await this.getFeeConfig(destinationCurrency);
    
    if (!feeConfig) {
      throw new Error(`Fee configuration not found for currency: ${destinationCurrency}`);
    }

    const baseFee = feeConfig.base_fee;
    const percentageFeeAmount = destinationAmount * feeConfig.percentage_fee;
    const rawTotalFee = baseFee + percentageFeeAmount;

    // Apply minimum and maximum fee constraints
    let totalFee = Math.max(rawTotalFee, feeConfig.minimum_fee);
    
    if (feeConfig.maximum_fee && totalFee > feeConfig.maximum_fee) {
      totalFee = feeConfig.maximum_fee;
    }

    // Round to 2 decimal places
    totalFee = Math.round(totalFee * 100) / 100;

    return {
      base_fee: baseFee,
      percentage_fee: percentageFeeAmount,
      total_fee: totalFee,
      currency: destinationCurrency
    };
  }

  /**
   * Get fee configuration for a specific currency
   */
  async getFeeConfig(currency: string): Promise<FeeConfig | undefined> {
    return await this.db.get<FeeConfig>(
      'SELECT * FROM fee_configs WHERE currency = ? ORDER BY created_at DESC LIMIT 1',
      [currency.toUpperCase()]
    );
  }

  /**
   * Get all supported currencies with their fee configurations
   */
  async getSupportedCurrencies(): Promise<FeeConfig[]> {
    return await this.db.all<FeeConfig>(
      'SELECT * FROM fee_configs ORDER BY currency ASC'
    );
  }

  /**
   * Update fee configuration for a currency
   */
  async updateFeeConfig(
    currency: string,
    baseFee: number,
    percentageFee: number,
    minimumFee: number,
    maximumFee?: number
  ): Promise<void> {
    await this.db.run(
      `INSERT OR REPLACE INTO fee_configs 
       (currency, base_fee, percentage_fee, minimum_fee, maximum_fee) 
       VALUES (?, ?, ?, ?, ?)`,
      [currency.toUpperCase(), baseFee, percentageFee, minimumFee, maximumFee]
    );
  }

  /**
   * Calculate total amount including fees (for display purposes)
   */
  async calculateTotalAmount(
    sourceAmount: number,
    sourceCurrency: string,
    destinationCurrency: string,
    exchangeRate: number
  ): Promise<{ destinationAmount: number; feeAmount: number; totalAmount: number }> {
    const destinationAmount = sourceAmount * exchangeRate;
    const feeCalculation = await this.calculateFees(destinationCurrency, destinationAmount);
    
    return {
      destinationAmount: Math.round(destinationAmount * 100) / 100,
      feeAmount: feeCalculation.total_fee,
      totalAmount: Math.round((sourceAmount + (feeCalculation.total_fee / exchangeRate)) * 100) / 100
    };
  }

  /**
   * Validate if a currency is supported
   */
  async isCurrencySupported(currency: string): Promise<boolean> {
    const config = await this.getFeeConfig(currency);
    return config !== undefined;
  }

  /**
   * Get fee estimate for display purposes
   */
  async getFeeEstimate(
    sourceAmount: number,
    sourceCurrency: string,
    destinationCurrency: string,
    exchangeRate: number
  ): Promise<{
    source_amount: number;
    source_currency: string;
    destination_amount: number;
    destination_currency: string;
    exchange_rate: number;
    fee_breakdown: FeeCalculation;
    total_cost: number;
  }> {
    const destinationAmount = sourceAmount * exchangeRate;
    const feeCalculation = await this.calculateFees(destinationCurrency, destinationAmount);
    
    // Calculate total cost in source currency (including fees converted back)
    const feeInSourceCurrency = feeCalculation.total_fee / exchangeRate;
    const totalCost = sourceAmount + feeInSourceCurrency;

    return {
      source_amount: sourceAmount,
      source_currency: sourceCurrency,
      destination_amount: Math.round(destinationAmount * 100) / 100,
      destination_currency: destinationCurrency,
      exchange_rate: exchangeRate,
      fee_breakdown: feeCalculation,
      total_cost: Math.round(totalCost * 100) / 100
    };
  }
} 