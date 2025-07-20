import { v4 as uuidv4 } from 'uuid';
import { Database } from '../database/database.js';
import { Transaction, TransactionType, TransactionStatus, OfframpTransactionRequest, OfframpTransactionResponse } from '../types/payment.js';

export interface OfframpRequest {
  payment_id: string;
  amount: number;
  source_currency: string; // Usually USDC, USDT, etc.
  destination_currency: string;
  exchange_rate: number;
  user_id: string;
  recipient_details: {
    account_number?: string;
    routing_number?: string;
    iban?: string;
    swift_code?: string;
    name: string;
    address?: string;
    bank_name?: string;
    country: string;
  };
}

export interface OfframpResponse {
  transaction_id: string;
  external_reference: string;
  status: TransactionStatus;
  amount: number;
  destination_currency: string;
  provider: string;
  processing_time_estimate?: string;
  tracking_info?: {
    network?: string;
    confirmation_blocks?: number;
    estimated_arrival?: string;
  };
  metadata?: Record<string, any>;
}

export interface OfframpProviderInfo {
  provider: string;
  name: string;
  description: string;
  supported_currencies: string[];
  processing_time: string;
  limits: { min: number; max: number };
  success_rate: number;
  fees?: {
    percentage?: number;
    fixed?: number;
    currency: string;
  };
  features?: string[];
}

