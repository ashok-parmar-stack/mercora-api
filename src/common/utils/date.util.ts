const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface ParsedUtcDateRange {
  from?: Date;
  to?: Date;
  toExclusive?: boolean;
}

/**
 * Normalizes incoming API date/datetime filter values into UTC Date boundaries.
 * - Full ISO-8601 timestamps (e.g. `2026-11-26T18:30:00.000Z`) are parsed directly.
 * - Date-only `toDate` strings (`YYYY-MM-DD`) are converted to an exclusive
 *   next-day UTC midnight boundary (`< nextDayStart`) so full days are never clipped.
 */
export function parseUtcDateRange(
  fromDate?: string | null,
  toDate?: string | null
): ParsedUtcDateRange {
  const result: ParsedUtcDateRange = {};

  if (fromDate && fromDate.trim()) {
    const parsedFrom = new Date(fromDate.trim());
    if (!Number.isNaN(parsedFrom.getTime())) {
      result.from = parsedFrom;
    }
  }

  if (toDate && toDate.trim()) {
    const trimmedTo = toDate.trim();
    const dateOnly = DATE_ONLY_REGEX.exec(trimmedTo);
    if (dateOnly) {
      const [, y, m, d] = dateOnly;
      const nextUtcDay = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d) + 1));
      if (!Number.isNaN(nextUtcDay.getTime())) {
        result.to = nextUtcDay;
        result.toExclusive = true;
      }
    } else {
      const parsedTo = new Date(trimmedTo);
      if (!Number.isNaN(parsedTo.getTime())) {
        result.to = parsedTo;
        result.toExclusive = false;
      }
    }
  }

  return result;
}
