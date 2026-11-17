// Member 2 - refunds and deposit settlement (Req 52, 81). Every refund goes to the borrower's WALLET, also when
// the deposit was paid by card (Req 52). Member 1's reservation commands call these inside their transaction:
//   settleCancellation - borrower cancels before pickup: full or partial refund (Req 81)
//   refundToWallet     - lender rejects the request: full refund of deposit + delivery fee
//   releaseDeposit     - good-condition return: the deposit goes back to the borrower
// and Member 3's damage flow (Req 62, 64) calls:
//   settleForfeiture   - admin decision: keep part of the held deposit, return the rest to the borrower
//   refundToWallet     - with reference 'damage:<reportId>': a dispute lowered the amount kept, refund the difference
const mongoose = require('mongoose');
const Reservation = require('../../models/Reservation');
const PaymentOperation = require('../../models/PaymentOperation');
const ApiError = require('../../utils/ApiError');
const wallet = require('./wallet');
const audit = require('./audit');
const policy = require('./config');
const { runOperation, sessionOf } = require('./operation');
const { assertAmountMinor, toMinor } = require('./money');

const HOUR_MS = 60 * 60 * 1000;

function assertId(value, field) {
  if (!mongoose.isValidObjectId(value)) throw ApiError.badRequest(`${field} must be a valid id`);
}

function assertNonNegative(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) throw ApiError.badRequest(`${field} must be a whole number of piastres (0 or more)`);
}

function asDate(value, field) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw ApiError.badRequest(`${field} must be a valid date`);
  return date;
}

/**
 * Pure calculation (no money moves) - Req 81. Usable to SHOW the refund before the borrower confirms.
 *   >= freeCancellationHours before pickup -> 100 %
 *   later, but still before pickup         -> partialRefundPercent (default 50 %)
 *   at/after pickup                        -> 0 %
 */
function quoteCancellationRefund({ amountMinor, cancelledAt, pickupDate, freeCancellationHours = policy.cancellation.freeCancellationHours }) {
  assertNonNegative(amountMinor, 'amountMinor'); // 0 = no deposit (only a delivery fee was paid)
  const hoursBeforePickup = (asDate(pickupDate, 'pickupDate') - asDate(cancelledAt, 'cancelledAt')) / HOUR_MS;
  let ratePercent;
  let rule;
  if (hoursBeforePickup >= freeCancellationHours) {
    ratePercent = 100; rule = 'free_cancellation';
  } else if (hoursBeforePickup > 0) {
    ratePercent = policy.cancellation.partialRefundPercent; rule = 'late_cancellation';
  } else {
    ratePercent = 0; rule = 'after_pickup_start';
  }
  const refundMinor = Math.round((amountMinor * ratePercent) / 100); // whole piastres
  return { ratePercent, rule, refundMinor, forfeitedMinor: amountMinor - refundMinor, hoursBeforePickup: Math.round(hoursBeforePickup * 100) / 100 };
}

/** Pay the forfeited part to the lender, if that is the agreed policy. Returns the amount paid. */
async function payLender({ reservationId, amountMinor, operationId, note }, session) {
  if (amountMinor <= 0 || policy.forfeitedFundsTo !== 'lender') return 0;
  const reservation = await Reservation.findById(reservationId).select('lender').session(session).lean();
  if (!reservation?.lender) return 0;
  await wallet.applyChange({
    userId: reservation.lender, deltaMinor: amountMinor, type: 'lender_payout',
    reference: { type: 'reservation', id: reservationId }, operationId, note,
  }, { session });
  return amountMinor;
}

/**
 * settleCancellation(input, session) -> { refundMinor, deliveryRefundMinor, ... }  (called by M1 cancellation.js)
 * input: { reservationId, borrowerId, amountMinor (deposit held, may be 0), deliveryMinor (delivery fee paid, default 0),
 *          currency, cancelledAt, pickupDate, freeCancellationHours, idempotencyKey }
 * The cancellation rule applies to the DEPOSIT only. The delivery fee is always refunded in full: M1 only allows a
 * cancellation before handover and before the pickup date, so the delivery never happened (team decision with M1).
 */
