/**
 * REGEX CONSTANTS & VALIDATION HELPERS
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for all validation regular expressions.
 * Updating here updates validation logic everywhere across the application.
 */

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const EMAIL_REGEX =
  /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export const SLUG_REGEX =
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const PHONE_REGEX =
  /^\+?[1-9]\d{1,14}$/;

export const POSTAL_CODE_REGEX =
  /^[A-Z0-9\s-]{3,10}$/i;

/**
 * Sanitization & transformation regexes
 */
export const SLUG_SANITIZE_REGEX = /[^a-z0-9\s-]/g;
export const CODE_SANITIZE_REGEX = /[^A-Z0-9\s-]/g;
export const SPACES_AND_HYPHENS_REGEX = /[\s-]+/g;
export const WHITESPACE_REGEX = /\s+/g;
export const REPEATED_HYPHENS_REGEX = /-+/g;
export const EDGE_HYPHENS_REGEX = /^-+|-+$/g;

export const REGEX = {
  UUID: UUID_REGEX,
  EMAIL: EMAIL_REGEX,
  SLUG: SLUG_REGEX,
  PHONE: PHONE_REGEX,
  POSTAL_CODE: POSTAL_CODE_REGEX,
  SLUG_SANITIZE: SLUG_SANITIZE_REGEX,
  CODE_SANITIZE: CODE_SANITIZE_REGEX,
  SPACES_AND_HYPHENS: SPACES_AND_HYPHENS_REGEX,
  WHITESPACE: WHITESPACE_REGEX,
  REPEATED_HYPHENS: REPEATED_HYPHENS_REGEX,
  EDGE_HYPHENS: EDGE_HYPHENS_REGEX,
} as const;

/**
 * Check if a given string is a valid UUID (v1-v5).
 * Safe against null/undefined/non-string values.
 */
export function isUUID(value?: string | null): boolean {
  if (!value || typeof value !== 'string') return false;
  return UUID_REGEX.test(value.trim());
}

/**
 * Alias for isUUID
 */
export const isValidUUID = isUUID;

/**
 * Check if a given string is a valid URL slug.
 * Safe against null/undefined/non-string values.
 */
export function isValidSlug(value?: string | null): boolean {
  if (!value || typeof value !== 'string') return false;
  return SLUG_REGEX.test(value.trim());
}
