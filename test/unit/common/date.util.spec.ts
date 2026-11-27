import { parseUtcDateRange } from '../../../src/common/utils/date.util';

describe('parseUtcDateRange', () => {
  it('parses full ISO-8601 UTC range boundaries directly', () => {
    const res = parseUtcDateRange(
      '2026-11-26T18:30:00.000Z',
      '2026-11-27T18:29:59.999Z',
    );
    expect(res.from?.toISOString()).toBe('2026-11-26T18:30:00.000Z');
    expect(res.to?.toISOString()).toBe('2026-11-27T18:29:59.999Z');
    expect(res.toExclusive).toBe(false);
  });

  it('converts date-only toDate into exclusive next-day UTC midnight', () => {
    const res = parseUtcDateRange('2026-11-27', '2026-11-27');
    expect(res.from?.toISOString()).toBe('2026-11-27T00:00:00.000Z');
    expect(res.to?.toISOString()).toBe('2026-11-28T00:00:00.000Z');
    expect(res.toExclusive).toBe(true);
  });

  it('ignores invalid or empty date inputs', () => {
    const res = parseUtcDateRange('not-a-date', '');
    expect(res.from).toBeUndefined();
    expect(res.to).toBeUndefined();
  });
});
