/**
 * BORROW LIST SERVICE - Owner: Member 5 - Requirements: 46, 47, 48
 * Contract: docs/sprint2/member5.md §3
 *
 * The list is a draft, not a hold on the items; entries that checkout would refuse are marked with a `problem`.
 * Member 1's checkout (Req 49) reads BorrowList itself, re-checks every
 * entry and removes the checked-out entries that still match their id, item and dates (docs/sprint2/member5.md §3.4),
 * so every write here is field-scoped ($push, $set on entries.$, $pull).
 * Dates are whole days in UTC. The end date is the return day and is not counted (1-3 Dec = 2 days), the same
 * rule as Member 1's checkout and reservations (docs/SPRINT2_CONTRACT.md: half-open [startDate, endDate)).
 */
const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const BorrowList = require('../../models/BorrowList');
const Item = require('../../models/Item');
const User = require('../../models/User');
const { Reservation, ReservationHold } = require('../../models');
// Member 1's booking engine, read only: which statuses block dates, the overlap rule, and the membership limit.
const { BLOCKING_STATUSES, overlapFilter } = require('../reservations/availability');
const { getEntitlements } = require('../reservations/bookingRules');
const { features } = require('../sprint2/bootstrap');

const MAX_ENTRIES = 10;
const HORIZON_DAYS = 365;        // the start date must be within 1 year from today
const MAX_DAYS_WITHOUT_RULE = 365; // longest borrow (in days) when the item sets no maxBorrowDays
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const ITEM_FIELDS = 'title photos category depositAmount owner pickup rules isArchived moderationStatus';

const fieldError = (field, message) => ApiError.badRequest(message, [{ field, message }]);
const todayUtc = () => { const n = new Date(); return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()); };
const toDay = (value) => {
  const date = value instanceof Date ? value : parseDay(value);
  if (!date || !Number.isFinite(+date)) return null;
  const iso = date.toISOString();
  return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : null;
};
const daysBetween = (start, end) => Math.round((new Date(end) - new Date(start)) / DAY_MS); // end date = return day, not counted

