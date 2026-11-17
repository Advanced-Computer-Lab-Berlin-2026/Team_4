const mongoose = require('mongoose');
const Reservation = require('../../models/Reservation');
const DamageReport = require('../../models/DamageReport');
const ApiError = require('../../utils/ApiError');

const DAY = 86400000;
const DAMAGE_STATUSES = ['open', 'decided', 'disputed', 'resolved'];
const OUTCOME_LABELS = {
  pending: 'Pending decision',
  full_refund: 'Full refund',
  partial_forfeit: 'Partial forfeiture',
  full_forfeit: 'Full forfeiture',
  no_deposit: 'No deposit',
};

function optionalText(value, name) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string' || value.length > 150) throw ApiError.badRequest('Invalid ' + name);
  return value.trim();
}

function literalSearch(input) {
  return { $regex: input.replace(/[.*+?^$\x7b\x7d()|[\]\\]/g, '\\$&'), $options: 'i' };
}

function parseDay(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw ApiError.badRequest(label + ' must be YYYY-MM-DD');
  }
  const date = new Date(value + 'T00:00:00.000Z');
  if (!Number.isFinite(+date) || date.toISOString().slice(0, 10) !== value) {
    throw ApiError.badRequest('Invalid ' + label);
  }
  return date;
}

function buildDateWindow({ month, startDate, endDate }) {
  const from = startDate ? parseDay(startDate, 'startDate') : null;
  const through = endDate ? parseDay(endDate, 'endDate') : null;
  if (from && through && from > through) throw ApiError.badRequest('End date is before the start date');
  const fromMonth = month ? parseDay(typeof month === 'string' ? month + '-01' : null, 'month') : null;
  let toMonth = null;
  if (fromMonth) {
    toMonth = new Date(fromMonth);
    toMonth.setUTCMonth(toMonth.getUTCMonth() + 1);
  }
  const lower = from && fromMonth ? new Date(Math.max(+from, +fromMonth)) : (from || fromMonth);
  const to = through ? new Date(+through + DAY) : null;
  const upper = to && toMonth ? new Date(Math.min(+to, +toMonth)) : (to || toMonth);
  return lower || upper ? { ...(lower && { $gte: lower }), ...(upper && { $lt: upper }) } : null;
}

function inStatus(statuses) {
  return { $sum: { $cond: [{ $in: ['$status', statuses] }, 1, 0] } };
}

async function queryUsageReport({ month, itemId, item, category, startDate, endDate } = {}) {
  const match = {};
  const dateWindow = buildDateWindow({ month, startDate, endDate });
  if (dateWindow) match.startDate = dateWindow;
  if (itemId != null && itemId !== '') {
    if (typeof itemId !== 'string' || !mongoose.isObjectIdOrHexString(itemId)) {
      throw ApiError.badRequest('Invalid item ID');
    }
    match.item = new mongoose.Types.ObjectId(itemId);
  }

  const itemFilter = optionalText(item, 'item');
  const categoryFilter = optionalText(category, 'category');
  const pipeline = [
    { $match: match },
    { $lookup: { from: 'items', localField: 'item', foreignField: '_id', as: 'itemDoc' } },
    { $unwind: { path: '$itemDoc', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'categories', localField: 'itemDoc.category', foreignField: '_id', as: 'catDoc' } },
    { $unwind: { path: '$catDoc', preserveNullAndEmptyArrays: true } },
  ];
  if (itemFilter) pipeline.push({ $match: mongoose.isObjectIdOrHexString(itemFilter)
    ? { item: new mongoose.Types.ObjectId(itemFilter) }
    : { 'itemDoc.title': literalSearch(itemFilter) } });
  if (categoryFilter) pipeline.push({ $match: mongoose.isObjectIdOrHexString(categoryFilter)
    ? { 'itemDoc.category': new mongoose.Types.ObjectId(categoryFilter) }
    : { $or: [{ 'catDoc.name': literalSearch(categoryFilter) }, { 'catDoc.slug': categoryFilter }] } });

  pipeline.push({
    $group: {
      _id: {
        month: { $dateToString: { format: '%Y-%m', date: '$startDate', timezone: 'UTC' } },
        itemId: '$item',
        itemTitle: { $ifNull: ['$itemDoc.title', 'Unknown listing'] },
        category: { $ifNull: ['$catDoc.name', 'Uncategorized'] },
      },
      totalReservations: { $sum: 1 },
      completedCount: inStatus(['completed']),
      activeOrConfirmedCount: inStatus(['active', 'confirmed']),
      cancelledOrRejectedCount: inStatus(['cancelled', 'rejected']),
      totalDepositVolume: { $sum: { $ifNull: ['$deposit.amount', 0] } },
    },
  }, {
    $project: {
      _id: 0, month: '$_id.month', itemId: { $toString: '$_id.itemId' },
      itemTitle: '$_id.itemTitle', category: '$_id.category', totalReservations: 1, completedCount: 1,
      activeOrConfirmedCount: 1, cancelledOrRejectedCount: 1,
      totalDepositVolume: { $round: ['$totalDepositVolume', 2] },
    },
  }, { $sort: { month: -1, category: 1, itemTitle: 1, itemId: 1 } });

  const items = await Reservation.aggregate(pipeline);
  const summary = { totalReservations: 0, completedCount: 0, activeOrConfirmedCount: 0,
    cancelledOrRejectedCount: 0, totalDepositVolume: 0 };
  const byCategory = new Map();
  for (const row of items) {
    for (const key of Object.keys(summary)) summary[key] += row[key];
    const key = row.month + ':' + row.category;
    const group = byCategory.get(key) ?? { month: row.month, category: row.category, totalReservations: 0 };
    group.totalReservations += row.totalReservations;
    byCategory.set(key, group);
  }
  summary.totalDepositVolume = Number(summary.totalDepositVolume.toFixed(2));
  return { summary, items, categories: [...byCategory.values()], total: items.length };
}

