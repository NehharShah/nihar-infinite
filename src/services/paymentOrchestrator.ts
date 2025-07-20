import { v4 as uuidv4 } from 'uuid';
import { Database } from '../database/database.js';
import { FeeEngine } from './feeEngine.js';
import { OnrampService, OnrampRequest } from './onrampService.js';
import { OfframpService, OfframpRequest } from './offrampService.js';
import { WebhookService } from './webhookService.js';
import { ExchangeRateService } from './exchangeRateService.js';
import {
  Payment,
  PaymentStatus,
  CreatePaymentRequest,
  PaymentResponse,
  WebhookEventType,
  TransactionStatus
} from '../types/payment.js';

export class PaymentOrchestrator {
  private db: Database;
  private feeEngine: FeeEngine;
  private onrampService: OnrampService;
  private offrampService: OfframpService;
  private webhookService: WebhookService;
  private exchangeRateService: ExchangeRateService;

  constructor() {
    this.db = Database.getInstance();
    this.feeEngine = new FeeEngine();
    this.onrampService = new OnrampService();
    this.offrampService = new OfframpService();
    this.webhookService = new WebhookService();
    this.exchangeRateService = new ExchangeRateService();
  }

  /**
   * Create a new cross-border payment
   */
  async createPayment(request: CreatePaymentRequest): Promise<PaymentResponse> {
    // Check for existing payment with same idempotency key
    const existingPayment = await this.getPaymentByIdempotencyKey(request.idempotency_key);
    if (existingPayment) {
      return this.paymentToResponse(existingPayment);
    }

    // Validate currency support
    if (!await this.feeEngine.isCurrencySupported(request.destination_currency)) {
      throw new Error(`Destination currency ${request.destination_currency} is not supported`);
    }

    // Get current exchange rate
    const exchangeRate = await this.exchangeRateService.getExchangeRate(
      request.source_currency,
      request.destination_currency
    );

    // Calculate amounts and fees
    const destinationAmount = request.source_amount * exchangeRate;
    const feeCalculation = await this.feeEngine.calculateFees(
      request.destination_currency,
      destinationAmount
    );

    // Calculate total amount (source amount + fees converted back to source currency)
    const feeInSourceCurrency = feeCalculation.total_fee / exchangeRate;
    const totalAmount = request.source_amount + feeInSourceCurrency;

    // Create payment record
    const paymentId = uuidv4();
    const payment: Omit<Payment, 'created_at' | 'updated_at'> = {
      id: paymentId,
      user_id: request.user_id,
      idempotency_key: request.idempotency_key,
      source_amount: request.source_amount,
      source_currency: request.source_currency,
      destination_amount: Math.round(destinationAmount * 100) / 100,
      destination_currency: request.destination_currency,
      exchange_rate: exchangeRate,
      status: PaymentStatus.PENDING,
      fee_amount: feeCalculation.total_fee,
      total_amount: Math.round(totalAmount * 100) / 100
    };

    await this.db.run(
      `INSERT INTO payments 
       (id, user_id, idempotency_key, source_amount, source_currency, 
        destination_amount, destination_currency, exchange_rate, status, 
        fee_amount, total_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payment.id,
        payment.user_id,
        payment.idempotency_key,
        payment.source_amount,
        payment.source_currency,
        payment.destination_amount,
        payment.destination_currency,
        payment.exchange_rate,
        payment.status,
        payment.fee_amount,
        payment.total_amount
      ]
    );

    // Trigger webhook for payment creation
    if (request.webhook_url) {
      await this.webhookService.scheduleWebhook(
        paymentId,
        WebhookEventType.PAYMENT_CREATED,
        { payment, webhook_url: request.webhook_url }
      );
    }

    // Start payment processing
    this.processPayment(paymentId);

    const createdPayment = await this.getPaymentById(paymentId);
    return this.paymentToResponse(createdPayment!);
  }

  /**
   * Get payment by ID
   */
  async getPaymentById(paymentId: string): Promise<Payment | undefined> {
    return await this.db.get<Payment>(
      'SELECT * FROM payments WHERE id = ?',
      [paymentId]
    );
  }

  /**
   * Get payment by idempotency key
   */
  async getPaymentByIdempotencyKey(idempotencyKey: string): Promise<Payment | undefined> {
    return await this.db.get<Payment>(
      'SELECT * FROM payments WHERE idempotency_key = ?',
      [idempotencyKey]
    );
  }

  /**
   * Get payments for a user with pagination
   */
  async getUserPayments(
    userId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{ payments: PaymentResponse[]; total: number; hasMore: boolean }> {
    const offset = (page - 1) * limit;
    
    const payments = await this.db.all<Payment>(
      `SELECT * FROM payments 
       WHERE user_id = ? 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [userId, limit + 1, offset]
    );

    const hasMore = payments.length > limit;
    const resultPayments = hasMore ? payments.slice(0, -1) : payments;

    const totalResult = await this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM payments WHERE user_id = ?',
      [userId]
    );

