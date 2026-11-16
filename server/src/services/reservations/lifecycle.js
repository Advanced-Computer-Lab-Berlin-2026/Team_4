/**
 * RESERVATION LIFECYCLE (read side) - Owner: Member 5 - Requirements: 53, 54, and the lender's list for 56-60, 74, 75
 * Contract: docs/sprint2/member5.md §4-§5. This file never writes a reservation itself: every change goes through
 * Member 1's reservationCommands (docs/SPRINT2_CONTRACT.md), called once, and its side effects (refunds, events) are
 * never repeated here.
 * Dates: UTC midnight, the end date is the return day and is not counted (half-open [startDate, endDate)).
 */
const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const { Reservation, DamageReport } = require('../../models');
const { lifecycleFlags } = require('./returnTiming'); // Member 1's labels for stuck reservations
const reservationCommands = require('./reservationCommands'); // Member 1: the only writer of reservation status
const { features } = require('../sprint2/bootstrap'); // Member 1's loader for other members' optional modules
const { getAvailability } = require('./availability'); // Member 1: bookings and holds on an item (read only)
const { parsePagination, paginated } = require('../../utils/pagination');

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const OPEN = ['pending', 'confirmed', 'active'];
const STATUS_FILTERS = { // query value -> stored status (Req 54)
  pending: 'pending', upcoming: 'confirmed', active: 'active', completed: 'completed', cancelled: 'cancelled', rejected: 'rejected',
};
const fieldError = (field, message) => ApiError.badRequest(message, [{ field, message }]);
const toDay = (date) => (date ? new Date(date).toISOString().slice(0, 10) : null);

