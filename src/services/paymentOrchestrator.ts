import { v4 as uuidv4 } from 'uuid';
import { Database } from '../database/database.js';
import { FeeEngine } from './feeEngine.js';
import { ExchangeRateService } from './exchangeRateService.js';
import { temporalClient } from '../temporal/client.js';
import type { PaymentWorkflowInput } from '../temporal/workflows/paymentWorkflow.js';
import {
  Payment,
  PaymentStatus,
  CreatePaymentRequest,
  PaymentResponse,
  WebhookEventType
} from '../types/payment.js';

export class PaymentOrchestrator {
  private db: Database;
  private feeEngine: FeeEngine;
  private exchangeRateService: ExchangeRateService;

  constructor() {
    this.db = Database.getInstance();
    this.feeEngine = new FeeEngine();
    this.exchangeRateService = new ExchangeRateService();
  }

  /**
   * Create a new cross-border payment using Temporal workflow
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

    // Get current exchange rate for initial calculation
    const exchangeRate = await this.exchangeRateService.getExchangeRate(
      request.source_currency,
      request.destination_currency
    );

    // Calculate amounts and fees for initial response
    const destinationAmount = request.source_amount * exchangeRate;
    const feeCalculation = await this.feeEngine.calculateFees(
      request.destination_currency,
      destinationAmount
    );

    // Calculate total amount (source amount + fees converted back to source currency)
    const feeInSourceCurrency = feeCalculation.total_fee / exchangeRate;
    const totalAmount = request.source_amount + feeInSourceCurrency;

    // Create payment record with PENDING status
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

    // Start Temporal workflow for payment processing
    const workflowInput: PaymentWorkflowInput = {
      paymentId,
      userId: request.user_id,
      idempotencyKey: request.idempotency_key,
      sourceAmount: request.source_amount,
      sourceCurrency: request.source_currency,
      destinationCurrency: request.destination_currency,
      webhookUrl: request.webhook_url
    };

    try {
      await temporalClient.startPaymentWorkflow(workflowInput);
      console.log(`Started Temporal workflow for payment ${paymentId}`);
    } catch (error) {
      console.error(`Failed to start Temporal workflow for payment ${paymentId}:`, error);
      // Update payment status to failed
      await this.updatePaymentStatus(paymentId, PaymentStatus.FAILED);
      throw new Error('Failed to start payment processing');
    }

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
   * Get workflow status for a payment
   */
  async getWorkflowStatus(paymentId: string): Promise<any> {
    const workflowId = `payment-${paymentId}`;
    try {
      return await temporalClient.getWorkflowStatus(workflowId);
    } catch (error) {
      console.error(`Failed to get workflow status for ${workflowId}:`, error);
      return null;
    }
  }

  /**
   * Cancel payment workflow
   */
  async cancelPayment(paymentId: string): Promise<boolean> {
    const payment = await this.getPaymentById(paymentId);
    
    if (!payment || payment.status === PaymentStatus.COMPLETED || payment.status === PaymentStatus.FAILED) {
      return false;
    }

    try {
      const workflowId = `payment-${paymentId}`;
      await temporalClient.cancelWorkflow(workflowId);
      await this.updatePaymentStatus(paymentId, PaymentStatus.CANCELLED);
      return true;
    } catch (error) {
      console.error(`Failed to cancel workflow for payment ${paymentId}:`, error);
      return false;
    }
  }

  /**
   * Update payment status
   */
  private async updatePaymentStatus(paymentId: string, status: PaymentStatus): Promise<void> {
    await this.db.run(
      'UPDATE payments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, paymentId]
    );
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