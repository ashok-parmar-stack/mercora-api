const SENSITIVE_KEY_PATTERN =
  /password|pass|passwd|token|secret|authorization|cookie|set-cookie|api[_-]?key|access[_-]?key|secret[_-]?key|refresh|jwt|ssn|credit[_-]?card|card[_-]?(number|pan|cvv|pin|exp)|cvv|upi[_-]?pin|account[_-]?number|razorpay[_-]?(key[_-]?secret|webhook[_-]?secret|signature)|x[_-]?razorpay[_-]?signature|gateway[_-]?signature/i;

const PII_EMAIL_KEY_PATTERN = /^(email|recipientEmail|senderEmail|billingEmail)$/i;
const PII_PHONE_KEY_PATTERN = /^(phone|senderPhone|contact|mobile)$/i;

function maskEmail(email: string): string {
  const parts = email.split('@');
  if (parts.length !== 2) return '[REDACTED_EMAIL]';
  const [local, domain] = parts;
  const visible = local.length <= 2 ? local[0] || '*' : `${local[0]}***${local[local.length - 1]}`;
  return `${visible}@${domain}`;
}

function maskPhone(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.length <= 4) return '****';
  return `${trimmed.slice(0, 2)}******${trimmed.slice(-2)}`;
}

/**
 * Recursively redacts secrets, tokens, passwords, payment credentials,
 * signatures, and sensitive PII before writing log payloads or error telemetry.
 */
export function sanitizeLogData(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (value === null || value === undefined) return value;
  if (depth > 6) return '[MAX_DEPTH]';

  if (typeof value === 'string') {
    if (value.startsWith('Bearer ')) return 'Bearer [REDACTED]';
    if (value.startsWith('Basic ')) return 'Basic [REDACTED]';
    return value.length > 500 ? `${value.slice(0, 500)}...[TRUNCATED]` : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();

  if (value instanceof Date) return value.toISOString();

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      ...(process.env.NODE_ENV !== 'production' && value.stack
        ? { stack: value.stack.split('\n').slice(0, 4).join(' | ') }
        : {}),
    };
  }

  if (typeof value === 'object') {
    if (seen.has(value)) return '[CIRCULAR]';
    seen.add(value);

    if (Buffer.isBuffer(value)) {
      return `[Buffer ${value.length} bytes]`;
    }

    if (Array.isArray(value)) {
      return value.slice(0, 25).map((item) => sanitizeLogData(item, depth + 1, seen));
    }

    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        out[key] = '[REDACTED]';
      } else if (PII_EMAIL_KEY_PATTERN.test(key) && typeof val === 'string') {
        out[key] = maskEmail(val);
      } else if (PII_PHONE_KEY_PATTERN.test(key) && typeof val === 'string') {
        out[key] = maskPhone(val);
      } else {
        out[key] = sanitizeLogData(val, depth + 1, seen);
      }
    }
    return out;
  }

  return String(value);
}
