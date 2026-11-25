const SENSITIVE_KEY_PATTERN =
  /password|pass|passwd|token|secret|authorization|cookie|set-cookie|api[_-]?key|access[_-]?key|secret[_-]?key|refresh|jwt|ssn|credit[_-]?card|cvv/i;

const PII_EMAIL_KEY_PATTERN = /^email|recipientEmail$/i;

function maskEmail(email: string): string {
  const parts = email.split('@');
  if (parts.length !== 2) return '[REDACTED_EMAIL]';
  const [local, domain] = parts;
  const visible = local.length <= 2 ? local[0] || '*' : `${local[0]}***${local[local.length - 1]}`;
  return `${visible}@${domain}`;
}

/**
 * Recursively redacts secrets, tokens, passwords, and sensitive personal metadata
 * before writing log payloads or error telemetry.
 */
export function sanitizeLogData(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > 5) return '[MAX_DEPTH]';

  if (typeof value === 'string') {
    if (value.startsWith('Bearer ')) return 'Bearer [REDACTED]';
    return value.length > 500 ? `${value.slice(0, 500)}...[TRUNCATED]` : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (Array.isArray(value)) {
    return value.slice(0, 25).map((item) => sanitizeLogData(item, depth + 1));
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        out[key] = '[REDACTED]';
      } else if (PII_EMAIL_KEY_PATTERN.test(key) && typeof val === 'string') {
        out[key] = maskEmail(val);
      } else {
        out[key] = sanitizeLogData(val, depth + 1);
      }
    }
    return out;
  }

  return String(value);
}
