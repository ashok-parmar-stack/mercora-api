export interface EmailContext {
  user_name?: string;
  first_name?: string;
  email?: string;
  verification_link?: string;
  reset_link?: string;
  otp_code?: string;
  expiry_minutes?: number | string;
  device_name?: string;
  ip_address?: string;
  login_time?: string;
  app_name?: string;
  app_url?: string;
  support_email?: string;
  currency_code?: string;
  currency_symbol?: string;
  formatted_amount?: string;
  year?: string | number;
  [key: string]: any;
}

export interface SendEmailOptions {
  to: string;
  templateCode: string;
  context: EmailContext;
  userId?: string;
  subjectOverride?: string;
}

export interface SendMailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}