/** "2026-12-01" -> Date at UTC midnight, or null if it isn't a real calendar date. */
function parseDay(value) {
  if (typeof value !== 'string' || !DATE_REGEX.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

/** Validated filters from the query string. Throws 400 with the field that is wrong. */
function parseFilters(query = {}) {
  const status = query.status === undefined || query.status === '' ? 'all' : query.status;
  if (status !== 'all' && !STATUS_FILTERS[status]) {
    throw fieldError('status', 'Choose a status: all, pending, upcoming, active, completed, cancelled or rejected');
  }
  const from = query.from ? parseDay(query.from) : null;
  if (query.from && !from) throw fieldError('from', 'Choose a valid "from" date (YYYY-MM-DD)');
  const to = query.to ? parseDay(query.to) : null;
  if (query.to && !to) throw fieldError('to', 'Choose a valid "to" date (YYYY-MM-DD)');
  if (from && to && to < from) throw fieldError('to', 'The "to" date must be on or after the "from" date');
  return { status, from, to };
}

/**
 * Mongo filter for "reservations whose borrowed days overlap the chosen days".
 * The chosen days are inclusive (from 1 Dec to 3 Dec = the 1st, 2nd and 3rd); a reservation uses [start, end).
 */
function overlap({ from, to }) {
  const f = {};
  if (to) f.startDate = { $lt: new Date(to.getTime() + DAY_MS) };
  if (from) f.endDate = { $gt: from };
  return f;
}

/** The item checks Member 1's `confirm` and extension `approve` repeat (bookingRules.loadBookableItem): item still
 * public, the borrower's trust score still high enough, the length (up to `endDate`) within the item's maximum. */
function canStillBook(r, endDate = r.endDate) {
  const item = r.item && typeof r.item === 'object' && r.item.title !== undefined ? r.item : null;
  if (!item || item.isArchived || item.moderationStatus !== 'ok') return false;
  const minTrust = Number(item.rules?.minTrustScore) || 0;
  if (typeof r.borrower?.trustScore === 'number' && r.borrower.trustScore < minTrust) return false;
  const max = Number(item.rules?.maxBorrowDays) || 0;
  return !max || (new Date(endDate) - new Date(r.startDate)) / DAY_MS <= max;
}

/** Which buttons the current user may use right now. Same rules as Member 1's commands; the command still decides. */
function actionsFor(r, user, { hasDamageCase, approveBlocked, extensionBlocked }, now) {
  const isLender = String(r.lender?._id || r.lender) === String(user._id) && user.role === 'member' && user.lenderStatus === 'verified';
  const isBorrower = String(r.borrower?._id || r.borrower) === String(user._id);
  const flags = lifecycleFlags(r, now);
  const active = r.status === 'active';
  const extensionPending = flags.extensionStatus === 'pending';
  const depositHeld = !(r.deposit?.amount > 0) || r.deposit?.status === 'held';
  return {
    approve: isLender && r.status === 'pending' && r.endDate > now && canStillBook(r) && !approveBlocked, // Member 1's confirm re-checks these
    reject: isLender && r.status === 'pending' && depositHeld, // Member 1's reject refunds a held deposit
    pickup: isLender && r.status === 'confirmed' && r.startDate <= now && r.endDate > now,
    returnGood: isLender && active && !hasDamageCase && r.returnCondition !== 'damaged' && depositHeld,
    reportDamage: isLender && active && !hasDamageCase && depositHeld, // Member 1's returnDamaged needs the deposit held
    requestExtension: isBorrower && active && now < r.endDate && !extensionPending,
    cancelExtension: isBorrower && active && extensionPending,
    decideExtension: isLender && active && extensionPending,
    // Member 1's extension approve re-checks the item, the total length and that the extra days are free.
    approveExtension: isLender && active && extensionPending && !!r.extension?.requestedEndDate
      && canStillBook(r, r.extension.requestedEndDate) && !extensionBlocked,
  };
}

function toDto(r, user, extra, now) {
  const flags = lifecycleFlags(r, now);
  const item = r.item && typeof r.item === 'object' && r.item.title !== undefined ? r.item : null;
  const person = (p) => (p && p.name !== undefined ? { _id: p._id, name: p.name } : null);
  return {
    _id: r._id,
    status: r.status,
    startDate: toDay(r.startDate),
    endDate: toDay(r.endDate),
    days: Math.round((new Date(r.endDate) - new Date(r.startDate)) / DAY_MS),
    item: item ? {
      _id: item._id, title: item.title, photo: item.photos?.[0]?.url || null,
      available: !item.isArchived && item.moderationStatus === 'ok', // public item page exists
      maxBorrowDays: Number(item.rules?.maxBorrowDays) || null,
      category: item.category ? { _id: item.category._id, name: item.category.name, slug: item.category.slug } : null,
    } : null,
    borrower: person(r.borrower),
    lender: person(r.lender),
    role: String(r.borrower?._id || r.borrower) === String(user._id) ? 'borrower' : 'lender',
    deposit: { amount: r.deposit?.amount ?? 0, status: r.deposit?.status || 'none' },
    fulfilment: { method: r.fulfilment?.method || 'pickup', deliveryStatus: r.fulfilment?.deliveryStatus || 'none' },
    pickedUpAt: r.pickedUpAt || null,
    returnedAt: r.returnedAt || null,
    completedAt: r.completedAt || null,
    returnCondition: r.returnCondition || null,
    hasDamageCase: !!extra.hasDamageCase,
    lateFee: r.lateFee || 0,
    rejectionReason: r.rejectionReason || null,
    cancellation: r.status === 'cancelled' ? { at: r.cancellation?.at || null, reason: r.cancellation?.reason || null } : null,
    extension: {
      requestId: r.extension?.requestId || null,
      status: flags.extensionStatus,
      requestedEndDate: toDay(r.extension?.requestedEndDate),
      decidedAt: r.extension?.decidedAt || null,
    },
    flags: { approvalOverdue: flags.approvalOverdue, pickupMissed: flags.pickupMissed, returnOverdue: flags.returnOverdue },
    lateFeeIfReturnedNow: r.status === 'active' ? lateFeeNow(r, now) : null,
    actions: actionsFor(r, user, extra, now),
    createdAt: r.createdAt,
  };
}

/**
 * The late fee a return right now would cost, from Member 2's calculateLateFee (pure arithmetic, no money moves):
 * EGP number, 0 within his grace time or without a deposit, or null while his payment module isn't installed.
 */
function lateFeeNow(r, now) {
  const calc = features().payment?.calculateLateFee;
  if (typeof calc !== 'function') return null;
  try {
    const { feeMinor } = calc({ depositMinor: Math.round((Number(r.deposit?.amount) || 0) * 100), endDate: r.endDate, returnedAt: now });
    return Number.isFinite(feeMinor) ? feeMinor / 100 : null;
  } catch {
    return null;
  }
}

const populate = (q) => q
  .populate({ path: 'item', select: 'title photos category isArchived moderationStatus rules', populate: { path: 'category', select: 'name slug' } })
  .populate('borrower', 'name trustScore') // trustScore is only used for the approve rule, never sent
  .populate('lender', 'name');

/** True when [start, end) of this item overlaps someone else's booking or hold (Member 1's getAvailability). */
async function overlapsOthers(r, start, end) {
  const itemId = r.item?._id || r.item;
  if (!itemId || !(new Date(end) > new Date(start))) return false;
  try {
    const { available } = await getAvailability(itemId, { startDate: new Date(start), endDate: new Date(end) }, { excludeReservationId: String(r._id) });
    return !available;
  } catch {
    return false; // Member 1's command decides anyway
  }
}

/** Per booking: what the buttons need beyond the booking itself (damage case, overlaps Member 1 would refuse). */
async function extrasFor(r, damaged, user, now) {
  const isLender = String(r.lender?._id || r.lender) === String(user._id);
  const pendingExt = r.status === 'active' && r.extension?.status === 'pending' && r.endDate > now;
  return {
    hasDamageCase: damaged.has(String(r._id)),
    approveBlocked: isLender && r.status === 'pending' ? await overlapsOthers(r, r.startDate, r.endDate) : false,
    extensionBlocked: isLender && pendingExt ? await overlapsOthers(r, r.endDate, r.extension.requestedEndDate) : false,
  };
}

async function damageCaseIds(ids) {
  if (!ids.length) return new Set();
  const cases = await DamageReport.find({ reservation: { $in: ids } }).select('reservation').lean();
  return new Set(cases.map((c) => String(c.reservation)));
}

/** Ids of one page of matches. Default order: pending/upcoming/active first, soonest start first; then the rest,
 * most recent start first. `oldestFirst` (the lender's "needs my answer" list): oldest request first. */
async function pageOfIds(match, pg, { oldestFirst = false } = {}) {
  const sortStages = oldestFirst
    ? [{ $sort: { createdAt: 1, _id: 1 } }]
    : [
      { $addFields: { _open: { $in: ['$status', OPEN] }, _ts: { $toLong: '$startDate' } } },
      { $addFields: { _key: { $cond: ['$_open', '$_ts', { $multiply: ['$_ts', -1] }] } } },
      { $sort: { _open: -1, _key: 1, _id: 1 } },
    ];
  const [ordered, total] = await Promise.all([
    Reservation.aggregate([{ $match: match }, ...sortStages, { $skip: pg.skip }, { $limit: pg.limit }, { $project: { _id: 1 } }]),
    Reservation.countDocuments(match),
  ]);
  return { ids: ordered.map((d) => d._id), total };
}

/**
 * Req 53, 54: my reservations as the borrower, filtered and paginated.
 */
async function listMine(user, query = {}) {
  const filters = parseFilters(query);
  const pg = parsePagination(query);
  const match = { borrower: new mongoose.Types.ObjectId(String(user._id)), ...overlap(filters) };
  if (filters.status !== 'all') match.status = STATUS_FILTERS[filters.status];
  const { ids, total } = await pageOfIds(match, pg);
  return paginated(await toDtos(ids, user), total, pg);
}

/** Pending requests, and active bookings with an extension request that hasn't expired: what waits for the lender. */
const waitingFilter = (now) => ({
  $or: [
    { status: 'pending' },
    { status: 'active', 'extension.status': 'pending', endDate: { $gt: now } },
  ],
});

/**
 * Req 56-60, 74, 75 (read side): bookings of my items, for the verified lender.
 * Extra query: item=<my item id>, needsAction=true (only what waits for my answer, oldest first).
 * Also returns `waiting`: { requests, extensions } for all my items, whatever the filters.
 */
async function listLending(user, query = {}) {
  const filters = parseFilters(query);
  const pg = parsePagination(query);
  const needsAction = query.needsAction === 'true';
  if (query.needsAction !== undefined && query.needsAction !== '' && !['true', 'false'].includes(query.needsAction)) {
    throw fieldError('needsAction', 'needsAction must be true or false');
  }
  if (query.item && !mongoose.isValidObjectId(query.item)) throw fieldError('item', 'Choose a valid item');
  const lender = new mongoose.Types.ObjectId(String(user._id));
  const now = new Date();
  const match = { lender, ...overlap(filters) };
  if (query.item) match.item = new mongoose.Types.ObjectId(String(query.item));
  if (filters.status !== 'all') match.status = STATUS_FILTERS[filters.status];
  const finalMatch = needsAction ? { $and: [match, waitingFilter(now)] } : match;

  const [{ ids, total }, requests, extensions] = await Promise.all([
    pageOfIds(finalMatch, pg, { oldestFirst: needsAction }),
    Reservation.countDocuments({ lender, status: 'pending' }),
    Reservation.countDocuments({ lender, status: 'active', 'extension.status': 'pending', endDate: { $gt: now } }),
  ]);
  return { ...paginated(await toDtos(ids, user), total, pg), waiting: { requests, extensions } };
}

/** My items that have at least one booking (archived included), for the lender's item filter. */
async function lendingItems(user) {
  const lender = new mongoose.Types.ObjectId(String(user._id));
  const rows = await Reservation.aggregate([
    { $match: { lender } },
    { $group: { _id: '$item', bookings: { $sum: 1 } } },
    { $lookup: { from: 'items', localField: '_id', foreignField: '_id', as: 'item' } },
    { $unwind: '$item' }, // deleted items drop out: they can't be filtered by a title
    { $match: { 'item.owner': lender } },
    { $project: { _id: '$item._id', title: '$item.title', isArchived: '$item.isArchived', bookings: 1 } },
    { $sort: { title: 1, _id: 1 } },
  ]);
  return rows;
}

async function toDtos(ids, user) {
  const docs = await populate(Reservation.find({ _id: { $in: ids } })).lean();
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  const damaged = await damageCaseIds(ids);
  const now = new Date();
  const rows = ids.map((id) => byId.get(String(id))).filter(Boolean);
  const extras = await Promise.all(rows.map((r) => extrasFor(r, damaged, user, now)));
  return rows.map((r, n) => toDto(r, user, extras[n], now));
}

/** One reservation for its borrower or its lender. Anyone else gets 404 so its existence isn't revealed. */
async function getOne(user, id) {
  const r = await populate(Reservation.findOne({
    _id: id, $or: [{ borrower: user._id }, { lender: user._id }],
  })).lean();
  if (!r) throw ApiError.notFound('Reservation not found');
  const damaged = await damageCaseIds([r._id]);
  const now = new Date();
  return toDto(r, user, await extrasFor(r, damaged, user, now), now);
}

const MAX_REASON = 500;

/**
 * Req 56: the lender approves or declines a pending request through Member 1's command, then gets the updated booking.
 * Approve = his `confirm` (re-checks the item, the borrower and the dates). Decline = his `reject` (optional reason,
 * refunds the held deposit and any delivery fee in full through Member 2). Pressing twice changes nothing twice.
 */
async function decide(user, id, decision, body = {}) {
  let reason;
  if (decision === 'reject' && body.reason !== undefined && body.reason !== null) {
    if (typeof body.reason !== 'string') throw fieldError('reason', 'The reason must be text');
    const trimmed = body.reason.trim();
    if (trimmed.length > MAX_REASON) throw fieldError('reason', `Keep the reason under ${MAX_REASON} characters`);
    reason = trimmed || undefined;
  }
  await reservationCommands.transition({
    actorId: user._id, reservationId: id, action: decision === 'approve' ? 'confirm' : 'reject', expectedStatus: 'pending', reason,
  });
  return getOne(user, id);
}

/** Req 59: the lender marks the item as picked up (Member 1's `pickup`: confirmed only, within the booked days). */
async function markPickedUp(user, id) {
  await reservationCommands.transition({ actorId: user._id, reservationId: id, action: 'pickup', expectedStatus: 'confirmed' });
  return getOne(user, id);
}

/**
 * Req 60: the lender records a return in good condition (Member 1's `return`: completes the booking, releases the
 * deposit and applies any late fee through Member 2, recalculates trust, sends events). Refused while a damage case exists.
 */
async function markReturned(user, id) {
  await reservationCommands.transition({ actorId: user._id, reservationId: id, action: 'return', expectedStatus: 'active' });
  return getOne(user, id);
}

const requestIdOf = (body) => {
  const id = body?.requestId;
  if (typeof id !== 'string' || !mongoose.isValidObjectId(id)) throw fieldError('requestId', 'This extension request is missing or invalid. Reload the page.');
  return id;
};

/**
 * Req 74: the borrower asks for a later return date (Member 1's `extend` request). Before calling it, two checks give a
 * clear answer at once instead of an approval that is bound to fail later: the new total length must fit the item's
 * maximum, and the extra days must be free (Member 1's getAvailability, this booking excluded). His command still
 * re-checks everything when the lender approves.
 */
async function requestExtension(user, id, body = {}) {
  const newEnd = parseDay(body.requestedEndDate);
  if (!newEnd) throw fieldError('requestedEndDate', 'Choose a valid new return date (YYYY-MM-DD)');
  const r = await Reservation.findOne({ _id: id, borrower: user._id }).populate('item', 'rules').lean();
  if (r && r.status === 'active' && r.endDate > new Date()) {
    if (newEnd <= r.endDate) throw fieldError('requestedEndDate', 'Choose a date after the current return date');
    const max = Number(r.item?.rules?.maxBorrowDays) || 0;
    const total = Math.round((newEnd - r.startDate) / DAY_MS);
    if (max && total > max) {
      throw fieldError('requestedEndDate', `This item can be borrowed for at most ${max} day${max === 1 ? '' : 's'} in total. Choose an earlier date.`);
    }
    const { available } = r.item ? await getAvailability(r.item._id, { startDate: r.endDate, endDate: newEnd }, { excludeReservationId: id }) : { available: true };
    if (!available) throw ApiError.conflict('Someone has booked part of these extra days. Choose an earlier date.');
  }
  await reservationCommands.extend({ actorId: user._id, reservationId: id, action: 'request', endDate: toDay(newEnd) });
  return getOne(user, id);
}

/** Req 74: the borrower withdraws their pending request. Req 75: the lender approves or declines it. */
async function answerExtension(user, id, action, body = {}) {
  await reservationCommands.extend({ actorId: user._id, reservationId: id, action, requestId: requestIdOf(body) });
  return getOne(user, id);
}

module.exports = { listMine, listLending, lendingItems, getOne, decide, markPickedUp, markReturned, requestExtension, answerExtension, parseFilters, STATUS_FILTERS, MAX_REASON };
