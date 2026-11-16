// Member 2 - late fees (Req 77 charge, Req 78 view).
//   calculateLateFee - pure maths from the policy in config.js
//   applyLateFee     - called by M1's return command for a late return: charge what the wallet can pay now,
//                      record the rest as OUTSTANDING (PaymentOperation.outstandingMinor) - never skipped
//   collectOutstanding - runs after every wallet credit (wallet.js hook) and takes what is still owed
// Each late fee is a PaymentOperation with kind 'late_fee'.
const mongoose = require('mongoose');
const PaymentOperation = require('../../models/PaymentOperation');
const Reservation = require('../../models/Reservation');
const ApiError = require('../../utils/ApiError');
const wallet = require('./wallet');
const audit = require('./audit');
const policy = require('./config');
const { runOperation } = require('./operation');
const { toMinor } = require('./money');
const { payLender } = require('./refund');
require('../../models/Item'); // registered so Reservation.populate('item') works

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * Late fee for one return (no money moves).
 *   within graceMinutes after the deadline -> 0
 *   otherwise percentOfDepositPerDay x every STARTED day late, capped at capPercentOfDeposit of the deposit.
 */
function calculateLateFee({ depositMinor, endDate, returnedAt }) {
  const { graceMinutes, percentOfDepositPerDay, capPercentOfDeposit } = policy.lateFee;
  const lateMs = new Date(returnedAt) - new Date(endDate);
  if (Number.isNaN(lateMs)) throw ApiError.badRequest('endDate and returnedAt must be valid dates');

  const minutesLate = Math.max(0, Math.round(lateMs / MINUTE_MS));
  if (lateMs <= graceMinutes * MINUTE_MS || depositMinor <= 0) {
    return { feeMinor: 0, daysLate: 0, minutesLate, capped: false };
  }
  const daysLate = Math.ceil(lateMs / DAY_MS);
  const uncappedMinor = Math.round((depositMinor * percentOfDepositPerDay * daysLate) / 100);
  const capMinor = Math.round((depositMinor * capPercentOfDeposit) / 100);
  return { feeMinor: Math.min(uncappedMinor, capMinor), daysLate, minutesLate, capped: uncappedMinor > capMinor };
}

/**
 * applyLateFee(input, session) -> { feeMinor, chargedMinor, outstandingMinor, daysLate }   (Req 77)
 * input: { reservationId, userId, reference, currency, idempotencyKey, returnedAt, endDate }
 */
async function applyLateFee(input, session) {
  const { reservationId, userId, currency, idempotencyKey, returnedAt, endDate } = input || {};
  if (!mongoose.isValidObjectId(reservationId) || !mongoose.isValidObjectId(userId)) {
    throw ApiError.badRequest('reservationId and userId must be valid ids');
  }
  const reservation = await Reservation.findById(reservationId).select('deposit.amount lender').session(session || null).lean();
  if (!reservation) throw ApiError.notFound('Reservation not found');

  const depositMinor = toMinor(reservation.deposit?.amount);
  const calc = calculateLateFee({ depositMinor, endDate, returnedAt });
  const reference = { type: 'reservation', id: reservationId };

  return runOperation({ idempotencyKey, kind: 'late_fee', purpose: 'late_fee', userId, reference, amountMinor: calc.feeMinor, currency }, async ({ session: s, operation }) => {
    // Charge what the wallet holds now; the rest stays outstanding and is collected from the next credit.
    const balanceMinor = await wallet.getBalanceMinor(userId, { session: s });
    const chargedMinor = Math.min(calc.feeMinor, balanceMinor);
    const outstandingMinor = calc.feeMinor - chargedMinor;
    if (chargedMinor > 0) {
      await wallet.applyChange({
        userId, deltaMinor: -chargedMinor, type: 'late_fee', reference, operationId: operation._id,
        note: `Late fee: ${calc.daysLate} day${calc.daysLate === 1 ? '' : 's'} late`,
      }, { session: s });
    }
    if (outstandingMinor > 0) {
      await PaymentOperation.updateOne({ _id: operation._id }, { $set: { outstandingMinor } }, { session: s });
    }
    const paidToLenderMinor = await payLender({ reservationId, amountMinor: chargedMinor, operationId: operation._id, note: 'Late fee received' }, s);

    const { graceMinutes, percentOfDepositPerDay, capPercentOfDeposit } = policy.lateFee;
    await audit.record({
      action: 'late_fee_applied',
      reservationId,
      userId,
      amountMinor: calc.feeMinor,
      operationId: operation._id,
      inputs: { endDate, returnedAt, minutesLate: calc.minutesLate, graceMinutes, depositMinor, percentOfDepositPerDay, capPercentOfDeposit, balanceBeforeMinor: balanceMinor },
      result: { feeMinor: calc.feeMinor, daysLate: calc.daysLate, capped: calc.capped, chargedMinor, outstandingMinor, paidToLenderMinor },
    }, { session: s });

    return { feeMinor: calc.feeMinor, lateFeeMinor: calc.feeMinor, chargedMinor, outstandingMinor, daysLate: calc.daysLate };
  }, session);
}

