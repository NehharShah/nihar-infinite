import { v4 as uuidv4 } from 'uuid';
import { Database } from '../database/database.js';
import { Transaction, TransactionType, TransactionStatus, OnrampTransactionRequest, OnrampTransactionResponse } from '../types/payment.js';

export interface OnrampRequest {
  payment_id: string;
  amount: number;
  currency: string;
  user_id: string;
  payment_method?: {
    type: 'card' | 'bank_transfer' | 'wire' | 'digital_wallet';
    details?: Record<string, any>;
  };
}

export interface OnrampResponse {
  transaction_id: string;
  external_reference: string;
  status: TransactionStatus;
  amount: number;
  currency: string;
  provider: string;
  processing_time_estimate?: string;
  metadata?: Record<string, any>;
}

export interface ProviderInfo {
  provider: string;
  name: string;
  description: string;
  limits: { min: number; max: number; currency: string };
  processing_time: string;
  payment_methods: string[];
  success_rate: number;
  fees?: {
    percentage?: number;
    fixed?: number;
    currency: string;
  };
}

export class OnrampService {
  private db: Database;
  private providers: ProviderInfo[] = [
    {
      provider: 'stripe',
      name: 'Stripe',
      description: 'Credit card and digital wallet payments',
      limits: { min: 1, max: 10000, currency: 'USD' },
      processing_time: '5 minutes',
      payment_methods: ['card', 'digital_wallet'],
      success_rate: 0.98,
      fees: { percentage: 0.029, fixed: 0.30, currency: 'USD' }
    },
    {
      provider: 'circle',
      name: 'Circle',
      description: 'Stablecoin and bank transfer',
      limits: { min: 100, max: 100000, currency: 'USD' },
      processing_time: '30 minutes',
      payment_methods: ['bank_transfer', 'stablecoin'],
      success_rate: 0.99,
      fees: { percentage: 0.001, fixed: 0, currency: 'USD' }
    },
    {
      provider: 'wire_transfer',
      name: 'Wire Transfer',
      description: 'Large amount wire transfers',
      limits: { min: 50000, max: 1000000, currency: 'USD' },
      processing_time: '24 hours',
      payment_methods: ['wire'],
      success_rate: 0.95,
      fees: { percentage: 0, fixed: 25, currency: 'USD' }
    }
  ];

  constructor() {
    this.db = Database.getInstance();
  }

  /**
   * Process USD collection via mock onramp providers
   */
  async processUSDCollection(request: OnrampRequest): Promise<OnrampResponse> {
    // Validate request
    this.validateRequest(request);
    
    // Select appropriate provider based on amount and payment method
    const provider = this.selectProvider(request);
    
    // Validate amount against provider limits
    this.validateAmount(request.amount, provider);
    
    // Generate external reference (simulating provider's transaction ID)
    const externalReference = this.generateExternalReference(provider.provider);
    
    // Calculate fees
    const fees = this.calculateFees(request.amount, provider);
    
    // Create transaction record
    const transactionId = uuidv4();
    const metadata = {
      provider: provider.provider,
      payment_method: request.payment_method,
      fees,
      created_at: new Date().toISOString(),
      estimated_completion: this.getEstimatedCompletion(provider.provider),
      success_rate: provider.success_rate
    };

    await this.db.run(
      `INSERT INTO transactions 
       (id, payment_id, type, amount, currency, status, external_reference, provider, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        transactionId,
        request.payment_id,
        TransactionType.ONRAMP,
        request.amount,
        request.currency,
        TransactionStatus.PROCESSING,
        externalReference,
        provider.provider,
        JSON.stringify(metadata)
      ]
    );

    // Simulate async processing
    this.simulateAsyncProcessing(transactionId, provider);

    return {
      transaction_id: transactionId,
      external_reference: externalReference,
      status: TransactionStatus.PROCESSING,
      amount: request.amount,
      currency: request.currency,
      provider: provider.provider,
      processing_time_estimate: this.getEstimatedCompletion(provider.provider),
      metadata
    };
  }

  /**
   * Get transaction status
   */
  async getTransactionStatus(transactionId: string): Promise<OnrampTransactionResponse | undefined> {
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
      source_currency: metadata.source_currency || 'USD',
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
  getProviders(): ProviderInfo[] {
    return this.providers;
  }

  /**
   * Get provider by name
   */
  getProvider(providerName: string): ProviderInfo | undefined {
    return this.providers.find(p => p.provider === providerName);
  }

  /**
   * Create a new onramp transaction
   */
  async createTransaction(request: OnrampTransactionRequest): Promise<OnrampTransactionResponse> {
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
    const externalReference = this.generateExternalReference(provider.provider);

    // Create transaction record
    const metadata = {
      provider: provider.provider,
      source_currency: request.source_currency,
      destination_currency: request.destination_currency,
      user_id: request.user_id,
      idempotency_key: request.idempotency_key,
      created_at: new Date().toISOString(),
      estimated_completion: this.getEstimatedCompletion(provider.provider),
      success_rate: provider.success_rate
    };

    await this.db.run(
      `INSERT INTO transactions 
       (id, payment_id, type, amount, currency, status, external_reference, provider, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        transactionId,
        null, // No payment_id for direct onramp transactions
        TransactionType.ONRAMP,
        request.amount,
        request.destination_currency,
        TransactionStatus.PROCESSING,
        externalReference,
        provider.provider,
        JSON.stringify(metadata)
      ]
    );

    // Simulate async processing
    this.simulateAsyncProcessing(transactionId, provider);

    return {
      id: transactionId,
      status: TransactionStatus.PROCESSING,
      amount: request.amount,
      source_currency: request.source_currency,
      destination_currency: request.destination_currency,
      provider: provider.provider,
      provider_name: provider.name,
      estimated_completion: this.getEstimatedCompletion(provider.provider),
      external_reference: externalReference,
      created_at: new Date().toISOString()
    };
  }

