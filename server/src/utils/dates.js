// Booking dates are whole days, written as "YYYY-MM-DD".
// We store them as midnight UTC, so "2026-12-10" is always the same instant
// no matter which time zone the server or the user is in.

export const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// "2026-12-10" -> Date(2026-12-10T00:00:00Z), or null if it is not a real day.
// The round-trip check rejects impossible dates such as "2026-02-30",
// which new Date() would silently turn into 2 March.
export function parseDay(text) {
  if (!DATE_RE.test(text)) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null; // e.g. month 13: not a date at all
  return date.toISOString().slice(0, 10) === text ? date : null;
}

export const formatDay = (date) => date.toISOString().slice(0, 10);

// Today's date in India, as a Date at midnight UTC. Using the server clock's
// own day would be wrong once deployed: Render runs in UTC, which is still
// "yesterday" between 00:00 and 05:30 IST.
export function todayInIndia() {
  const text = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  return parseDay(text);
}

export const addDays = (date, n) => new Date(date.getTime() + n * DAY_MS);

export const daysBetween = (start, end) => Math.round((end - start) / DAY_MS);