async function settleCancellation(input, session) {
  const { reservationId, borrowerId, amountMinor, deliveryMinor = 0, currency, cancelledAt, pickupDate, freeCancellationHours, idempotencyKey } = input || {};
  assertId(reservationId, 'reservationId');
  assertId(borrowerId, 'borrowerId');
  assertNonNegative(deliveryMinor, 'deliveryMinor');
  const quote = quoteCancellationRefund({ amountMinor, cancelledAt, pickupDate, freeCancellationHours });
  const totalMinor = amountMinor + deliveryMinor;
  if (totalMinor <= 0) throw ApiError.badRequest('There is nothing to refund');
  const reference = { type: 'reservation', id: reservationId };

  return runOperation({ idempotencyKey, kind: 'refund', purpose: 'cancellation', userId: borrowerId, reference, amountMinor: totalMinor, currency }, async ({ session: s, operation }) => {
    let balanceMinor;
    if (quote.refundMinor > 0) {
      ({ balanceMinor } = await wallet.applyChange({
        userId: borrowerId, deltaMinor: quote.refundMinor, type: 'refund', reference, operationId: operation._id,
        note: quote.ratePercent === 100 ? 'Cancellation refund (full)' : `Cancellation refund (${quote.ratePercent}%)`,
      }, { session: s }));
    }
    const deliveryRefundMinor = deliveryMinor;
    if (deliveryRefundMinor > 0) {
      ({ balanceMinor } = await wallet.applyChange({
        userId: borrowerId, deltaMinor: deliveryRefundMinor, type: 'refund', reference, operationId: operation._id,
        note: 'Delivery fee refunded (cancelled before delivery)',
      }, { session: s }));
    }
    const paidToLenderMinor = await payLender({
      reservationId, amountMinor: quote.forfeitedMinor, operationId: operation._id, note: 'Late cancellation fee',
    }, s);

    await audit.record({
      action: 'cancellation_refunded',
      reservationId,
      userId: borrowerId,
      amountMinor: quote.refundMinor + deliveryRefundMinor,
      operationId: operation._id,
      inputs: {
        heldMinor: amountMinor, deliveryMinor, cancelledAt, pickupDate, hoursBeforePickup: quote.hoursBeforePickup,
        freeCancellationHours: freeCancellationHours ?? policy.cancellation.freeCancellationHours,
        partialRefundPercent: policy.cancellation.partialRefundPercent, forfeitedFundsTo: policy.forfeitedFundsTo,
      },
      result: { rule: quote.rule, ratePercent: quote.ratePercent, refundMinor: quote.refundMinor, deliveryRefundMinor, forfeitedMinor: quote.forfeitedMinor, paidToLenderMinor },
    }, { session: s });

    return { refundMinor: quote.refundMinor, deliveryRefundMinor, ratePercent: quote.ratePercent, rule: quote.rule, forfeitedMinor: quote.forfeitedMinor, paidToLenderMinor, balanceMinor };
  }, session);
}

/** Shared checks for refundToWallet / releaseDeposit inputs coming from M1's reservation commands. */
function settlementInput(input) {
  const { reservationId, userId, amountMinor, depositMinor = amountMinor, deliveryMinor = 0 } = input || {};
  assertId(reservationId, 'reservationId');
  assertId(userId, 'userId');
  assertAmountMinor(amountMinor);
  if (![depositMinor, deliveryMinor].every((n) => Number.isSafeInteger(n) && n >= 0) || depositMinor + deliveryMinor !== amountMinor) {
    throw ApiError.badRequest('depositMinor + deliveryMinor must equal amountMinor');
  }
  return { ...input, depositMinor, deliveryMinor, reference: { type: 'reservation', id: reservationId } };
}

/**
 * refundToWallet(input, session) - lender REJECTS a paid request: full refund of deposit + delivery fee.
 * input: { reservationId, userId, reference, currency, idempotencyKey, amountMinor, depositMinor, deliveryMinor }
 */
async function refundToWallet(input, sessionArg) {
  const session = sessionOf(sessionArg) || input?.session; // Member 3 passes the session inside the input
  if (input && input.reservationId === undefined && /^damage:/.test(String(input.reference))) {
    return refundDamageDispute(input, session);
  }
  const { reservationId, userId, currency, idempotencyKey, amountMinor, depositMinor, deliveryMinor, reference } = settlementInput(input);
  return runOperation({ idempotencyKey, kind: 'refund', purpose: 'deposit', userId, reference, amountMinor, currency }, async ({ session: s, operation }) => {
    const { balanceMinor } = await wallet.applyChange({
      userId, deltaMinor: amountMinor, type: 'refund', reference, operationId: operation._id, note: 'Refund: request rejected by the lender',
    }, { session: s });
    await audit.record({
      action: 'rejection_refunded', reservationId, userId, amountMinor, operationId: operation._id,
      inputs: { reason: 'lender_rejected', depositMinor, deliveryMinor },
      result: { refundMinor: amountMinor, balanceAfterMinor: balanceMinor },
    }, { session: s });
    return { refundMinor: amountMinor, balanceMinor };
  }, session);
}

