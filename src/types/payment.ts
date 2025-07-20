export interface Payment {
  id: string;
  user_id: string;
  idempotency_key: string;
  source_amount: number;
  source_currency: string;
  destination_amount: number;
  destination_currency: string;
  exchange_rate: number;
  status: PaymentStatus;
  onramp_reference?: string;
  offramp_reference?: string;
  fee_amount: number;
  total_amount: number;
  created_at: string;
  updated_at: string;
}

export enum PaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  ONRAMP_COMPLETE = 'onramp_complete',
  OFFRAMP_PROCESSING = 'offramp_processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export interface CreatePaymentRequest {
  user_id: string;
  idempotency_key: string;
  source_amount: number;
  source_currency: string;
  destination_currency: string;
  webhook_url?: string;
}

export interface PaymentResponse {
  id: string;
  status: PaymentStatus;
  source_amount: number;
  source_currency: string;
  destination_amount: number;
  destination_currency: string;
  exchange_rate: number;
  fee_amount: number;
  total_amount: number;
  estimated_completion: string;
  created_at: string;
}

export interface FeeConfig {
  id: number;
  currency: string;
  base_fee: number;
  percentage_fee: number;
  minimum_fee: number;
  maximum_fee?: number;
  created_at: string;
}

export interface FeeCalculation {
  base_fee: number;
  percentage_fee: number;
  total_fee: number;
  currency: string;
}

export interface Transaction {
  id: string;
  payment_id: string;
  type: TransactionType;
  amount: number;
  currency: string;
  status: TransactionStatus;
  external_reference?: string;
  provider?: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export enum TransactionType {
  ONRAMP = 'onramp',
  OFFRAMP = 'offramp',
  FEE = 'fee'
}

export enum TransactionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export interface Webhook {
  id: string;
  payment_id: string;
  event_type: WebhookEventType;
  status: WebhookStatus;
  payload: Record<string, any>;
  response?: Record<string, any>;
  retry_count: number;
  created_at: string;
  sent_at?: string;
}

export enum WebhookEventType {
  PAYMENT_CREATED = 'payment.created',
  PAYMENT_PROCESSING = 'payment.processing',
  PAYMENT_COMPLETED = 'payment.completed',
  PAYMENT_FAILED = 'payment.failed',
  ONRAMP_COMPLETED = 'onramp.completed',
  OFFRAMP_COMPLETED = 'offramp.completed'
}

export enum WebhookStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed'
}

export interface ExchangeRate {
  id: number;
  from_currency: string;
  to_currency: string;
  rate: number;
  provider: string;
  created_at: string;
  expires_at: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
  timestamp: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaymentListResponse {
  payments: PaymentResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    has_more: boolean;
  };
} 

export interface OnrampTransactionRequest {
  amount: number;
  source_currency: string;
  destination_currency: string;
  provider: string;
  user_id: string;
  idempotency_key: string;
}

export interface OfframpTransactionRequest {
  amount: number;
  source_currency: string;
  destination_currency: string;
  provider: string;
  user_id: string;
  idempotency_key: string;
}

export interface OnrampTransactionResponse {
  id: string;
  status: TransactionStatus;
  amount: number;
  source_currency: string;
  destination_currency: string;
  provider: string;
  provider_name: string;
  estimated_completion: string;
  external_reference?: string;
  created_at: string;
}

export interface OfframpTransactionResponse {
  id: string;
  status: TransactionStatus;
  amount: number;
  source_currency: string;
  destination_currency: string;
  provider: string;
  provider_name: string;
  estimated_completion: string;
  external_reference?: string;
  created_at: string;
} 