function damageRow(report) {
  const reservation = report.reservation;
  const heldDeposit = reservation?.deposit?.amount ?? null;
  const forfeitedAmount = report.resolution?.finalForfeitAmount ?? report.decision?.forfeitAmount ?? null;
  const pending = forfeitedAmount == null;
  let outcome = 'pending';
  if (!pending) {
    if (heldDeposit == null) outcome = forfeitedAmount === 0 ? 'full_refund' : 'partial_forfeit';
    else if (heldDeposit === 0) outcome = 'no_deposit';
    else if (forfeitedAmount === 0) outcome = 'full_refund';
    else if (forfeitedAmount >= heldDeposit) outcome = 'full_forfeit';
    else outcome = 'partial_forfeit';
  }
  return {
    caseId: String(report._id), reservationId: reservation?._id ? String(reservation._id) : '',
    itemTitle: report.item?.title || reservation?.item?.title || 'Unknown listing',
    borrowerName: report.borrower?.name || reservation?.borrower?.name || 'Unknown',
    lenderName: reservation?.lender?.name || report.reportedBy?.name || 'Unknown',
    status: report.status,
    isDisputed: Boolean(report.dispute?.reason || report.dispute?.at || ['disputed', 'resolved'].includes(report.status)),
    resolution: OUTCOME_LABELS[outcome], outcome,
    heldDeposit, forfeitedAmount,
    refundedAmount: pending || heldDeposit == null ? null : Math.max(0, Number((heldDeposit - forfeitedAmount).toFixed(2))),
    createdAt: report.createdAt?.toISOString().slice(0, 10) || '',
  };
}

async function queryDamageReport({ status, resolution, startDate, endDate } = {}) {
  if (status && !DAMAGE_STATUSES.includes(status)) throw ApiError.badRequest('Invalid damage status');
  if (resolution && (typeof resolution !== 'string' || !Object.hasOwn(OUTCOME_LABELS, resolution))) throw ApiError.badRequest('Invalid damage resolution');
  const dateWindow = buildDateWindow({ startDate, endDate });
  const query = { ...(status && { status }), ...(dateWindow && { createdAt: dateWindow }) };
  // Project only report data. Condition photos and private file paths never enter the response.
  const docs = await DamageReport.find(query)
    .select('reservation item borrower reportedBy status dispute.reason dispute.at decision.forfeitAmount resolution.finalForfeitAmount createdAt')
    .populate({ path: 'reservation', select: 'item borrower lender deposit.amount', populate: [
      { path: 'item', select: 'title' }, { path: 'borrower', select: 'name' }, { path: 'lender', select: 'name' },
    ] })
    .populate('item', 'title').populate('borrower', 'name').populate('reportedBy', 'name')
    .sort({ createdAt: -1, _id: -1 }).lean();
  const items = docs.map(damageRow).filter((row) => !resolution || row.outcome === resolution);
  const summary = {
    totalCases: items.length,
    disputedCases: items.filter((row) => row.isDisputed).length,
    resolvedCases: items.filter((row) => ['decided', 'resolved'].includes(row.status)).length,
    totalForfeited: Number(items.reduce((total, row) => total + (row.forfeitedAmount ?? 0), 0).toFixed(2)),
  };
  return { summary, items, total: items.length };
}

module.exports = { queryUsageReport, queryDamageReport };