/** "2026-12-01" -> Date at UTC midnight, or null if it isn't a real calendar date (e.g. 2026-02-30). */
function parseDay(value) {
  if (typeof value !== 'string' || !DATE_REGEX.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

/** Checks a date range for an item and returns { start, end } as Dates. Throws 400 with the field that is wrong. */
function checkDates(item, startDate, endDate) {
  const start = parseDay(startDate);
  if (!start) throw fieldError('startDate', 'Choose a valid start date (YYYY-MM-DD)');
  const end = parseDay(endDate);
  if (!end) throw fieldError('endDate', 'Choose a valid end date (YYYY-MM-DD)');
  const today = todayUtc();
  if (start.getTime() < today) throw fieldError('startDate', 'The start date can\'t be in the past');
  if (start.getTime() > today + HORIZON_DAYS * DAY_MS) throw fieldError('startDate', 'Pick a start date within the next year');
  if (end <= start) throw fieldError('endDate', 'The end date must be after the start date');
  const max = item.rules?.maxBorrowDays || MAX_DAYS_WITHOUT_RULE;
  if (daysBetween(start, end) > max) {
    throw fieldError('endDate', `This item can be borrowed for at most ${max} day${max === 1 ? '' : 's'}`);
  }
  return { start, end };
}

/** A public item the user may borrow: exists, not archived/removed, not their own. */
async function loadBorrowableItem(user, itemId) {
  const item = await Item.findOne(Item.publicFilter({ _id: itemId })).select('owner rules').lean();
  if (!item) throw ApiError.notFound('This item is not available');
  if (String(item.owner) === String(user._id)) throw ApiError.forbidden('You can\'t borrow your own item');
  return item;
}

/** Is the item's lender still allowed to lend? (Member 1's checkout refuses otherwise.) */
const lenderCanLend = (owner) => !!owner && owner.role === 'member' && owner.lenderStatus === 'verified' && owner.status === 'active';

/**
 * Why an entry can't be checked out right now, or null. These are the checks Member 1's checkout makes
 * (services/reservations/bookingRules.js), so "Check out" is only offered when checkout can succeed.
 * `context` = { userId, owner (populated), trustScore, booked } (booked: the dates overlap someone else's booking or hold).
 */
function problemOf(entry, item, context = {}) {
  if (!item || item.isArchived || item.moderationStatus !== 'ok') {
    return ['unavailable', 'This item is no longer available. Remove it from your list.'];
  }
  if (context.checkLender && !lenderCanLend(item.owner)) { // owner populated: suspended, not verified, or deleted
    return ['unavailable', 'The lender can\'t lend this item right now. Remove it from your list.'];
  }
  if (context.userId && item.owner && String(item.owner._id) === String(context.userId)) {
    return ['unavailable', 'This is your own item. Remove it from your list.'];
  }
  if (!toDay(entry.startDate) || !toDay(entry.endDate)) {
    return ['invalid_dates', 'Choose valid start and end dates.'];
  }
  if (new Date(entry.startDate).getTime() < todayUtc()) return ['dates_passed', 'These dates have passed. Choose new dates.'];
  if (daysBetween(entry.startDate, entry.endDate) < 1) {
    return ['invalid_dates', 'The end date must be after the start date. Choose new dates.']; // saved before the end-date rule changed
  }
  const max = item.rules?.maxBorrowDays || MAX_DAYS_WITHOUT_RULE;
  if (daysBetween(entry.startDate, entry.endDate) > max) {
    return ['too_long', `This item can now be borrowed for at most ${max} day${max === 1 ? '' : 's'}. Shorten the dates.`];
  }
  const minTrust = Number(item.rules?.minTrustScore) || 0;
  if (context.trustScore !== undefined && context.trustScore < minTrust) {
    return ['trust_too_low', `This item needs a trust score of at least ${minTrust} (yours is ${context.trustScore}). Remove it from your list.`];
  }
  if (context.booked) return ['booked', 'Someone has already booked part of these dates. Choose other dates.'];
  return null;
}

const toEntryDto = (entry, item, context) => {
  const problem = problemOf(entry, item, context);
  const startDate = toDay(entry.startDate);
  const endDate = toDay(entry.endDate);
  return {
    _id: entry._id,
    startDate,
    endDate,
    days: startDate && endDate ? daysBetween(entry.startDate, entry.endDate) : null,
    item: item ? {
      _id: item._id, title: item.title, photo: item.photos?.[0]?.url || null, depositAmount: item.depositAmount,
      category: item.category ? { _id: item.category._id, name: item.category.name, slug: item.category.slug } : null,
      owner: item.owner ? { _id: item.owner._id, name: item.owner.name } : null,
      pickup: { location: item.pickup?.location || '' },
      maxBorrowDays: item.rules?.maxBorrowDays || null,
    } : null,
    problem: problem ? problem[0] : null,
    problemMessage: problem ? problem[1] : null,
    addedAt: entry.addedAt,
  };
};

/**
 * True when the entry's dates overlap someone else's booking or hold, by Member 1's rules (same statuses, same
 * half-open overlap). My own temporary holds (a checkout of this list still being paid) don't count against me.
 */
async function isBooked(entry, userId) {
  const range = { startDate: new Date(entry.startDate), endDate: new Date(entry.endDate) };
  if (!(range.endDate > range.startDate)) return false; // flagged as invalid_dates already
  const common = { item: entry.item, ...overlapFilter(range) };
  const [booking, hold] = await Promise.all([
    Reservation.exists({ ...common, status: { $in: BLOCKING_STATUSES } }),
    ReservationHold.exists({ ...common, expiresAt: { $gt: new Date() }, borrower: { $ne: userId } }),
  ]);
  return !!(booking || hold);
}

/**
 * The membership limit on open bookings that Member 1's checkout enforces (bookingRules.assertCapacity):
 * { limit, used, left }, or null when my membership has no limit. My own holds count as used, like checkout does.
 */
async function capacityOf(userId, entitlements) {
  const limit = entitlements?.maxConcurrentReservations;
  if (limit == null || !Number.isInteger(limit) || limit < 0) return null;
  const [bookings, holds] = await Promise.all([
    Reservation.countDocuments({ borrower: userId, status: { $in: BLOCKING_STATUSES } }),
    ReservationHold.countDocuments({ borrower: userId, expiresAt: { $gt: new Date() } }),
  ]);
  const used = bookings + holds;
  return { limit, used, left: Math.max(0, limit - used) };
}

/** GET my list with item details and each entry's problem. A member without a list gets an empty one. */
async function getList(userId) {
  const [list, me] = await Promise.all([
    BorrowList.findOne({ user: userId }).lean(),
    User.findById(userId).lean(),
  ]);
  const entries = list?.entries || [];
  const items = await Item.find({ _id: { $in: entries.map((e) => e.item) } }).select(ITEM_FIELDS)
    .populate('category', 'name slug depositMultiplier').populate('owner', 'name role lenderStatus status').lean();
  const byId = new Map(items.map((i) => [String(i._id), i]));
  const base = { userId, checkLender: true, trustScore: me?.trustScore ?? 0 };
  const deps = features();
  const [booked, entitlements] = await Promise.all([
    Promise.all(entries.map((e) => (problemOf(e, byId.get(String(e.item)), base) ? false : isBooked(e, userId)))),
    me ? getEntitlements(me, new Date(), null, deps).catch(() => null) : null,
  ]);
  const [capacity, pricedEntries] = await Promise.all([
    capacityOf(userId, entitlements),
    Promise.all(entries.map(async (entry, index) => {
      const item = byId.get(String(entry.item));
      const result = toEntryDto(entry, item, { ...base, booked: booked[index] });
      let estimatedDepositMinor = null;
      if (!result.problem && entitlements && deps.pricing?.quote) {
        const quote = await deps.pricing.quote(item, entry, entitlements, null, { method: 'pickup' }, {
          borrowerId: String(userId),
        }).catch(() => null);
        estimatedDepositMinor = quote?.amountMinor ?? null;
      }
      return { ...result, estimatedDepositMinor };
    })),
  ]);
  return {
    _id: list?._id || null,
    max: MAX_ENTRIES,
    count: entries.length,
    capacity, // null = no membership limit
    entries: pricedEntries,
  };
}

/** Req 46: add an item with dates. "Once per item" and "max 10" are enforced in one atomic write. */
async function addEntry(user, { itemId, startDate, endDate }) {
  const item = await loadBorrowableItem(user, itemId);
  const { start, end } = checkDates(item, startDate, endDate);
  const itemObjectId = new mongoose.Types.ObjectId(itemId);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const updated = await BorrowList.findOneAndUpdate(
        { user: user._id, 'entries.item': { $ne: itemObjectId }, [`entries.${MAX_ENTRIES - 1}`]: { $exists: false } },
        { $push: { entries: { item: itemObjectId, startDate: start, endDate: end } } },
        { new: true, upsert: true },
      );
      if (updated) return getList(user._id);
    } catch (err) {
      if (err.code !== 11000) throw err; // the list exists but a condition failed (or two first adds raced): find out why
    }
    const current = await BorrowList.findOne({ user: user._id }).select('entries.item').lean();
    if (current?.entries.some((e) => String(e.item) === String(itemId))) {
      throw ApiError.conflict('This item is already in your borrow list. Change its dates instead.');
    }
    if ((current?.entries.length || 0) >= MAX_ENTRIES) {
      throw ApiError.conflict(`Your borrow list can hold up to ${MAX_ENTRIES} items`);
    }
  }
  throw ApiError.conflict('Your borrow list changed. Please try again.');
}