  /**
   * Validate request parameters
   */
  private validateRequest(request: OnrampRequest): void {
    if (request.amount <= 0) {
      throw new Error('Amount must be positive');
    }
    
    if (request.currency !== 'USD') {
      throw new Error('Only USD is supported for onramp');
    }
    
    if (request.amount < 1) {
      throw new Error('Minimum amount is $1');
    }
  }

  /**
   * Validate amount against provider limits
   */
  private validateAmount(amount: number, provider: ProviderInfo): void {
    if (amount < provider.limits.min) {
      throw new Error(`Amount must be at least $${provider.limits.min} for ${provider.name}`);
    }
    
    if (amount > provider.limits.max) {
      throw new Error(`Amount cannot exceed $${provider.limits.max} for ${provider.name}`);
    }
  }

  /**
   * Select appropriate provider based on request parameters
   */
  private selectProvider(request: OnrampRequest): ProviderInfo {
    // Filter providers based on payment method if specified
    let availableProviders = this.providers;
    
    if (request.payment_method) {
      availableProviders = this.providers.filter(p => 
        p.payment_methods.includes(request.payment_method!.type)
      );
    }
    
    if (availableProviders.length === 0) {
      throw new Error(`No providers available for payment method: ${request.payment_method?.type}`);
    }
    
    // Select provider based on amount
    for (const provider of availableProviders) {
      if (request.amount >= provider.limits.min && request.amount <= provider.limits.max) {
        return provider;
      }
    }
    
    // If no exact match, find the best fit
    const bestProvider = availableProviders.reduce((best, current) => {
      if (request.amount >= current.limits.min && request.amount <= current.limits.max) {
        return current;
      }
      if (request.amount >= best.limits.min && request.amount <= best.limits.max) {
        return best;
      }
      // Prefer providers with higher limits for large amounts
      return current.limits.max > best.limits.max ? current : best;
    });
    
    return bestProvider;
  }

  /**
   * Calculate fees for the transaction
   */
  private calculateFees(amount: number, provider: ProviderInfo): { amount: number; currency: string; breakdown: any } {
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
   * Generate mock external reference for provider
   */
  private generateExternalReference(provider: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    
    switch (provider) {
      case 'stripe':
        return `pi_${random}${timestamp}`;
      case 'circle':
        return `circle_${random}_${timestamp}`;
      case 'wire_transfer':
        return `wire_${timestamp}_${random}`;
      default:
        return `txn_${random}_${timestamp}`;
    }
  }

  /**
   * Get estimated completion time based on provider
   */
  private getEstimatedCompletion(provider: string): string {
    const now = new Date();
    let estimatedMinutes: number;

    switch (provider) {
      case 'stripe':
        estimatedMinutes = 5; // 5 minutes for card payments
        break;
      case 'circle':
        estimatedMinutes = 30; // 30 minutes for stablecoin
        break;
      case 'wire_transfer':
        estimatedMinutes = 1440; // 24 hours for wire
        break;
      default:
        estimatedMinutes = 15;
    }

    const estimatedTime = new Date(now.getTime() + estimatedMinutes * 60000);
    return estimatedTime.toISOString();
  }

  /**
   * Simulate async processing with realistic delays
   */
  private simulateAsyncProcessing(transactionId: string, provider: ProviderInfo): void {
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
        
        console.log(`Onramp transaction ${transactionId} ${status} via ${provider.name} (${provider.provider})`);
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
      case 'stripe':
        return 5000; // 5 seconds
      case 'circle':
        return 30000; // 30 seconds
      case 'wire_transfer':
        return 60000; // 1 minute
      default:
        return 15000; // 15 seconds
    }
  }

  /**
   * Get supported payment methods for a provider
   */
  getSupportedPaymentMethods(provider: string): string[] {
    const providerInfo = this.getProvider(provider);
    return providerInfo?.payment_methods || [];
  }

  /**
   * Get provider limits
   */
  getProviderLimits(provider: string): { min: number; max: number; currency: string } {
    const providerInfo = this.getProvider(provider);
    return providerInfo?.limits || { min: 0, max: 0, currency: 'USD' };
  }
} 