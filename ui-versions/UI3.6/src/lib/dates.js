/**
 * Calendar dates from the API are 'YYYY-MM-DD' text. new Date('2026-10-01') would read that as UTC
 * midnight, so build the date from its parts in local time instead. Anything else (timestamps) goes
 * through new Date as usual.
 */
export function parseDay(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(value);
}