/**
 * releaseDeposit(input, session) - GOOD-condition return: the held deposit goes back to the borrower's wallet.
 * input: same fields as refundToWallet (deliveryMinor is 0 on a return). Runs once per reservation.
 */
async function releaseDeposit(input, session) {
  const { reservationId, userId, currency, idempotencyKey, amountMinor, depositMinor, reference } = settlementInput(input);
  return runOperation({ idempotencyKey, kind: 'release_deposit', purpose: 'deposit', userId, reference, amountMinor, currency }, async ({ session: s, operation }) => {
    await assertDepositNotSettled(reservationId, idempotencyKey, s);
    const { balanceMinor } = await wallet.applyChange({
      userId, deltaMinor: amountMinor, type: 'deposit_release', reference, operationId: operation._id, note: 'Deposit returned after a good-condition return',
    }, { session: s });
    await audit.record({
      action: 'deposit_released', reservationId, userId, amountMinor, operationId: operation._id,
      inputs: { depositMinor, returnCondition: 'good' },
      result: { releasedMinor: amountMinor, balanceAfterMinor: balanceMinor },
    }, { session: s });
    return { releasedMinor: amountMinor, balanceMinor };
  }, session);
}

// ------------------------------------------------------------------ damage deposits (Member 3, Req 62 / 64)

/** A deposit is settled ONCE: either released (good return) or decided by the damage flow - never both. */
async function assertDepositNotSettled(reservationId, idempotencyKey, session) {
  const other = await PaymentOperation.exists({
    kind: { $in: ['release_deposit', 'forfeiture'] }, status: 'succeeded',
    'reference.type': 'reservation', 'reference.id': reservationId, idempotencyKey: { $ne: idempotencyKey },
  }).session(session);
  if (other) throw ApiError.conflict('This deposit has already been settled');
}

/**
 * settleForfeiture(input, session) - admin's damage decision (Req 62).
 * input: { reservationId, amountMinor (to KEEP, 0 = keep nothing), currency, idempotencyKey: 'damage:<reportId>:decision', session? }
 * Keeps `amountMinor` of the held deposit (paid to the lender, see config.forfeitedFundsTo) and returns the rest
 * to the borrower's wallet. Can never keep more than the deposit that was held.
 */
async function settleForfeiture(input, sessionArg) {
  const { reservationId, amountMinor, currency, idempotencyKey } = input || {};
  const session = sessionOf(sessionArg) || input?.session;
  assertId(reservationId, 'reservationId');
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) throw ApiError.badRequest('amountMinor must be a whole number of piastres (0 or more)');

  const reservation = await Reservation.findById(reservationId).select('borrower lender deposit').session(session || null).lean();
  if (!reservation) throw ApiError.notFound('Reservation not found');
  const heldMinor = toMinor(reservation.deposit?.amount);
  if (amountMinor > heldMinor) throw ApiError.badRequest('Cannot keep more than the held deposit');
  const releasedMinor = heldMinor - amountMinor;
  const borrowerId = reservation.borrower;
  const reference = { type: 'reservation', id: reservationId };

  return runOperation({ idempotencyKey, kind: 'forfeiture', purpose: 'damage', userId: borrowerId, reference, amountMinor, currency }, async ({ session: s, operation }) => {
    if (heldMinor > 0 && reservation.deposit?.status !== 'held') throw ApiError.conflict('The reservation deposit is no longer held');
    await assertDepositNotSettled(reservationId, idempotencyKey, s);

    let balanceMinor;
    if (releasedMinor > 0) {
      ({ balanceMinor } = await wallet.applyChange({
        userId: borrowerId, deltaMinor: releasedMinor, type: 'deposit_release', reference, operationId: operation._id,
        note: amountMinor > 0 ? 'Deposit returned after the damage decision (part kept)' : 'Deposit returned: no damage charge',
      }, { session: s }));
    }
    const paidToLenderMinor = await payLender({ reservationId, amountMinor, operationId: operation._id, note: 'Damage compensation' }, s);

    await audit.record({
      action: 'deposit_forfeited', reservationId, userId: borrowerId, amountMinor, operationId: operation._id,
      inputs: { heldMinor, keepMinor: amountMinor, forfeitedFundsTo: policy.forfeitedFundsTo },
      result: { forfeitedMinor: amountMinor, releasedMinor, paidToLenderMinor, balanceAfterMinor: balanceMinor },
    }, { session: s });
    return { forfeitedMinor: amountMinor, releasedMinor, paidToLenderMinor, balanceMinor };
  }, session);
}

