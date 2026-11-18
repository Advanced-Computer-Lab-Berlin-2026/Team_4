// Member 7 - date helpers. All dates are UTC calendar days as 'YYYY-MM-DD' strings (matches the server).
// String comparison (<, >) is valid for this format.
const pad = (n) => String(n).padStart(2, '0');

export const toDay = (d) => new Date(d).toISOString().slice(0, 10);
export const fromDay = (s) => new Date(`${s}T00:00:00.000Z`);
export const todayDay = () => toDay(new Date());
export const addDays = (s, n) => toDay(new Date(fromDay(s).getTime() + n * 86400000));
export const daysBetween = (a, b) => Math.round((fromDay(b) - fromDay(a)) / 86400000);
export const isDay = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const date = fromDay(s);
  return Number.isFinite(+date) && toDay(date) === s;
};

export const monthFirst = ({ y, m }) => `${y}-${pad(m + 1)}-01`;
export const shiftMonth = ({ y, m }, delta) => {
  const d = new Date(Date.UTC(y, m + delta, 1));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
};
export const daysInMonth = ({ y, m }) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
export const dayToMonth = (s) => ({ y: Number(s.slice(0, 4)), m: Number(s.slice(5, 7)) - 1 });

export const formatDay = (s) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(fromDay(s));
export const formatDayLong = (s) =>
  new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeZone: 'UTC' }).format(fromDay(s));
export const formatMonth = (month) =>
  new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(fromDay(monthFirst(month)));

// The dates are already chosen on the calendar, so go straight to M1's single checkout (the same URL ReservePage builds).
// To use the contract's picker page instead, return `/reserve/${itemId}` here.
export const reserveUrl = (itemId, start, end) =>
  `/checkout?${new URLSearchParams({ source: 'single', itemId, startDate: start, endDate: end }).toString()}`;

// Contract: a waitlist offer links straight to single checkout with the claimed hold.
export const offerUrl = (itemId, entry) => (entry.holdId
  ? `/checkout?${new URLSearchParams({
    source: 'single', itemId, startDate: toDay(entry.startDate), endDate: toDay(entry.endDate), holdId: entry.holdId,
  }).toString()}`
  : null);

/** Server timestamp (ISO) -> 'YYYY-MM-DD' */
export const isoDay = (iso) => toDay(iso);
