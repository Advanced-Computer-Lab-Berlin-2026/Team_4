/**
 * RESERVATION LIFECYCLE (read side) - Owner: Member 5 - Requirements: 53, 54 (and the data for 56-60, 74, 75)
 * Contract: docs/sprint2/member5.md §4. Read only: every change to a reservation goes through Member 1's
 * reservationCommands (docs/SPRINT2_CONTRACT.md); this file never writes.
 * Dates: UTC midnight, the end date is the return day and is not counted (half-open [startDate, endDate)).
 */
const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const { Reservation, DamageReport } = require('../../models');
const { lifecycleFlags } = require('./returnTiming'); // Member 1's labels for stuck reservations
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

/** Which buttons the current user may use right now. Same rules as Member 1's commands; the command still decides. */
function actionsFor(r, user, { hasDamageCase }, now) {
  const isLender = String(r.lender?._id || r.lender) === String(user._id) && user.role === 'member' && user.lenderStatus === 'verified';
  const isBorrower = String(r.borrower?._id || r.borrower) === String(user._id);
  const flags = lifecycleFlags(r, now);
  const active = r.status === 'active';
  const extensionPending = flags.extensionStatus === 'pending';
  const depositHeld = !(r.deposit?.amount > 0) || r.deposit?.status === 'held';
  return {
    approve: isLender && r.status === 'pending' && r.endDate > now,
    reject: isLender && r.status === 'pending',
    pickup: isLender && r.status === 'confirmed' && r.startDate <= now && r.endDate > now,
    returnGood: isLender && active && !hasDamageCase && r.returnCondition !== 'damaged' && depositHeld,
    reportDamage: isLender && active && !hasDamageCase,
    requestExtension: isBorrower && active && now < r.endDate && !extensionPending,
    cancelExtension: isBorrower && active && extensionPending,
    decideExtension: isLender && active && extensionPending,
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
    actions: actionsFor(r, user, extra, now),
    createdAt: r.createdAt,
  };
}

const populate = (q) => q
  .populate({ path: 'item', select: 'title photos category', populate: { path: 'category', select: 'name slug' } })
  .populate('borrower', 'name')
  .populate('lender', 'name');

async function damageCaseIds(ids) {
  if (!ids.length) return new Set();
  const cases = await DamageReport.find({ reservation: { $in: ids } }).select('reservation').lean();
  return new Set(cases.map((c) => String(c.reservation)));
}

/**
 * Req 53, 54: my reservations as the borrower, filtered and paginated.
 * Order: pending/upcoming/active first, soonest start first; then the rest, most recent start first.
 */
async function listMine(user, query = {}) {
  const filters = parseFilters(query);
  const pg = parsePagination(query);
  const match = { borrower: new mongoose.Types.ObjectId(String(user._id)), ...overlap(filters) };
  if (filters.status !== 'all') match.status = STATUS_FILTERS[filters.status];

  const [ordered, total] = await Promise.all([
    Reservation.aggregate([
      { $match: match },
      { $addFields: { _open: { $in: ['$status', OPEN] }, _ts: { $toLong: '$startDate' } } },
      { $addFields: { _key: { $cond: ['$_open', '$_ts', { $multiply: ['$_ts', -1] }] } } },
      { $sort: { _open: -1, _key: 1, _id: 1 } },
      { $skip: pg.skip },
      { $limit: pg.limit },
      { $project: { _id: 1 } },
    ]),
    Reservation.countDocuments(match),
  ]);
  const ids = ordered.map((d) => d._id);
  const docs = await populate(Reservation.find({ _id: { $in: ids } })).lean();
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  const damaged = await damageCaseIds(ids);
  const now = new Date();
  const items = ids.map((id) => byId.get(String(id))).filter(Boolean)
    .map((r) => toDto(r, user, { hasDamageCase: damaged.has(String(r._id)) }, now));
  return paginated(items, total, pg);
}

/** One reservation for its borrower or its lender. Anyone else gets 404 so its existence isn't revealed. */
async function getOne(user, id) {
  const r = await populate(Reservation.findOne({
    _id: id, $or: [{ borrower: user._id }, { lender: user._id }],
  })).lean();
  if (!r) throw ApiError.notFound('Reservation not found');
  const damaged = await damageCaseIds([r._id]);
  return toDto(r, user, { hasDamageCase: damaged.has(String(r._id)) }, new Date());
}

module.exports = { listMine, getOne, parseFilters, STATUS_FILTERS };
