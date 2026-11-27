export interface SystemTemplateSeed {
  code: string;
  name: string;
  subject: string;
  description: string;
  variables: string[];
  body: string;
}

export const SYSTEM_EMAIL_TEMPLATES: SystemTemplateSeed[] = [
  {
    code: 'EMAIL_VERIFICATION',
    name: 'Email Verification',
    subject: 'Verify your email address for {{app_name}}',
    description: 'Sent to newly registered users or upon resend verification request',
    variables: [
      '{{user_name}}',
      '{{verification_link}}',
      '{{otp_code}}',
      '{{expiry_minutes}}',
      '{{app_name}}',
      '{{app_url}}',
      '{{support_email}}',
      '{{currency_symbol}}',
      '{{year}}',
    ],
    body: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f5f7; margin: 0; padding: 0; }
    .wrapper { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
    .header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 36px 30px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }
    .header p { color: #94a3b8; margin: 6px 0 0 0; font-size: 13px; }
    .content { padding: 40px 32px; color: #334155; line-height: 1.6; }
    .greeting { font-size: 18px; font-weight: 600; color: #0f172a; margin-bottom: 16px; }
    .button-wrap { text-align: center; margin: 32px 0; }
    .btn { display: inline-block; background: #2563eb; color: #ffffff !important; font-weight: 600; font-size: 15px; padding: 14px 32px; border-radius: 8px; text-decoration: none; box-shadow: 0 4px 12px rgba(37,99,235,0.25); }
    .otp-box { background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 16px; text-align: center; margin: 24px 0; }
    .otp-code { font-family: 'Courier New', monospace; font-size: 24px; font-weight: 700; color: #0f172a; letter-spacing: 4px; }
    .security-note { font-size: 13px; color: #64748b; background: #f1f5f9; padding: 12px 16px; border-radius: 6px; border-left: 4px solid #3b82f6; margin-top: 24px; }
    .fallback { font-size: 12px; color: #94a3b8; word-break: break-all; margin-top: 24px; }
    .footer { background: #f8fafc; padding: 24px 30px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>{{app_name}}</h1>
      <p>Secure Enterprise B2B Platform</p>
    </div>
    <div class="content">
      <div class="greeting">Welcome, {{user_name}}!</div>
      <p>Thank you for creating an account with <strong>{{app_name}}</strong>. Please confirm your email address to activate your account and access your dashboard.</p>
      
      <div class="button-wrap">
        <a href="{{verification_link}}" class="btn" target="_blank">Verify Email Address</a>
      </div>

      <div class="security-note">
        <strong>Security Notice:</strong> This verification link will expire in <strong>{{expiry_minutes}} minutes</strong>. If you did not register on {{app_name}}, please disregard this message or contact our security team at <a href="mailto:{{support_email}}">{{support_email}}</a>.
      </div>

      <div class="fallback">
        <p>If the button above does not work, copy and paste this link into your browser:</p>
        <p><a href="{{verification_link}}" style="color: #2563eb;">{{verification_link}}</a></p>
      </div>
    </div>
    <div class="footer">
      &copy; {{year}} {{app_name}}. All rights reserved.
    </div>
  </div>
</body>
</html>`,
  },
  {
    code: 'PASSWORD_RESET',
    name: 'Password Reset Request',
    subject: 'Reset your password for {{app_name}}',
    description: 'Sent when a user requests to reset their password',
    variables: [
      '{{user_name}}',
      '{{reset_link}}',
      '{{expiry_minutes}}',
      '{{device_name}}',
      '{{ip_address}}',
      '{{app_name}}',
      '{{support_email}}',
      '{{year}}',
    ],
    body: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f5f7; margin: 0; padding: 0; }
    .wrapper { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
    .header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 36px 30px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }
    .header p { color: #94a3b8; margin: 6px 0 0 0; font-size: 13px; }
    .content { padding: 40px 32px; color: #334155; line-height: 1.6; }
    .greeting { font-size: 18px; font-weight: 600; color: #0f172a; margin-bottom: 16px; }
    .button-wrap { text-align: center; margin: 32px 0; }
    .btn { display: inline-block; background: #ef4444; color: #ffffff !important; font-weight: 600; font-size: 15px; padding: 14px 32px; border-radius: 8px; text-decoration: none; box-shadow: 0 4px 12px rgba(239,68,68,0.25); }
    .meta-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 13px; color: #475569; }
    .meta-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
    .security-note { font-size: 13px; color: #64748b; background: #fef2f2; padding: 12px 16px; border-radius: 6px; border-left: 4px solid #ef4444; margin-top: 24px; }
    .fallback { font-size: 12px; color: #94a3b8; word-break: break-all; margin-top: 24px; }
    .footer { background: #f8fafc; padding: 24px 30px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>{{app_name}}</h1>
      <p>Security & Account Protection</p>
    </div>
    <div class="content">
      <div class="greeting">Hello, {{user_name}}</div>
      <p>We received a request to reset the password for your <strong>{{app_name}}</strong> account. Click the button below to choose a new password.</p>
      
      <div class="button-wrap">
        <a href="{{reset_link}}" class="btn" target="_blank">Reset Password</a>
      </div>

      <div class="meta-box">
        <div><strong>Device / Browser:</strong> {{device_name}}</div>
        <div style="margin-top: 4px;"><strong>IP Address:</strong> {{ip_address}}</div>
      </div>

      <div class="security-note">
        <strong>Important:</strong> This password reset link will expire in <strong>{{expiry_minutes}} minutes</strong>. Resetting your password will revoke all current active sessions across all devices for your protection. If you did not request this, please notify <a href="mailto:{{support_email}}">{{support_email}}</a> immediately.
      </div>

      <div class="fallback">
        <p>If the button does not work, copy and paste this link into your browser:</p>
        <p><a href="{{reset_link}}" style="color: #ef4444;">{{reset_link}}</a></p>
      </div>
    </div>
    <div class="footer">
      &copy; {{year}} {{app_name}}. All rights reserved.
    </div>
  </div>
</body>
</html>`,
  },
  {
    code: 'NEW_LOGIN_ALERT',
    name: 'New Login Security Alert',
    subject: 'Security Alert: New login to {{app_name}} for {{user_name}}',
    description: 'Sent when a new login occurs, revoking any previous active session',
    variables: [
      '{{user_name}}',
      '{{device_name}}',
      '{{ip_address}}',
      '{{login_time}}',
      '{{app_name}}',
      '{{support_email}}',
      '{{year}}',
    ],
    body: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Login Alert</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f5f7; margin: 0; padding: 0; }
    .wrapper { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
    .header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 36px 30px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; }
    .header p { color: #94a3b8; margin: 6px 0 0 0; font-size: 13px; }
    .content { padding: 40px 32px; color: #334155; line-height: 1.6; }
    .greeting { font-size: 18px; font-weight: 600; color: #0f172a; margin-bottom: 16px; }
    .info-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 24px 0; }
    .info-item { margin-bottom: 8px; font-size: 14px; }
    .info-item:last-child { margin-bottom: 0; }
    .policy-box { background: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 6px; padding: 14px 18px; font-size: 13px; color: #1e40af; margin-top: 24px; }
    .footer { background: #f8fafc; padding: 24px 30px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>{{app_name}}</h1>
      <p>Dynamic Session Security</p>
    </div>
    <div class="content">
      <div class="greeting">Hello {{user_name}},</div>
      <p>A new login was just recorded for your <strong>{{app_name}}</strong> account.</p>

      <div class="info-card">
        <div class="info-item"><strong>Device / Client:</strong> {{device_name}}</div>
        <div class="info-item"><strong>IP Address:</strong> {{ip_address}}</div>
        <div class="info-item"><strong>Timestamp:</strong> {{login_time}}</div>
      </div>

      <div class="policy-box">
        <strong>Session Notice:</strong> In accordance with Mercora's Single-Active-Session security policy, any prior session active on other devices has been automatically signed out.
      </div>

      <p style="margin-top: 20px; font-size: 13px; color: #64748b;">
        If this was you, no action is needed. If you did not log in from this device, please change your password immediately or reach out to <a href="mailto:{{support_email}}">{{support_email}}</a>.
      </p>
    </div>
    <div class="footer">
      &copy; {{year}} {{app_name}}. All rights reserved.
    </div>
  </div>
</body>
</html>`,
  },
  {
    code: 'SUBSCRIPTION_PURCHASED',
    name: 'Subscription Purchased Confirmation',
    subject: 'Subscription Activated: {{plan_name}} for {{business_name}}',
    description: 'Sent when a business subscription is activated after verified payment capture',
    variables: ['{{user_name}}', '{{business_name}}', '{{plan_name}}', '{{amount_formatted}}', '{{starts_at}}', '{{expires_at}}', '{{invoice_number}}', '{{dashboard_url}}', '{{app_name}}', '{{year}}'],
    body: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:24px auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;"><div style="background:#7f1d3f;color:#fff;padding:24px;"><h2 style="margin:0;">{{app_name}} Subscription Active</h2></div><div style="padding:24px;color:#1e293b;line-height:1.6;"><p>Hello {{user_name}},</p><p>Your subscription <strong>{{plan_name}}</strong> for <strong>{{business_name}}</strong> is now active.</p><p><strong>Amount Paid:</strong> {{amount_formatted}}<br/><strong>Invoice:</strong> {{invoice_number}}<br/><strong>Validity:</strong> {{starts_at}} to {{expires_at}}</p><p><a href="{{dashboard_url}}" style="display:inline-block;background:#7f1d3f;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;">Manage Subscription</a></p></div><div style="background:#f8fafc;padding:16px;text-align:center;font-size:12px;color:#64748b;">&copy; {{year}} {{app_name}}</div></div>`,
  },
  {
    code: 'PAYMENT_SUCCESS',
    name: 'Payment Receipt Confirmation',
    subject: 'Payment Successful ({{amount_formatted}}) — Invoice {{invoice_number}}',
    description: 'Sent when a Razorpay payment is captured and verified',
    variables: ['{{user_name}}', '{{business_name}}', '{{plan_name}}', '{{amount_formatted}}', '{{payment_id}}', '{{payment_method}}', '{{invoice_number}}', '{{app_name}}', '{{year}}'],
    body: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:24px auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;"><div style="background:#0f172a;color:#fff;padding:24px;"><h2 style="margin:0;">Payment Receipt</h2></div><div style="padding:24px;color:#1e293b;line-height:1.6;"><p>Hello {{user_name}},</p><p>We have received your payment of <strong>{{amount_formatted}}</strong> for <strong>{{business_name}}</strong> ({{plan_name}}).</p><p><strong>Payment Reference:</strong> {{payment_id}}<br/><strong>Method:</strong> {{payment_method}}<br/><strong>Invoice Number:</strong> {{invoice_number}}</p></div><div style="background:#f8fafc;padding:16px;text-align:center;font-size:12px;color:#64748b;">&copy; {{year}} {{app_name}}</div></div>`,
  },
  {
    code: 'PAYMENT_FAILED',
    name: 'Payment Failed Alert',
    subject: 'Payment Failed for {{plan_name}} — {{business_name}}',
    description: 'Sent when a Razorpay payment fails',
    variables: ['{{user_name}}', '{{business_name}}', '{{plan_name}}', '{{amount_formatted}}', '{{failure_reason}}', '{{retry_url}}', '{{app_name}}', '{{year}}'],
    body: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:24px auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;"><div style="background:#991b1b;color:#fff;padding:24px;"><h2 style="margin:0;">Payment Could Not Be Completed</h2></div><div style="padding:24px;color:#1e293b;line-height:1.6;"><p>Hello {{user_name}},</p><p>Your payment attempt of <strong>{{amount_formatted}}</strong> for <strong>{{plan_name}}</strong> ({{business_name}}) failed.</p><p><strong>Reason:</strong> {{failure_reason}}</p><p><a href="{{retry_url}}" style="display:inline-block;background:#7f1d3f;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;">Retry Payment</a></p></div><div style="background:#f8fafc;padding:16px;text-align:center;font-size:12px;color:#64748b;">&copy; {{year}} {{app_name}}</div></div>`,
  },
  {
    code: 'PAYMENT_PENDING',
    name: 'Payment Verification Pending',
    subject: 'Payment Pending Confirmation for {{plan_name}}',
    description: 'Sent when a payment is authorized/awaiting capture',
    variables: ['{{user_name}}', '{{business_name}}', '{{plan_name}}', '{{amount_formatted}}', '{{order_id}}', '{{app_name}}', '{{year}}'],
    body: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:24px auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;"><div style="background:#b45309;color:#fff;padding:24px;"><h2 style="margin:0;">Payment Processing</h2></div><div style="padding:24px;color:#1e293b;line-height:1.6;"><p>Hello {{user_name}},</p><p>Your payment of <strong>{{amount_formatted}}</strong> for <strong>{{plan_name}}</strong> ({{business_name}}) is currently awaiting bank confirmation (Order: {{order_id}}). Your subscription will activate automatically once captured.</p></div><div style="background:#f8fafc;padding:16px;text-align:center;font-size:12px;color:#64748b;">&copy; {{year}} {{app_name}}</div></div>`,
  },
  {
    code: 'SUBSCRIPTION_RENEWED',
    name: 'Subscription Renewed Confirmation',
    subject: 'Subscription Renewed: {{plan_name}} for {{business_name}}',
    description: 'Sent when an active or expired subscription is renewed',
    variables: ['{{user_name}}', '{{business_name}}', '{{plan_name}}', '{{amount_formatted}}', '{{expires_at}}', '{{invoice_number}}', '{{app_name}}', '{{year}}'],
    body: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:24px auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;"><div style="background:#047857;color:#fff;padding:24px;"><h2 style="margin:0;">Subscription Renewed</h2></div><div style="padding:24px;color:#1e293b;line-height:1.6;"><p>Hello {{user_name}},</p><p>Your <strong>{{plan_name}}</strong> subscription for <strong>{{business_name}}</strong> has been renewed until <strong>{{expires_at}}</strong>.</p><p><strong>Amount Paid:</strong> {{amount_formatted}}<br/><strong>Invoice:</strong> {{invoice_number}}</p></div><div style="background:#f8fafc;padding:16px;text-align:center;font-size:12px;color:#64748b;">&copy; {{year}} {{app_name}}</div></div>`,
  },
  {
    code: 'SUBSCRIPTION_EXPIRING_SOON',
    name: 'Subscription Expiring Soon Reminder',
    subject: 'Action Required: Your {{plan_name}} subscription expires on {{expires_at}}',
    description: 'Sent before subscription expiry to prompt manual renewal',
    variables: ['{{user_name}}', '{{business_name}}', '{{plan_name}}', '{{expires_at}}', '{{days_remaining}}', '{{renew_url}}', '{{app_name}}', '{{year}}'],
    body: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:24px auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;"><div style="background:#b45309;color:#fff;padding:24px;"><h2 style="margin:0;">Subscription Expiring in {{days_remaining}} Days</h2></div><div style="padding:24px;color:#1e293b;line-height:1.6;"><p>Hello {{user_name}},</p><p>Your <strong>{{plan_name}}</strong> subscription for <strong>{{business_name}}</strong> expires on <strong>{{expires_at}}</strong>. Renew now to retain featured placement and plan limits.</p><p><a href="{{renew_url}}" style="display:inline-block;background:#7f1d3f;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;">Renew Subscription</a></p></div><div style="background:#f8fafc;padding:16px;text-align:center;font-size:12px;color:#64748b;">&copy; {{year}} {{app_name}}</div></div>`,
  },
  {
    code: 'SUBSCRIPTION_EXPIRED',
    name: 'Subscription Expired Notification',
    subject: 'Subscription Expired: {{plan_name}} for {{business_name}}',
    description: 'Sent when subscription expires and paid entitlements are removed',
    variables: ['{{user_name}}', '{{business_name}}', '{{plan_name}}', '{{expired_at}}', '{{renew_url}}', '{{app_name}}', '{{year}}'],
    body: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:24px auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;"><div style="background:#475569;color:#fff;padding:24px;"><h2 style="margin:0;">Subscription Expired</h2></div><div style="padding:24px;color:#1e293b;line-height:1.6;"><p>Hello {{user_name}},</p><p>Your <strong>{{plan_name}}</strong> subscription for <strong>{{business_name}}</strong> expired on <strong>{{expired_at}}</strong>. Your business profile and historical data remain preserved, while paid plan entitlements have been paused.</p><p><a href="{{renew_url}}" style="display:inline-block;background:#7f1d3f;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;">Renew Plan</a></p></div><div style="background:#f8fafc;padding:16px;text-align:center;font-size:12px;color:#64748b;">&copy; {{year}} {{app_name}}</div></div>`,
  },
  {
    code: 'REFUND_INITIATED',
    name: 'Refund Initiated Notification',
    subject: 'Refund Initiated ({{amount_formatted}}) for {{business_name}}',
    description: 'Sent when an admin initiates a refund via Razorpay',
    variables: ['{{user_name}}', '{{business_name}}', '{{amount_formatted}}', '{{refund_id}}', '{{reason}}', '{{app_name}}', '{{year}}'],
    body: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:24px auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;"><div style="background:#0f172a;color:#fff;padding:24px;"><h2 style="margin:0;">Refund Initiated</h2></div><div style="padding:24px;color:#1e293b;line-height:1.6;"><p>Hello {{user_name}},</p><p>A refund of <strong>{{amount_formatted}}</strong> has been initiated for <strong>{{business_name}}</strong>.</p><p><strong>Refund Reference:</strong> {{refund_id}}<br/><strong>Reason:</strong> {{reason}}</p></div><div style="background:#f8fafc;padding:16px;text-align:center;font-size:12px;color:#64748b;">&copy; {{year}} {{app_name}}</div></div>`,
  },
  {
    code: 'REFUND_COMPLETED',
    name: 'Refund Completed Notification',
    subject: 'Refund Processed ({{amount_formatted}}) — {{business_name}}',
    description: 'Sent when Razorpay confirms refund.processed',
    variables: ['{{user_name}}', '{{business_name}}', '{{amount_formatted}}', '{{refund_id}}', '{{app_name}}', '{{year}}'],
    body: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:24px auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;"><div style="background:#047857;color:#fff;padding:24px;"><h2 style="margin:0;">Refund Completed</h2></div><div style="padding:24px;color:#1e293b;line-height:1.6;"><p>Hello {{user_name}},</p><p>Your refund of <strong>{{amount_formatted}}</strong> for <strong>{{business_name}}</strong> has been processed (Ref: {{refund_id}}). Please allow 5–7 business days for bank settlement.</p></div><div style="background:#f8fafc;padding:16px;text-align:center;font-size:12px;color:#64748b;">&copy; {{year}} {{app_name}}</div></div>`,
  },
];