/**
 * Dispute resolved with a LOWER amount kept (Req 64): refund the difference to the borrower.
 * input: { userId, amountMinor, currency, reference: 'damage:<reportId>', idempotencyKey: 'damage:<reportId>:resolution' }
 * The decision is found through its key 'damage:<reportId>:decision', so the refund can never exceed what was kept.
 * The lender gives back what they received (as far as their balance allows; any gap is recorded in the audit).
 */
async function refundDamageDispute(input, session) {
  const { userId, amountMinor, currency, idempotencyKey } = input;
  assertId(userId, 'userId');
  assertAmountMinor(amountMinor);
  const reportId = String(input.reference).slice('damage:'.length);
  const decision = await PaymentOperation.findOne({ idempotencyKey: `damage:${reportId}:decision`, kind: 'forfeiture', status: 'succeeded' })
    .session(session || null).lean();
  if (!decision) throw ApiError.conflict('There is no damage decision to adjust');
  if (String(decision.user) !== String(userId)) throw ApiError.badRequest('userId is not the borrower of this damage decision');
  const reservationId = decision.reference.id;
  const reference = { type: 'reservation', id: reservationId };

  return runOperation({ idempotencyKey, kind: 'refund', purpose: 'damage', userId, reference, amountMinor, currency }, async ({ session: s, operation }) => {
    const earlier = await PaymentOperation.find({
      kind: 'refund', purpose: 'damage', status: 'succeeded', 'reference.id': reservationId, idempotencyKey: { $ne: idempotencyKey },
    }).select('amountMinor').session(s).lean();
    const alreadyRefundedMinor = earlier.reduce((sum, op) => sum + op.amountMinor, 0);
    if (alreadyRefundedMinor + amountMinor > decision.amountMinor) throw ApiError.badRequest('Cannot refund more than the amount that was kept');

    const { balanceMinor } = await wallet.applyChange({
      userId, deltaMinor: amountMinor, type: 'refund', reference, operationId: operation._id, note: 'Damage charge lowered after your dispute',
    }, { session: s });

    // Take back from the lender what they received for this part (never below 0).
    let takenFromLenderMinor = 0;
    const lenderReceivedMinor = decision.result?.paidToLenderMinor || 0;
    const reservation = await Reservation.findById(reservationId).select('lender').session(s).lean();
    if (lenderReceivedMinor > 0 && reservation?.lender) {
      const owedBackMinor = Math.min(amountMinor, lenderReceivedMinor - Math.min(alreadyRefundedMinor, lenderReceivedMinor));
      takenFromLenderMinor = Math.min(owedBackMinor, await wallet.getBalanceMinor(reservation.lender, { session: s }));
      if (takenFromLenderMinor > 0) {
        await wallet.applyChange({
          userId: reservation.lender, deltaMinor: -takenFromLenderMinor, type: 'adjustment', reference, operationId: operation._id,
          note: 'Damage compensation lowered after a dispute',
        }, { session: s });
      }
    }

    await audit.record({
      action: 'damage_dispute_refunded', reservationId, userId, amountMinor, operationId: operation._id,
      inputs: { reportId, keptAtDecisionMinor: decision.amountMinor, alreadyRefundedMinor },
      result: { refundMinor: amountMinor, balanceAfterMinor: balanceMinor, takenFromLenderMinor, notRecoveredFromLenderMinor: Math.max(0, Math.min(amountMinor, lenderReceivedMinor) - takenFromLenderMinor) },
    }, { session: s });
    return { refundMinor: amountMinor, balanceMinor, takenFromLenderMinor };
  }, session);
}

module.exports = { quoteCancellationRefund, settleCancellation, refundToWallet, releaseDeposit, settleForfeiture, payLender };
