import { proxyActivities, log, sleep } from '@temporalio/workflow';
import type * as activities from '../activities/paymentActivities.js';
import { PaymentStatus, WebhookEventType } from '../../types/payment.js';

const { 
  validatePaymentRequest,
  calculateFeesAndExchangeRate,
  processOnramp,
  monitorOnrampStatus,
  processOfframp,
  monitorOfframpStatus,
  updatePaymentStatus,
  sendWebhook,
  handlePaymentFailure,
  cleanupPayment
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
});

export interface PaymentWorkflowInput {
  paymentId: string;
  userId: string;
  idempotencyKey: string;
  sourceAmount: number;
  sourceCurrency: string;
  destinationCurrency: string;
  webhookUrl?: string;
}

export interface PaymentWorkflowResult {
  success: boolean;
  paymentId: string;
  status: PaymentStatus;
  error?: string;
}

export async function paymentWorkflow(input: PaymentWorkflowInput): Promise<PaymentWorkflowResult> {
  const { paymentId, userId, idempotencyKey, sourceAmount, sourceCurrency, destinationCurrency, webhookUrl } = input;
  
  try {
    log.info('Starting payment workflow', { paymentId, userId, destinationCurrency });

    // Step 1: Validate payment request
    await validatePaymentRequest({
      paymentId,
      userId,
      idempotencyKey,
      sourceAmount,
      sourceCurrency,
      destinationCurrency
    });

    // Step 2: Calculate fees and exchange rate
    const feeCalculation = await calculateFeesAndExchangeRate({
      paymentId,
      sourceAmount,
      sourceCurrency,
      destinationCurrency
    });

    // Step 3: Update status to processing
    await updatePaymentStatus(paymentId, PaymentStatus.PROCESSING);
    
    if (webhookUrl) {
      await sendWebhook(paymentId, WebhookEventType.PAYMENT_PROCESSING, { status: PaymentStatus.PROCESSING }, webhookUrl);
    }

    // Step 4: Process onramp (USD collection)
    const onrampResult = await processOnramp({
      paymentId,
      userId,
      amount: feeCalculation.totalAmount,
      currency: sourceCurrency
    });

    // Step 5: Monitor onramp completion with timeout
    const onrampCompleted = await monitorOnrampStatus({
      paymentId,
      transactionId: onrampResult.transactionId,
      timeoutMinutes: 30
    });

    if (!onrampCompleted) {
      throw new Error('Onramp processing timed out');
    }

    // Step 6: Update status to onramp complete
    await updatePaymentStatus(paymentId, PaymentStatus.ONRAMP_COMPLETE);
    
    if (webhookUrl) {
      await sendWebhook(paymentId, WebhookEventType.ONRAMP_COMPLETED, { 
        transactionId: onrampResult.transactionId,
        status: PaymentStatus.ONRAMP_COMPLETE 
      }, webhookUrl);
    }

    // Step 7: Process offramp (stablecoin to local currency)
    const offrampResult = await processOfframp({
      paymentId,
      userId,
      amount: feeCalculation.destinationAmount,
      sourceCurrency: 'USDC',
      destinationCurrency,
      recipientDetails: {
        name: `User ${userId}`,
        country: getCurrencyCountry(destinationCurrency),
        accountNumber: 'MOCK_ACCOUNT_123',
        bankName: 'Mock Bank'
      }
    });

    // Step 8: Monitor offramp completion with timeout
    const offrampCompleted = await monitorOfframpStatus({
      paymentId,
      transactionId: offrampResult.transactionId,
      timeoutMinutes: 120
    });

    if (!offrampCompleted) {
      throw new Error('Offramp processing timed out');
    }

    // Step 9: Update status to completed
    await updatePaymentStatus(paymentId, PaymentStatus.COMPLETED);
    
    if (webhookUrl) {
      await sendWebhook(paymentId, WebhookEventType.PAYMENT_COMPLETED, { 
        transactionId: offrampResult.transactionId,
        status: PaymentStatus.COMPLETED 
      }, webhookUrl);
    }

    log.info('Payment workflow completed successfully', { paymentId });

    return {
      success: true,
      paymentId,
      status: PaymentStatus.COMPLETED
    };

  } catch (error) {
    log.error('Payment workflow failed', { paymentId, error: error.message });
    
    // Handle payment failure
    await handlePaymentFailure({
      paymentId,
      error: error.message,
      webhookUrl
    });

    return {
      success: false,
      paymentId,
      status: PaymentStatus.FAILED,
      error: error.message
    };
  } finally {
    // Cleanup any resources
    await cleanupPayment(paymentId);
  }
}

// Helper function to get country for currency
function getCurrencyCountry(currency: string): string {
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