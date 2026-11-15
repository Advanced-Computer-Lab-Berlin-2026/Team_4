/**
 * BORROW LIST SERVICE - Owner: Member 5 - Requirements: 46, 47, 48
 * Contract: docs/sprint2/member5.md §3
 *
 * The list is a draft, not a hold on the items: checkout (Member 1, Req 49) re-checks everything.
 * Member 1's checkout reads and clears it only through getCheckoutEntries() and removeEntries().
 * Dates are whole days in UTC, the end date included (1-3 Dec = 3 days).
 */
const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const BorrowList = require('../../models/BorrowList');
const Item = require('../../models/Item');

const MAX_ENTRIES = 10;
const HORIZON_DAYS = 365;        // the start date must be within 1 year from today
const MAX_DAYS_WITHOUT_RULE = 365; // longest borrow when the item sets no maxBorrowDays
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const ITEM_FIELDS = 'title photos category depositAmount owner pickup rules isArchived moderationStatus';

const fieldError = (field, message) => ApiError.badRequest(message, [{ field, message }]);
const todayUtc = () => { const n = new Date(); return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()); };
const toDay = (date) => new Date(date).toISOString().slice(0, 10);
const daysBetween = (start, end) => Math.round((new Date(end) - new Date(start)) / DAY_MS) + 1; // inclusive

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
  if (end < start) throw fieldError('endDate', 'The end date must be on or after the start date');
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

/** Why an entry can't be checked out right now, or null. */
function problemOf(entry, item) {
  if (!item || item.isArchived || item.moderationStatus !== 'ok') {
    return ['unavailable', 'This item is no longer available. Remove it from your list.'];
  }
  if (new Date(entry.startDate).getTime() < todayUtc()) return ['dates_passed', 'These dates have passed. Choose new dates.'];
  const max = item.rules?.maxBorrowDays || MAX_DAYS_WITHOUT_RULE;
  if (daysBetween(entry.startDate, entry.endDate) > max) {
    return ['too_long', `This item can now be borrowed for at most ${max} day${max === 1 ? '' : 's'}. Shorten the dates.`];
  }
  return null;
}

const toEntryDto = (entry, item) => {
  const problem = problemOf(entry, item);
  return {
    _id: entry._id,
    startDate: toDay(entry.startDate),
    endDate: toDay(entry.endDate),
    days: daysBetween(entry.startDate, entry.endDate),
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

/** GET my list with item details and each entry's problem. A member without a list gets an empty one. */
async function getList(userId) {
  const list = await BorrowList.findOne({ user: userId }).lean();
  const entries = list?.entries || [];
  const items = await Item.find({ _id: { $in: entries.map((e) => e.item) } }).select(ITEM_FIELDS)
    .populate('category', 'name slug').populate('owner', 'name').lean();
  const byId = new Map(items.map((i) => [String(i._id), i]));
  return {
    _id: list?._id || null,
    max: MAX_ENTRIES,
    count: entries.length,
    entries: entries.map((e) => toEntryDto(e, byId.get(String(e.item)))),
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

// ---------- For Member 1's checkout (Req 49) ----------

/** Entries that can be checked out now (no problem): [{ entryId, itemId, startDate, endDate }] as Dates. */
async function getCheckoutEntries(userId, { session } = {}) {
  const list = await BorrowList.findOne({ user: userId }).session(session || null).lean();
  if (!list) return [];
  const items = await Item.find({ _id: { $in: list.entries.map((e) => e.item) } }).select(ITEM_FIELDS).session(session || null).lean();
  const byId = new Map(items.map((i) => [String(i._id), i]));
  return list.entries
    .filter((e) => !problemOf(e, byId.get(String(e.item))))
    .map((e) => ({ entryId: e._id, itemId: e.item, startDate: e.startDate, endDate: e.endDate }));
}

/**
 * Remove only the given entries (the lines that were checked out), inside the caller's transaction.
 * Returns how many entries were actually removed (not "documents modified": the list's updatedAt changes on every save).
 */
async function removeEntries(userId, entryIds, { session } = {}) {
  const ids = entryIds.map((id) => new mongoose.Types.ObjectId(id));
  const before = await BorrowList.findOneAndUpdate(
    { user: userId, 'entries._id': { $in: ids } },
    { $pull: { entries: { _id: { $in: ids } } } },
    { new: false, projection: { 'entries._id': 1 }, session: session || null },
  ).lean();
  if (!before) return 0;
  const wanted = new Set(ids.map(String));
  return before.entries.filter((e) => wanted.has(String(e._id))).length;
}

module.exports = {
  getList, addEntry, updateEntryDates, removeEntry, getCheckoutEntries, removeEntries,
  MAX_ENTRIES, HORIZON_DAYS, MAX_DAYS_WITHOUT_RULE,
};
