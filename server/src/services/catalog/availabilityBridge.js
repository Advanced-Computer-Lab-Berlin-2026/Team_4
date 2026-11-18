/**
 * AVAILABILITY BRIDGE - Owner: Member 7 (helper inside services/catalog)
 * Single place where Member 7 asks "is this item booked?". It reuses Member 1's rule and statuses
 * (services/reservations/availability.js): UTC date-only fields, half-open [start, end), blocking statuses
 * pending/confirmed/active, plus unexpired ReservationHold documents. M1's getAvailability/checkOverlap work per item,
 * so the catalog filter (thousands of items) uses the same predicate in one bulk query.
 */
const Reservation = require('../../models/Reservation');
const ReservationHold = require('../../models/ReservationHold');
const Item = require('../../models/Item');
const Category = require('../../models/Category');
const availability = require('../reservations/availability'); // Member 1: BLOCKING_STATUSES, overlapFilter, checkOverlap

// Single source of truth = M1's service, so catalog, calendar, waitlists and checkout can never disagree.
const { BLOCKING_STATUSES } = availability;
const MAX_WINDOW_DAYS = 400;
const DAY_MS = 86400000;

/** 'YYYY-MM-DD' -> Date at UTC midnight, or null when malformed / impossible (e.g. 2026-02-31). */
function parseDay(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return null;
  return d;
}

const toDay = (d) => new Date(d).toISOString().slice(0, 10);

function todayStart() {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

/** -> { range: {start, end} } or { error: 'message' } */
function parseRange(start, end, { maxDays = MAX_WINDOW_DAYS, allowPast = false } = {}) {
  const s = parseDay(start);
  const e = parseDay(end);
  if (!s || !e) return { error: 'Dates must use the format YYYY-MM-DD' };
  if (e <= s) return { error: 'The end date must be after the start date' };
  if (!allowPast && s < todayStart()) return { error: 'The start date cannot be in the past' };
  if ((e - s) / DAY_MS > maxDays) return { error: `The date range cannot be longer than ${maxDays} days` };
  return { range: { start: s, end: e } };
}

/** Half-open overlap test. */
const rangesOverlap = (a, b) => a.start < b.end && a.end > b.start;

const overlap = (range) => availability.overlapFilter({ startDate: range.start, endDate: range.end });
const reservationFilter = (range) => ({ status: { $in: BLOCKING_STATUSES }, ...overlap(range) });
// Ordinary checkout requires a free range. An active offer can only be used with its hold ID.
const holdFilter = (range) => ({ expiresAt: { $gt: new Date() }, ...overlap(range) });

async function findPublicItem(itemId, fields, session) {
  const item = await Item.findOne(Item.publicFilter({ _id: itemId }))
    .select(fields).session(session || null).lean();
  if (!item || !(await Category.exists({ _id: item.category, isActive: true }).session(session || null))) return null;
  return item;
}

/** Ids of every item that is booked or held during the range. Bulk query for the catalog filter. */
async function unavailableItemIds(range) {
  const [booked, held] = await Promise.all([
    Reservation.distinct('item', reservationFilter(range)),
    ReservationHold.distinct('item', holdFilter(range)),
  ]);
  const ids = new Map();
  [...booked, ...held].forEach((id) => ids.set(String(id), id));
  return [...ids.values()];
}

/** Booked / held intervals of one item overlapping the window, as day strings (calendar data). */
async function blockedIntervals(itemId, range) {
  const [reservations, holds] = await Promise.all([
    Reservation.find({ item: itemId, ...reservationFilter(range) }).select('startDate endDate').lean(),
    ReservationHold.find({ item: itemId, ...holdFilter(range) }).select('startDate endDate').lean(),
  ]);
  return [
    ...reservations.map((r) => ({ start: toDay(r.startDate), end: toDay(r.endDate), type: 'booked' })),
    ...holds.map((h) => ({ start: toDay(h.startDate), end: toDay(h.endDate), type: 'held' })),
  ].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}

/** True when nothing blocks the item during the range (delegates to M1's checkOverlap). */
async function isRangeFree(itemId, range, session) {
  return !(await availability.checkOverlap(itemId, { startDate: range.start, endDate: range.end }, null, { session }));
}

module.exports = {
  BLOCKING_STATUSES, MAX_WINDOW_DAYS,
  parseDay, parseRange, rangesOverlap, toDay, todayStart,
  findPublicItem, unavailableItemIds, blockedIntervals, isRangeFree,
};
