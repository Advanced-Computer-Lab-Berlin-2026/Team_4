// Borrow dates - Owner: Member 5 (Req 46, 48). Small helpers shared by BorrowListButton and BorrowListPage.
// Days are whole days in UTC written as YYYY-MM-DD. The end date is the return day and is not counted
// (1-3 Dec = 2 days), the same rule as the server and Member 1's checkout.
// These checks only save a round trip: the server (services/borrow/borrowList.js) is the one that decides.
import { formatDate } from '../../../utils/format';

export const HORIZON_DAYS = 365;          // the start date must be within 1 year from today
export const MAX_DAYS_WITHOUT_RULE = 365; // longest borrow (in days) when the item sets no maximum
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const toMs = (day) => Date.parse(`${day}T00:00:00Z`);
export const isDay = (day) => typeof day === 'string' && DAY_REGEX.test(day) && !Number.isNaN(toMs(day));
export const todayUtc = () => new Date().toISOString().slice(0, 10);
export const addDays = (day, n) => new Date(toMs(day) + n * DAY_MS).toISOString().slice(0, 10);
export const daysBetween = (start, end) => Math.round((toMs(end) - toMs(start)) / DAY_MS); // the return day is not counted
export const dayCount = (n) => `${n} day${n === 1 ? '' : 's'}`;

// Midday UTC shows the same calendar day in every time zone.
const atNoon = (day) => `${day}T12:00:00Z`;
const shortDay = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** "2026-12-01" -> "1 Dec 2026" */
export const showDay = (day) => formatDate(atNoon(day));

/** "1 Dec – 3 Dec 2026" or "30 Dec 2026 – 2 Jan 2027" (start day – return day) */
export const showRange = (start, end) => {
  if (start === end) return showDay(start);
  const first = start.slice(0, 4) === end.slice(0, 4) ? shortDay.format(new Date(atNoon(start))) : showDay(start);
  return `${first} – ${showDay(end)}`;
};

/** Longest borrow for an item, in days. */
export const maxDaysFor = (maxBorrowDays) => Number(maxBorrowDays) || MAX_DAYS_WITHOUT_RULE;

/** Same rules and wording as the server. Returns {} when the dates are fine, else { startDate?, endDate? }. */
export function checkDates({ startDate, endDate }, maxBorrowDays) {
  const errors = {};
  const today = todayUtc();
  if (!isDay(startDate)) errors.startDate = 'Choose a start date';
  else if (startDate < today) errors.startDate = 'The start date can\'t be in the past';
  else if (startDate > addDays(today, HORIZON_DAYS)) errors.startDate = 'Pick a start date within the next year';
  if (!isDay(endDate)) errors.endDate = 'Choose an end date';
  else if (!errors.startDate) {
    const max = maxDaysFor(maxBorrowDays);
    if (endDate <= startDate) errors.endDate = 'The end date must be after the start date';
    else if (daysBetween(startDate, endDate) > max) errors.endDate = `This item can be borrowed for at most ${dayCount(max)}`;
  }
  return errors;
}

/** Server field errors [{ field, message }] -> { startDate?, endDate? } */
export const dateErrorsFrom = (fieldErrors) => {
  const out = {};
  (fieldErrors || []).forEach((e) => { if ((e.field === 'startDate' || e.field === 'endDate') && !out[e.field]) out[e.field] = e.message; });
  return out;
};
