import { PaymentGateway } from '../subscription.constants';

export interface CreateGatewayOrderInput {
  amountMinor: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface CreateGatewayOrderResult {
  gateway: PaymentGateway | string;
  orderId: string;
  amountMinor: number;
  currency: string;
  receipt?: string;
  status: string;
  rawSanitized: Record<string, unknown>;
}

export interface VerifyCheckoutSignatureInput {
  orderId: string;
  paymentId: string;
  signature: string;
}

export interface GatewayPaymentDetails {
  gateway: PaymentGateway | string;
  paymentId: string;
  orderId?: string | null;
  amountMinor: number;
  amountRefundedMinor: number;
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed' | string;
  method?: string | null;
  methodDetails?: Record<string, unknown> | null;
  errorCode?: string | null;
  errorDescription?: string | null;
  captured: boolean;
  createdAt?: number;
  rawSanitized: Record<string, unknown>;
}

export interface GatewayOrderDetails {
  gateway: PaymentGateway | string;
  orderId: string;
  amountMinor: number;
  amountPaidMinor: number;
  amountDueMinor: number;
  currency: string;
  status: string;
  rawSanitized: Record<string, unknown>;
}

export interface CreateGatewayRefundInput {
  paymentId: string;
  amountMinor: number;
  speed?: 'normal' | 'optimum';
  receipt?: string;
  notes?: Record<string, string>;
}

export interface GatewayRefundResult {
  gateway: PaymentGateway | string;
  refundId: string;
  paymentId: string;
  amountMinor: number;
  currency: string;
  status: 'pending' | 'processed' | 'failed' | string;
  createdAt?: number;
  rawSanitized: Record<string, unknown>;
}

export interface NormalizedWebhookEvent {
  gateway: PaymentGateway | string;
  gatewayEventId: string;
  eventType: string;
  orderId?: string | null;
  paymentId?: string | null;
  refundId?: string | null;
  amountMinor?: number | null;
  currency?: string | null;
  status?: string | null;
  method?: string | null;
  methodDetails?: Record<string, unknown> | null;
  errorCode?: string | null;
  errorDescription?: string | null;
  redactedPayload: Record<string, unknown>;
}

export interface GatewayPublicConfig {
  gateway: PaymentGateway | string;
  enabled: boolean;
  configured: boolean;
  keyId?: string;
  mode: 'test' | 'live' | 'unconfigured';
}

export interface IPaymentGatewayAdapter {
  readonly gatewayCode: PaymentGateway | string;
  isConfigured(): boolean;
  getPublicConfig(): GatewayPublicConfig;
  createOrder(input: CreateGatewayOrderInput): Promise<CreateGatewayOrderResult>;
  verifyCheckoutSignature(input: VerifyCheckoutSignatureInput): boolean;
  verifyWebhookSignature(rawBody: Buffer | string, signature: string): boolean;
  fetchOrder(orderId: string): Promise<GatewayOrderDetails>;
  fetchOrderPayments(orderId: string): Promise<GatewayPaymentDetails[]>;
  fetchPayment(paymentId: string): Promise<GatewayPaymentDetails>;
  createRefund(input: CreateGatewayRefundInput): Promise<GatewayRefundResult>;
  fetchRefund(refundId: string): Promise<GatewayRefundResult>;
  parseWebhookEvent(
    payload: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
  ): NormalizedWebhookEvent;
}
