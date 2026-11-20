import {
  SLUG_SANITIZE_REGEX,
  CODE_SANITIZE_REGEX,
  SPACES_AND_HYPHENS_REGEX,
  EDGE_HYPHENS_REGEX,
} from '../constants/regex.constants';

/**
 * Slug & Code Utilities
 * ─────────────────────────────────────────────────────────────────────────────
 * Generate URL-safe slugs and codes for entities.
 * Pattern: "John Smith" → "john-smith"
 * With unique suffix: "john-smith-x4f2"
 */

/**
 * Convert any string to a clean URL slug.
 * "John Smith (Admin)" → "john-smith-admin"
 */
export function toSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(SLUG_SANITIZE_REGEX, '')
    .replace(SPACES_AND_HYPHENS_REGEX, '-')
    .replace(EDGE_HYPHENS_REGEX, '');
}

/**
 * Convert any string to a clean uppercase entity code.
 * "Wall & Floor Tiles" → "WALL-FLOOR-TILES"
 */
export function toCode(value: string): string {
  return value
    .toUpperCase()
    .trim()
    .replace(CODE_SANITIZE_REGEX, '')
    .replace(SPACES_AND_HYPHENS_REGEX, '-')
    .replace(EDGE_HYPHENS_REGEX, '');
}

/**
 * Generate a slug with a short random suffix to guarantee uniqueness.
 * "john-smith" + "a3f2" → "john-smith-a3f2"
 */
export function toUniqueSlug(value: string): string {
  const base = toSlug(value);
  const suffix = Math.random().toString(36).slice(2, 6); // 4 random base-36 chars
  return `${base}-${suffix}`;
}