/** Req 48: change one entry's dates (same rules as adding). */
async function updateEntryDates(user, entryId, { startDate, endDate }) {
  const list = await BorrowList.findOne({ user: user._id, 'entries._id': entryId }, { 'entries.$': 1 }).lean();
  if (!list) throw ApiError.notFound('This item is not in your borrow list');
  const item = await loadBorrowableItem(user, list.entries[0].item);
  const { start, end } = checkDates(item, startDate, endDate);
  const res = await BorrowList.updateOne(
    { user: user._id, 'entries._id': entryId },
    { $set: { 'entries.$.startDate': start, 'entries.$.endDate': end } },
  );
  if (res.matchedCount === 0) throw ApiError.notFound('This item is not in your borrow list');
  return getList(user._id);
}

/** Req 47: remove one entry. */
async function removeEntry(user, entryId) {
  const res = await BorrowList.updateOne({ user: user._id, 'entries._id': entryId }, { $pull: { entries: { _id: entryId } } });
  if (res.modifiedCount === 0) throw ApiError.notFound('This item is not in your borrow list');
  return getList(user._id);
}

module.exports = {
  getList, addEntry, updateEntryDates, removeEntry,
  MAX_ENTRIES, HORIZON_DAYS, MAX_DAYS_WITHOUT_RULE,
};
