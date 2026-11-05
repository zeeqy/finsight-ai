/** Shared text formatting for durations. Dates are YYYY-MM-DD strings read as local dates. */

/** "4 years 3 months", "1 year", "5 months". */
export function fmtDuration(months) {
  if (!(months > 0)) return 'less than a month';
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts = [];
  if (years) parts.push(`${years} year${years === 1 ? '' : 's'}`);
  if (rest) parts.push(`${rest} month${rest === 1 ? '' : 's'}`);
  return parts.join(' ');
}

/** Whole months from today to a YYYY-MM-DD date, a partial month counting as one (matches the server). */
export function monthsUntil(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(String(dateStr || ''))) return null;
  const [ty, tm, td] = String(dateStr).slice(0, 10).split('-').map(Number);
  const now = new Date();
  let months = (ty - now.getFullYear()) * 12 + (tm - (now.getMonth() + 1));
  if (td > now.getDate()) months += 1;
  return months;
}

/** "in 4 years 3 months", or a note when the date has passed. */
export function timeUntil(dateStr) {
  const months = monthsUntil(dateStr);
  if (months === null) return '';
  if (months <= 0) return 'This date has passed';
  return `in ${fmtDuration(months)}`;
}
