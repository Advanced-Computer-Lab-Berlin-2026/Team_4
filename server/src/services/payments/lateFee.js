// Member 2 - late fees (Req 77, 78). This step adds the READ side (Req 78: view charged late fees).
// Each late fee is a PaymentOperation with kind 'late_fee'; `outstandingMinor` holds the part that could not
// be paid yet because the wallet was too low (collected later from the next wallet credit).
const mongoose = require('mongoose');
const PaymentOperation = require('../../models/PaymentOperation');
const Reservation = require('../../models/Reservation');
require('../../models/Item'); // registered so Reservation.populate('item') works

const lateFeeFilter = (userId) => ({ user: new mongoose.Types.ObjectId(String(userId)), kind: 'late_fee', status: 'succeeded' });

/** Total still owed in late fees, in piastres. */
async function outstandingTotalMinor(userId) {
  const [row] = await PaymentOperation.aggregate([
    { $match: { ...lateFeeFilter(userId), outstandingMinor: { $gt: 0 } } },
    { $group: { _id: null, total: { $sum: '$outstandingMinor' } } },
  ]);
  return row ? row.total : 0;
}

/** One page of the user's late fees, newest first, with the item title and dates of each reservation. */
async function listLateFees(userId, { skip, limit }) {
  const filter = lateFeeFilter(userId);
  const [operations, total] = await Promise.all([
    PaymentOperation.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    PaymentOperation.countDocuments(filter),
  ]);

  const reservations = await Reservation.find({ _id: { $in: operations.map((op) => op.reference?.id) } })
    .select('item endDate returnedAt')
    .populate('item', 'title')
    .lean();
  const byId = new Map(reservations.map((r) => [String(r._id), r]));

  const items = operations.map((op) => {
    const reservation = byId.get(String(op.reference?.id));
    return {
      _id: op._id,
      reservationId: op.reference?.id,
      itemTitle: reservation?.item?.title || 'Item no longer available',
      dueAt: reservation?.endDate,
      returnedAt: reservation?.returnedAt,
      daysLate: op.result?.daysLate,
      lateFeeMinor: op.result?.lateFeeMinor ?? op.amountMinor,
      chargedMinor: op.result?.chargedMinor ?? op.amountMinor,
      outstandingMinor: op.outstandingMinor || 0,
      chargedAt: op.completedAt || op.createdAt,
    };
  });
  return { items, total };
}

module.exports = { outstandingTotalMinor, listLateFees };
