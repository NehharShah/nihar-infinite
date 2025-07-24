import { Database } from '../../database/database.js';
import { FeeEngine } from '../../services/feeEngine.js';
import { OnrampService } from '../../services/onrampService.js';
import { OfframpService } from '../../services/offrampService.js';
import { ExchangeRateService } from '../../services/exchangeRateService.js';
import { WebhookService } from '../../services/webhookService.js';
import { PaymentStatus, WebhookEventType, TransactionStatus } from '../../types/payment.js';

const db = Database.getInstance();
const feeEngine = new FeeEngine();
const onrampService = new OnrampService();
const offrampService = new OfframpService();
const exchangeRateService = new ExchangeRateService();
const webhookService = new WebhookService();

export interface ValidatePaymentRequestInput {
  paymentId: string;
  userId: string;
  idempotencyKey: string;
  sourceAmount: number;
  sourceCurrency: string;
  destinationCurrency: string;
}

export async function validatePaymentRequest(input: ValidatePaymentRequestInput): Promise<void> {
  const { paymentId, userId, idempotencyKey, sourceAmount, sourceCurrency, destinationCurrency } = input;

  // Check for existing payment with same idempotency key
  const existingPayment = await db.get(
    'SELECT id FROM payments WHERE idempotency_key = ?',
    [idempotencyKey]
  );

  if (existingPayment) {
    throw new Error(`Payment with idempotency key ${idempotencyKey} already exists`);
  }

  // Validate currency support
  if (!await feeEngine.isCurrencySupported(destinationCurrency)) {
    throw new Error(`Destination currency ${destinationCurrency} is not supported`);
  }

  // Validate amount
  if (sourceAmount <= 0) {
    throw new Error('Source amount must be greater than 0');
  }

  // Validate currencies
  if (sourceCurrency === destinationCurrency) {
    throw new Error('Source and destination currencies must be different');
  }
}

export interface CalculateFeesAndExchangeRateInput {
  paymentId: string;
  sourceAmount: number;
  sourceCurrency: string;
  destinationCurrency: string;
}

export interface FeeCalculationResult {
  destinationAmount: number;
  exchangeRate: number;
  feeAmount: number;
  totalAmount: number;
}