/**
 * Collect late fees still owed by `userId`, oldest first, from their current balance. Runs inside the
 * transaction of the credit that triggered it (registered as wallet.js's credit hook). Returns piastres taken.
 */
async function collectOutstanding({ userId, session }) {
  const owed = await PaymentOperation.find({ user: userId, kind: 'late_fee', status: 'succeeded', outstandingMinor: { $gt: 0 } })
    .sort({ createdAt: 1 }).session(session);
  let collectedTotal = 0;
  for (const fee of owed) {
    const balanceMinor = await wallet.getBalanceMinor(userId, { session });
    if (balanceMinor <= 0) break;
    const takeMinor = Math.min(balanceMinor, fee.outstandingMinor);
    // Conditional decrement: the same owed amount can never be collected twice.
    const { modifiedCount } = await PaymentOperation.updateOne(
      { _id: fee._id, outstandingMinor: { $gte: takeMinor } }, { $inc: { outstandingMinor: -takeMinor } }, { session }
    );
    if (modifiedCount !== 1) continue;

    await wallet.applyChange({
      userId, deltaMinor: -takeMinor, type: 'late_fee', reference: fee.reference, operationId: fee._id, note: 'Late fee: owed amount collected',
    }, { session });
    const paidToLenderMinor = await payLender({ reservationId: fee.reference.id, amountMinor: takeMinor, operationId: fee._id, note: 'Late fee received' }, session);
    await audit.record({
      action: 'late_fee_collected', reservationId: fee.reference.id, userId, amountMinor: takeMinor, operationId: fee._id,
      inputs: { outstandingBeforeMinor: fee.outstandingMinor, balanceBeforeMinor: balanceMinor },
      result: { collectedMinor: takeMinor, outstandingAfterMinor: fee.outstandingMinor - takeMinor, paidToLenderMinor },
    }, { session });
    collectedTotal += takeMinor;
  }
  return collectedTotal;
}
wallet.setCreditHook(collectOutstanding);

// ------------------------------------------------------------------ read side (Req 78)

const lateFeeFilter = (userId) => ({
  user: new mongoose.Types.ObjectId(String(userId)), kind: 'late_fee', status: 'succeeded', amountMinor: { $gt: 0 },
});

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
    const lateFeeMinor = op.result?.lateFeeMinor ?? op.amountMinor;
    const outstandingMinor = op.outstandingMinor || 0;
    return {
      _id: op._id,
      reservationId: op.reference?.id,
      itemTitle: reservation?.item?.title || 'Item no longer available',
      dueAt: reservation?.endDate,
      returnedAt: reservation?.returnedAt,
      daysLate: op.result?.daysLate,
      lateFeeMinor,
      chargedMinor: lateFeeMinor - outstandingMinor, // paid so far (grows as owed amounts are collected)
      outstandingMinor,
      chargedAt: op.completedAt || op.createdAt,
    };
  });
  return { items, total };
}

module.exports = { calculateLateFee, applyLateFee, collectOutstanding, outstandingTotalMinor, listLateFees };