    return {
      payments: resultPayments.map(p => this.paymentToResponse(p)),
      total: totalResult?.count || 0,
      hasMore
    };
  }

  /**
   * Process payment through onramp and offramp
   */
  private async processPayment(paymentId: string): Promise<void> {
    try {
      // Update status to processing
      await this.updatePaymentStatus(paymentId, PaymentStatus.PROCESSING);

      const payment = await this.getPaymentById(paymentId);
      if (!payment) {
        throw new Error(`Payment ${paymentId} not found`);
      }

      // Step 1: Process USD collection (onramp)
      const onrampRequest: OnrampRequest = {
        payment_id: paymentId,
        amount: payment.total_amount,
        currency: payment.source_currency,
        user_id: payment.user_id,
        payment_method: {
          type: 'card', // Default for simulation
          details: {}
        }
      };

      const onrampResponse = await this.onrampService.processUSDCollection(onrampRequest);
      
      // Update payment with onramp reference
      await this.db.run(
        'UPDATE payments SET onramp_reference = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [onrampResponse.external_reference, paymentId]
      );

      // Monitor onramp completion
      this.monitorOnrampCompletion(paymentId, onrampResponse.transaction_id);

    } catch (error) {
      console.error(`Payment processing failed for ${paymentId}:`, error);
      await this.updatePaymentStatus(paymentId, PaymentStatus.FAILED);
    }
  }

  /**
   * Monitor onramp completion and trigger offramp
   */
  private async monitorOnrampCompletion(paymentId: string, onrampTransactionId: string): Promise<void> {
    const checkInterval = setInterval(async () => {
      try {
        const onrampTransaction = await this.onrampService.getTransactionStatus(onrampTransactionId);
        
        if (!onrampTransaction) {
          clearInterval(checkInterval);
          await this.updatePaymentStatus(paymentId, PaymentStatus.FAILED);
          return;
        }

        if (onrampTransaction.status === TransactionStatus.COMPLETED) {
          clearInterval(checkInterval);
          await this.updatePaymentStatus(paymentId, PaymentStatus.ONRAMP_COMPLETE);
          
          // Trigger webhook for onramp completion
          await this.webhookService.scheduleWebhook(
            paymentId,
            WebhookEventType.ONRAMP_COMPLETED,
            { transaction: onrampTransaction }
          );

          // Start offramp process
          await this.processOfframp(paymentId);

        } else if (onrampTransaction.status === TransactionStatus.FAILED) {
          clearInterval(checkInterval);
          await this.updatePaymentStatus(paymentId, PaymentStatus.FAILED);
        }
      } catch (error) {
        console.error(`Error monitoring onramp for payment ${paymentId}:`, error);
        clearInterval(checkInterval);
        await this.updatePaymentStatus(paymentId, PaymentStatus.FAILED);
      }
    }, 5000); // Check every 5 seconds

    // Timeout after 30 minutes
    setTimeout(() => {
      clearInterval(checkInterval);
    }, 30 * 60 * 1000);
  }

  /**
   * Process offramp (stablecoin to local currency)
   */
  private async processOfframp(paymentId: string): Promise<void> {
    try {
      await this.updatePaymentStatus(paymentId, PaymentStatus.OFFRAMP_PROCESSING);

      const payment = await this.getPaymentById(paymentId);
      if (!payment) {
        throw new Error(`Payment ${paymentId} not found`);
      }

      // Mock recipient details (in real system, would be provided by user)
      const recipientDetails = {
        name: `User ${payment.user_id}`,
        country: this.getCurrencyCountry(payment.destination_currency),
        account_number: 'MOCK_ACCOUNT_123',
        bank_name: 'Mock Bank'
      };

      const offrampRequest: OfframpRequest = {
        payment_id: paymentId,
        amount: payment.destination_amount,
        source_currency: 'USDC', // Simulating stablecoin
        destination_currency: payment.destination_currency,
        exchange_rate: 1, // Already converted
        user_id: payment.user_id,
        recipient_details: recipientDetails
      };

      const offrampResponse = await this.offrampService.processLocalCurrencyPayout(offrampRequest);
      
      // Update payment with offramp reference
      await this.db.run(
        'UPDATE payments SET offramp_reference = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [offrampResponse.external_reference, paymentId]
      );

      // Monitor offramp completion
      this.monitorOfframpCompletion(paymentId, offrampResponse.transaction_id);

    } catch (error) {
      console.error(`Offramp processing failed for ${paymentId}:`, error);
      await this.updatePaymentStatus(paymentId, PaymentStatus.FAILED);
    }
  }

  /**
   * Monitor offramp completion
   */
  private async monitorOfframpCompletion(paymentId: string, offrampTransactionId: string): Promise<void> {
    const checkInterval = setInterval(async () => {
      try {
        const offrampTransaction = await this.offrampService.getTransactionStatus(offrampTransactionId);
        
        if (!offrampTransaction) {
          clearInterval(checkInterval);
          await this.updatePaymentStatus(paymentId, PaymentStatus.FAILED);
          return;
        }

        if (offrampTransaction.status === TransactionStatus.COMPLETED) {
          clearInterval(checkInterval);
          await this.updatePaymentStatus(paymentId, PaymentStatus.COMPLETED);
          
          // Trigger webhook for completion
          await this.webhookService.scheduleWebhook(
            paymentId,
            WebhookEventType.PAYMENT_COMPLETED,
            { transaction: offrampTransaction }
          );

        } else if (offrampTransaction.status === TransactionStatus.FAILED) {
          clearInterval(checkInterval);
          await this.updatePaymentStatus(paymentId, PaymentStatus.FAILED);
        }
      } catch (error) {
        console.error(`Error monitoring offramp for payment ${paymentId}:`, error);
        clearInterval(checkInterval);
        await this.updatePaymentStatus(paymentId, PaymentStatus.FAILED);
      }
    }, 5000); // Check every 5 seconds

    // Timeout after 2 hours
    setTimeout(() => {
      clearInterval(checkInterval);
    }, 2 * 60 * 60 * 1000);
  }

  /**
   * Update payment status
   */
  private async updatePaymentStatus(paymentId: string, status: PaymentStatus): Promise<void> {
    await this.db.run(
      'UPDATE payments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, paymentId]
    );

    // Trigger status webhook
    await this.webhookService.scheduleWebhook(
      paymentId,
      this.getWebhookEventForStatus(status),
      { status }
    );
  }

  /**
   * Get webhook event type for payment status
   */
  private getWebhookEventForStatus(status: PaymentStatus): WebhookEventType {
    switch (status) {
      case PaymentStatus.PROCESSING:
        return WebhookEventType.PAYMENT_PROCESSING;
      case PaymentStatus.COMPLETED:
        return WebhookEventType.PAYMENT_COMPLETED;
      case PaymentStatus.FAILED:
        return WebhookEventType.PAYMENT_FAILED;
      default:
        return WebhookEventType.PAYMENT_PROCESSING;
    }
  }

  /**
   * Convert payment to response format
   */
  private paymentToResponse(payment: Payment): PaymentResponse {
    const estimatedCompletion = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now

    return {
      id: payment.id,
      status: payment.status,
      source_amount: payment.source_amount,
      source_currency: payment.source_currency,
      destination_amount: payment.destination_amount,
      destination_currency: payment.destination_currency,
      exchange_rate: payment.exchange_rate,
      fee_amount: payment.fee_amount,
      total_amount: payment.total_amount,
      estimated_completion: estimatedCompletion.toISOString(),
      created_at: payment.created_at
    };
  }

  /**
   * Get country for currency (for mock recipient details)
   */
  private getCurrencyCountry(currency: string): string {
    const currencyToCountry: Record<string, string> = {
      'EUR': 'DE',
      'GBP': 'GB',
      'CAD': 'CA',
      'AUD': 'AU',
      'JPY': 'JP',
      'INR': 'IN',
      'BRL': 'BR',
      'MXN': 'MX'
    };

    return currencyToCountry[currency] || 'US';
  }

  /**
   * Cancel payment (if still processing)
   */
  async cancelPayment(paymentId: string): Promise<boolean> {
    const payment = await this.getPaymentById(paymentId);
    
    if (!payment || payment.status === PaymentStatus.COMPLETED || payment.status === PaymentStatus.FAILED) {
      return false;
    }

    await this.updatePaymentStatus(paymentId, PaymentStatus.CANCELLED);
    return true;
  }

  /**
   * Get fee estimate for a potential payment
   */
  async getFeeEstimate(
    sourceAmount: number,
    sourceCurrency: string,
    destinationCurrency: string
  ): Promise<any> {
    const exchangeRate = await this.exchangeRateService.getExchangeRate(
      sourceCurrency,
      destinationCurrency
    );

    return await this.feeEngine.getFeeEstimate(
      sourceAmount,
      sourceCurrency,
      destinationCurrency,
      exchangeRate
    );
  }
} 