export async function calculateFeesAndExchangeRate(input: CalculateFeesAndExchangeRateInput): Promise<FeeCalculationResult> {
  const { paymentId, sourceAmount, sourceCurrency, destinationCurrency } = input;

  // Get current exchange rate
  const exchangeRate = await exchangeRateService.getExchangeRate(
    sourceCurrency,
    destinationCurrency
  );

  // Calculate destination amount
  const destinationAmount = sourceAmount * exchangeRate;

  // Calculate fees
  const feeCalculation = await feeEngine.calculateFees(
    destinationCurrency,
    destinationAmount
  );

  // Calculate total amount (source amount + fees converted back to source currency)
  const feeInSourceCurrency = feeCalculation.total_fee / exchangeRate;
  const totalAmount = sourceAmount + feeInSourceCurrency;

  // Create payment record
  await db.run(
    `INSERT INTO payments 
     (id, user_id, idempotency_key, source_amount, source_currency, 
      destination_amount, destination_currency, exchange_rate, status, 
      fee_amount, total_amount)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      paymentId,
      'user_' + paymentId.split('-')[0], // Mock user ID
      paymentId, // Using payment ID as idempotency key for demo
      sourceAmount,
      sourceCurrency,
      Math.round(destinationAmount * 100) / 100,
      destinationCurrency,
      exchangeRate,
      PaymentStatus.PENDING,
      feeCalculation.total_fee,
      Math.round(totalAmount * 100) / 100
    ]
  );

  return {
    destinationAmount: Math.round(destinationAmount * 100) / 100,
    exchangeRate,
    feeAmount: feeCalculation.total_fee,
    totalAmount: Math.round(totalAmount * 100) / 100
  };
}

export interface ProcessOnrampInput {
  paymentId: string;
  userId: string;
  amount: number;
  currency: string;
}

export interface OnrampResult {
  transactionId: string;
  externalReference: string;
}

export async function processOnramp(input: ProcessOnrampInput): Promise<OnrampResult> {
  const { paymentId, userId, amount, currency } = input;

  const onrampRequest = {
    payment_id: paymentId,
    amount,
    currency,
    user_id: userId,
    payment_method: {
      type: 'card' as const,
      details: {}
    }
  };

  const onrampResponse = await onrampService.processUSDCollection(onrampRequest);

  // Update payment with onramp reference
  await db.run(
    'UPDATE payments SET onramp_reference = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [onrampResponse.external_reference, paymentId]
  );

  return {
    transactionId: onrampResponse.transaction_id,
    externalReference: onrampResponse.external_reference
  };
}

export interface MonitorOnrampStatusInput {
  paymentId: string;
  transactionId: string;
  timeoutMinutes: number;
}

export async function monitorOnrampStatus(input: MonitorOnrampStatusInput): Promise<boolean> {
  const { paymentId, transactionId, timeoutMinutes } = input;
  const startTime = Date.now();
  const timeoutMs = timeoutMinutes * 60 * 1000;

  while (Date.now() - startTime < timeoutMs) {
    const transaction = await onrampService.getTransactionStatus(transactionId);
    
    if (!transaction) {
      throw new Error(`Onramp transaction ${transactionId} not found`);
    }

    if (transaction.status === TransactionStatus.COMPLETED) {
      return true;
    }

    if (transaction.status === TransactionStatus.FAILED) {
      throw new Error(`Onramp transaction ${transactionId} failed`);
    }

    // Wait 5 seconds before next check
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  return false; // Timeout
}

export interface ProcessOfframpInput {
  paymentId: string;
  userId: string;
  amount: number;
  sourceCurrency: string;
  destinationCurrency: string;
  recipientDetails: {
    name: string;
    country: string;
    accountNumber: string;
    bankName: string;
  };
}

export interface OfframpResult {
  transactionId: string;
  externalReference: string;
}

export async function processOfframp(input: ProcessOfframpInput): Promise<OfframpResult> {
  const { paymentId, userId, amount, sourceCurrency, destinationCurrency, recipientDetails } = input;

  const offrampRequest = {
    payment_id: paymentId,
    amount,
    source_currency: sourceCurrency,
    destination_currency: destinationCurrency,
    exchange_rate: 1, // Already converted
    user_id: userId,
    recipient_details: recipientDetails
  };

  const offrampResponse = await offrampService.processLocalCurrencyPayout(offrampRequest);

  // Update payment with offramp reference
  await db.run(
    'UPDATE payments SET offramp_reference = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [offrampResponse.external_reference, paymentId]
  );

  return {
    transactionId: offrampResponse.transaction_id,
    externalReference: offrampResponse.external_reference
  };
}

export interface MonitorOfframpStatusInput {
  paymentId: string;
  transactionId: string;
  timeoutMinutes: number;
}

export async function monitorOfframpStatus(input: MonitorOfframpStatusInput): Promise<boolean> {
  const { paymentId, transactionId, timeoutMinutes } = input;
  const startTime = Date.now();
  const timeoutMs = timeoutMinutes * 60 * 1000;

  while (Date.now() - startTime < timeoutMs) {
    const transaction = await offrampService.getTransactionStatus(transactionId);
    
    if (!transaction) {
      throw new Error(`Offramp transaction ${transactionId} not found`);
    }

    if (transaction.status === TransactionStatus.COMPLETED) {
      return true;
    }

    if (transaction.status === TransactionStatus.FAILED) {
      throw new Error(`Offramp transaction ${transactionId} failed`);
    }

    // Wait 5 seconds before next check
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  return false; // Timeout
}

export async function updatePaymentStatus(paymentId: string, status: PaymentStatus): Promise<void> {
  await db.run(
    'UPDATE payments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [status, paymentId]
  );
}

export async function sendWebhook(
  paymentId: string, 
  eventType: WebhookEventType, 
  payload: any, 
  webhookUrl: string
): Promise<void> {
  // Add webhook URL to payload
  const payloadWithUrl = { ...payload, webhook_url: webhookUrl };
  await webhookService.scheduleWebhook(paymentId, eventType, payloadWithUrl);
}

export interface HandlePaymentFailureInput {
  paymentId: string;
  error: string;
  webhookUrl?: string;
}

export async function handlePaymentFailure(input: HandlePaymentFailureInput): Promise<void> {
  const { paymentId, error, webhookUrl } = input;

  // Update payment status to failed
  await updatePaymentStatus(paymentId, PaymentStatus.FAILED);

  // Send failure webhook if URL provided
  if (webhookUrl) {
    await sendWebhook(paymentId, WebhookEventType.PAYMENT_FAILED, { 
      error,
      status: PaymentStatus.FAILED 
    }, webhookUrl);
  }
}

export async function cleanupPayment(paymentId: string): Promise<void> {
  // Cleanup any temporary resources, logs, etc.
  // This is a placeholder for any cleanup operations
  console.log(`Cleaning up resources for payment ${paymentId}`);
} 