export class OfframpService {
  private db: Database;
  private providers: OfframpProviderInfo[] = [
    {
      provider: 'local_bank_network',
      name: 'Local Bank Network',
      description: 'Direct bank transfers within local networks',
      supported_currencies: ['EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'NOK', 'SEK'],
      processing_time: '1-2 business days',
      limits: { min: 10, max: 50000 },
      success_rate: 0.99,
      fees: { percentage: 0.5, fixed: 2, currency: 'USD' },
      features: ['local_network', 'low_fees', 'fast_settlement']
    },
    {
      provider: 'swift_wire',
      name: 'SWIFT Wire Transfer',
      description: 'International wire transfers',
      supported_currencies: ['EUR', 'GBP', 'USD', 'CHF'],
      processing_time: '2-3 business days',
      limits: { min: 1000, max: 1000000 },
      success_rate: 0.98,
      fees: { percentage: 0.1, fixed: 25, currency: 'USD' },
      features: ['global_reach', 'high_limits', 'secure_transfer']
    },
    {
      provider: 'digital_wallet',
      name: 'Digital Wallet',
      description: 'Mobile and digital wallet payouts',
      supported_currencies: ['INR', 'MXN', 'BRL'],
      processing_time: 'Instant to 24 hours',
      limits: { min: 1, max: 10000 },
      success_rate: 0.97,
      fees: { percentage: 1.5, fixed: 0.5, currency: 'USD' },
      features: ['instant_payout', 'mobile_friendly', 'low_limits']
    },
    {
      provider: 'neobank_partner',
      name: 'Neobank Partner',
      description: 'Modern banking solutions',
      supported_currencies: ['EUR', 'GBP', 'BRL'],
      processing_time: 'Same day',
      limits: { min: 10, max: 100000 },
      success_rate: 0.99,
      fees: { percentage: 0.3, fixed: 1, currency: 'USD' },
      features: ['modern_ui', 'instant_settlement', 'api_integration']
    },
    {
      provider: 'instant_payout',
      name: 'Instant Payout',
      description: 'Real-time payment processing',
      supported_currencies: ['EUR', 'GBP', 'USD'],
      processing_time: 'Instant',
      limits: { min: 1, max: 25000 },
      success_rate: 0.96,
      fees: { percentage: 1.0, fixed: 0.25, currency: 'USD' },
      features: ['instant_settlement', '24_7_availability', 'real_time_tracking']
    },
    {
      provider: 'crypto_payout',
      name: 'Crypto Payout',
      description: 'Cryptocurrency payouts',
      supported_currencies: ['BTC', 'ETH', 'USDC', 'USDT'],
      processing_time: '5-30 minutes',
      limits: { min: 10, max: 100000 },
      success_rate: 0.94,
      fees: { percentage: 0.5, fixed: 0, currency: 'USD' },
      features: ['crypto_support', 'global_access', 'low_fees']
    }
  ];

  constructor() {
    this.db = Database.getInstance();
  }

  /**
   * Process stablecoin to local currency payout
   */
  async processLocalCurrencyPayout(request: OfframpRequest): Promise<OfframpResponse> {
    // Validate request
    this.validateRequest(request);
    
    // Select appropriate provider based on destination currency and amount
    const provider = this.selectProvider(request);
    
    // Validate amount against provider limits
    this.validateAmount(request.amount * request.exchange_rate, provider);
    
    // Generate external reference
    const externalReference = this.generateExternalReference(provider.provider, request.destination_currency);
    
    // Calculate fees
    const fees = this.calculateFees(request.amount * request.exchange_rate, provider);
    
    // Create transaction record
    const transactionId = uuidv4();
    const destinationAmount = request.amount * request.exchange_rate;
    
    const metadata = {
      provider: provider.provider,
      recipient_details: request.recipient_details,
      source_currency: request.source_currency,
      exchange_rate: request.exchange_rate,
      fees,
      created_at: new Date().toISOString(),
      estimated_completion: this.getEstimatedCompletion(provider.provider, request.destination_currency),
      success_rate: provider.success_rate,
      features: provider.features
    };

    await this.db.run(
      `INSERT INTO transactions 
       (id, payment_id, type, amount, currency, status, external_reference, provider, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        transactionId,
        request.payment_id,
        TransactionType.OFFRAMP,
        destinationAmount,
        request.destination_currency,
        TransactionStatus.PROCESSING,
        externalReference,
        provider.provider,
        JSON.stringify(metadata)
      ]
    );

    // Simulate async processing
    this.simulateAsyncProcessing(transactionId, provider, request.destination_currency);

    const trackingInfo = this.getTrackingInfo(provider.provider, request.destination_currency);

    return {
      transaction_id: transactionId,
      external_reference: externalReference,
      status: TransactionStatus.PROCESSING,
      amount: Math.round(destinationAmount * 100) / 100,
      destination_currency: request.destination_currency,
      provider: provider.provider,
      processing_time_estimate: this.getEstimatedCompletion(provider.provider, request.destination_currency),
      tracking_info: trackingInfo,
      metadata
    };
  }

  /**
   * Get transaction status
   */
  async getTransactionStatus(transactionId: string): Promise<OfframpTransactionResponse | undefined> {
    const transaction = await this.db.get<Transaction>(
      'SELECT * FROM transactions WHERE id = ?',
      [transactionId]
    );

    if (!transaction) {
      return undefined;
    }

    let metadata: any = {};
    if (transaction.metadata) {
      try {
        metadata = JSON.parse(transaction.metadata as unknown as string);
      } catch (error) {
        // Keep original if parsing fails
      }
    }

    const provider = this.getProvider(transaction.provider || '');

    return {
      id: transaction.id,
      status: transaction.status,
      amount: transaction.amount,
      source_currency: metadata.source_currency || 'USDC',
      destination_currency: transaction.currency,
      provider: transaction.provider || '',
      provider_name: provider?.name || 'Unknown',
      estimated_completion: metadata.estimated_completion || 'Unknown',
      external_reference: transaction.external_reference,
      created_at: transaction.created_at
    };
  }

  /**
   * Cancel a transaction (if still processing)
   */
  async cancelTransaction(transactionId: string): Promise<boolean> {
    const transaction = await this.getTransactionStatus(transactionId);
    
    if (!transaction || transaction.status !== TransactionStatus.PROCESSING) {
      return false;
    }

    await this.db.run(
      'UPDATE transactions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [TransactionStatus.FAILED, transactionId]
    );

    return true;
  }

  /**
   * Get all available providers
   */
  getProviders(): OfframpProviderInfo[] {
    return this.providers;
  }

  /**
   * Get provider by name
   */
  getProvider(providerName: string): OfframpProviderInfo | undefined {
    return this.providers.find(p => p.provider === providerName);
  }

  /**
   * Create a new offramp transaction
   */
  async createTransaction(request: OfframpTransactionRequest): Promise<OfframpTransactionResponse> {
    // Validate request
    if (!request.amount || request.amount <= 0) {
      throw new Error('Amount must be positive');
    }
    if (!request.source_currency || !request.destination_currency) {
      throw new Error('Source and destination currencies are required');
    }
    if (!request.provider || !request.user_id) {
      throw new Error('Provider and user_id are required');
    }

    // Get provider info
    const provider = this.getProvider(request.provider);
    if (!provider) {
      throw new Error(`Provider ${request.provider} not found`);
    }

    // Validate amount against provider limits
    this.validateAmount(request.amount, provider);

    // Generate transaction ID and external reference
    const transactionId = uuidv4();
    const externalReference = this.generateExternalReference(provider.provider, request.destination_currency);

    // Create transaction record
    const metadata = {
      provider: provider.provider,
      source_currency: request.source_currency,
      destination_currency: request.destination_currency,
      user_id: request.user_id,
      idempotency_key: request.idempotency_key,
      created_at: new Date().toISOString(),
      estimated_completion: this.getEstimatedCompletion(provider.provider, request.destination_currency),
      success_rate: provider.success_rate
    };

    await this.db.run(
      `INSERT INTO transactions 
       (id, payment_id, type, amount, currency, status, external_reference, provider, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        transactionId,
        null, // No payment_id for direct offramp transactions
        TransactionType.OFFRAMP,
        request.amount,
        request.destination_currency,
        TransactionStatus.PROCESSING,
        externalReference,
        provider.provider,
        JSON.stringify(metadata)
      ]
    );

    // Simulate async processing
    this.simulateAsyncProcessing(transactionId, provider, request.destination_currency);

    return {
      id: transactionId,
      status: TransactionStatus.PROCESSING,
      amount: request.amount,
      source_currency: request.source_currency,
      destination_currency: request.destination_currency,
      provider: provider.provider,
      provider_name: provider.name,
      estimated_completion: this.getEstimatedCompletion(provider.provider, request.destination_currency),
      external_reference: externalReference,
      created_at: new Date().toISOString()
    };
  }

  /**
   * Validate request parameters
   */
  private validateRequest(request: OfframpRequest): void {
    if (request.amount <= 0) {
      throw new Error('Amount must be positive');
    }
    
    if (!request.recipient_details.name) {
      throw new Error('Recipient name is required');
    }
    
    if (!request.recipient_details.country) {
      throw new Error('Recipient country is required');
    }
    
    if (request.exchange_rate <= 0) {
      throw new Error('Exchange rate must be positive');
    }
  }

  /**
   * Validate amount against provider limits
   */
  private validateAmount(amount: number, provider: OfframpProviderInfo): void {
    if (amount < provider.limits.min) {
      throw new Error(`Amount must be at least ${provider.limits.min} for ${provider.name}`);
    }
    
    if (amount > provider.limits.max) {
      throw new Error(`Amount cannot exceed ${provider.limits.max} for ${provider.name}`);
    }
  }

  /**
   * Select appropriate provider based on destination and amount
   */
  private selectProvider(request: OfframpRequest): OfframpProviderInfo {
    const { destination_currency, amount } = request;
    const destinationAmount = amount * request.exchange_rate;
    
    // Filter providers that support the destination currency
    const availableProviders = this.providers.filter(p => 
      p.supported_currencies.includes(destination_currency)
    );
    
    if (availableProviders.length === 0) {
      throw new Error(`No providers available for currency: ${destination_currency}`);
    }
    
    // Find providers that can handle the amount
    const suitableProviders = availableProviders.filter(p => 
      destinationAmount >= p.limits.min && destinationAmount <= p.limits.max
    );
    
    if (suitableProviders.length === 0) {
      throw new Error(`No providers can handle amount ${destinationAmount} for currency ${destination_currency}`);
    }
    
    // Select the best provider based on success rate and processing time
    return suitableProviders.reduce((best, current) => {
      if (current.success_rate > best.success_rate) {
        return current;
      }
      if (current.success_rate === best.success_rate) {
        // Prefer faster processing
        const currentTime = this.parseProcessingTime(current.processing_time);
        const bestTime = this.parseProcessingTime(best.processing_time);
        return currentTime < bestTime ? current : best;
      }
      return best;
    });
  }

  /**
   * Calculate fees for the transaction
   */
  private calculateFees(amount: number, provider: OfframpProviderInfo): { amount: number; currency: string; breakdown: any } {
    if (!provider.fees) {
      return { amount: 0, currency: 'USD', breakdown: {} };
    }
    
    const { percentage = 0, fixed = 0 } = provider.fees;
    const percentageFee = amount * percentage;
    const totalFee = percentageFee + fixed;
    
    return {
      amount: Math.round(totalFee * 100) / 100,
      currency: provider.fees.currency,
      breakdown: {
        percentage_fee: percentageFee,
        fixed_fee: fixed,
        percentage_rate: percentage
      }
    };
  }

  /**
   * Parse processing time string to minutes
   */
  private parseProcessingTime(timeString: string): number {
    if (timeString.includes('Instant')) return 0;
    if (timeString.includes('Same day')) return 480; // 8 hours
    if (timeString.includes('1-2 business days')) return 1440; // 24 hours
    if (timeString.includes('2-3 business days')) return 2880; // 48 hours
    if (timeString.includes('5-30 minutes')) return 30;
    if (timeString.includes('24 hours')) return 1440;
    return 1440; // Default to 24 hours
  }

  /**
   * Generate mock external reference
   */
  private generateExternalReference(provider: string, currency: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    
    switch (provider) {
      case 'local_bank_network':
        return `LBN${currency}${timestamp}${random}`;
      case 'swift_wire':
        return `SW${timestamp}${random}`;
      case 'digital_wallet':
        return `DW_${currency}_${random}_${timestamp}`;
      case 'neobank_partner':
        return `NEO_${currency}_${timestamp}_${random}`;
      case 'instant_payout':
        return `IP_${currency}_${timestamp}_${random}`;
      case 'crypto_payout':
        return `CP_${currency}_${timestamp}_${random}`;
      default:
        return `OFF${timestamp}_${random}`;
    }
  }

  /**
   * Get estimated completion time based on provider and currency
   */
  private getEstimatedCompletion(provider: string, currency: string): string {
    const now = new Date();
    let estimatedMinutes: number;

    switch (provider) {
      case 'local_bank_network':
        estimatedMinutes = this.getLocalBankingHours(currency) * 60;
        break;
      case 'swift_wire':
        estimatedMinutes = 2880; // 48 hours
        break;
      case 'digital_wallet':
        estimatedMinutes = 60; // 1 hour
        break;
      case 'neobank_partner':
        estimatedMinutes = 480; // 8 hours
        break;
      case 'instant_payout':
        estimatedMinutes = 5; // 5 minutes
        break;
      case 'crypto_payout':
        estimatedMinutes = 30; // 30 minutes
        break;
      default:
        estimatedMinutes = 1440; // 24 hours
    }

    const estimatedTime = new Date(now.getTime() + estimatedMinutes * 60000);
    return estimatedTime.toISOString();
  }

  /**
   * Get local banking hours for different currencies
   */
  private getLocalBankingHours(currency: string): number {
    switch (currency) {
      case 'EUR':
      case 'GBP':
      case 'CHF':
        return 24; // Next business day
      case 'JPY':
        return 48; // 2 business days
      case 'CAD':
      case 'AUD':
        return 24;
      case 'NOK':
      case 'SEK':
        return 24;
      default:
        return 24;
    }
  }

  /**
   * Get tracking information for the provider
   */
  private getTrackingInfo(provider: string, currency: string): any {
    switch (provider) {
      case 'local_bank_network':
        return {
          network: this.getLocalNetwork(currency),
          confirmation_blocks: 1,
          estimated_arrival: this.getEstimatedCompletion(provider, currency)
        };
      case 'swift_wire':
        return {
          network: 'SWIFT',
          confirmation_blocks: 1,
          estimated_arrival: this.getEstimatedCompletion(provider, currency)
        };
      case 'digital_wallet':
        return {
          network: this.getDigitalWalletNetwork(currency),
          confirmation_blocks: 1,
          estimated_arrival: this.getEstimatedCompletion(provider, currency)
        };
      case 'neobank_partner':
        return {
          network: 'Neobank API',
          confirmation_blocks: 1,
          estimated_arrival: this.getEstimatedCompletion(provider, currency)
        };
      case 'instant_payout':
        return {
          network: 'Instant Network',
          confirmation_blocks: 1,
          estimated_arrival: this.getEstimatedCompletion(provider, currency)
        };
      case 'crypto_payout':
        return {
          network: 'Blockchain',
          confirmation_blocks: 6,
          estimated_arrival: this.getEstimatedCompletion(provider, currency)
        };
      default:
        return {
          network: 'Unknown',
          confirmation_blocks: 1,
          estimated_arrival: this.getEstimatedCompletion(provider, currency)
        };
    }
  }

  /**
   * Get local network name for currency
   */
  private getLocalNetwork(currency: string): string {
    switch (currency) {
      case 'EUR':
        return 'SEPA';
      case 'GBP':
        return 'BACS/FPS';
      case 'JPY':
        return 'Zengin';
      case 'CAD':
        return 'Interac';
      case 'AUD':
        return 'NPP';
      default:
        return 'Local Network';
    }
  }

  /**
   * Get digital wallet network for currency
   */
  private getDigitalWalletNetwork(currency: string): string {
    switch (currency) {
      case 'INR':
        return 'UPI';
      case 'MXN':
        return 'SPEI';
      case 'BRL':
        return 'PIX';
      default:
        return 'Digital Wallet';
    }
  }

  /**
   * Simulate async processing with realistic delays
   */
  private simulateAsyncProcessing(transactionId: string, provider: OfframpProviderInfo, currency: string): void {
    const delay = this.getProcessingDelay(provider.provider);
    
    setTimeout(async () => {
      // Use provider's success rate for realistic simulation
      const isSuccess = Math.random() < provider.success_rate;
      const status = isSuccess ? TransactionStatus.COMPLETED : TransactionStatus.FAILED;
      
      try {
        await this.db.run(
          'UPDATE transactions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [status, transactionId]
        );
        
        console.log(`Offramp transaction ${transactionId} ${status} via ${provider.name} (${provider.provider}) for ${currency}`);
      } catch (error) {
        console.error(`Failed to update transaction ${transactionId}:`, error);
      }
    }, delay);
  }

  /**
   * Get processing delay for simulation
   */
  private getProcessingDelay(provider: string): number {
    switch (provider) {
      case 'local_bank_network':
        return 30000; // 30 seconds
      case 'swift_wire':
        return 60000; // 1 minute
      case 'digital_wallet':
        return 15000; // 15 seconds
      case 'crypto_exchange':
        return 20000; // 20 seconds
      case 'neobank_partner':
        return 25000; // 25 seconds
      default:
        return 30000; // 30 seconds
    }
  }

  /**
   * Get provider success rate
   */
  private getProviderSuccessRate(provider: string): number {
    const providerInfo = this.getProvider(provider);
    return providerInfo?.success_rate || 0.95;
  }

  /**
   * Get supported currencies for a provider
   */
  getSupportedCurrencies(provider: string): string[] {
    const providerInfo = this.getProvider(provider);
    return providerInfo?.supported_currencies || [];
  }

  /**
   * Get provider limits
   */
  getProviderLimits(provider: string, currency: string): { min: number; max: number } {
    const providerInfo = this.getProvider(provider);
    if (!providerInfo || !providerInfo.supported_currencies.includes(currency)) {
      return { min: 0, max: 0 };
    }
    return providerInfo.limits;
  }
} 