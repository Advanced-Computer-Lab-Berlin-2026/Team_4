// Member 2 - refunds and deposit settlement (Req 52, 81). Every refund goes to the borrower's WALLET, also when
// the deposit was paid by card (Req 52). Member 1's reservation commands call these inside their transaction:
//   settleCancellation - borrower cancels before pickup: full or partial refund (Req 81)
//   refundToWallet     - lender rejects the request: full refund of deposit + delivery fee
//   releaseDeposit     - good-condition return: the deposit goes back to the borrower
const mongoose = require('mongoose');
const Reservation = require('../../models/Reservation');
const ApiError = require('../../utils/ApiError');
const wallet = require('./wallet');
const audit = require('./audit');
const policy = require('./config');
const { runOperation } = require('./operation');
const { assertAmountMinor } = require('./money');

const HOUR_MS = 60 * 60 * 1000;

function assertId(value, field) {
  if (!mongoose.isValidObjectId(value)) throw ApiError.badRequest(`${field} must be a valid id`);
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
  assertAmountMinor(amountMinor);
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
 * settleCancellation(input, session) -> { refundMinor, ... }  (called by M1 cancellation.js)
 * input: { reservationId, borrowerId, amountMinor (deposit held), currency, cancelledAt, pickupDate,
 *          freeCancellationHours, idempotencyKey }
 */
async function settleCancellation(input, session) {
  const { reservationId, borrowerId, amountMinor, currency, cancelledAt, pickupDate, freeCancellationHours, idempotencyKey } = input || {};
  assertId(reservationId, 'reservationId');
  assertId(borrowerId, 'borrowerId');
  const quote = quoteCancellationRefund({ amountMinor, cancelledAt, pickupDate, freeCancellationHours });
  const reference = { type: 'reservation', id: reservationId };

  return runOperation({ idempotencyKey, kind: 'refund', purpose: 'cancellation', userId: borrowerId, reference, amountMinor, currency }, async ({ session: s, operation }) => {
    let balanceMinor;
    if (quote.refundMinor > 0) {
      ({ balanceMinor } = await wallet.applyChange({
        userId: borrowerId, deltaMinor: quote.refundMinor, type: 'refund', reference, operationId: operation._id,
        note: quote.ratePercent === 100 ? 'Cancellation refund (full)' : `Cancellation refund (${quote.ratePercent}%)`,
      }, { session: s }));
    }
    const paidToLenderMinor = await payLender({
      reservationId, amountMinor: quote.forfeitedMinor, operationId: operation._id, note: 'Late cancellation fee',
    }, s);

    await audit.record({
      action: 'cancellation_refunded',
      reservationId,
      userId: borrowerId,
      amountMinor: quote.refundMinor,
      operationId: operation._id,
      inputs: {
        heldMinor: amountMinor, cancelledAt, pickupDate, hoursBeforePickup: quote.hoursBeforePickup,
        freeCancellationHours: freeCancellationHours ?? policy.cancellation.freeCancellationHours,
        partialRefundPercent: policy.cancellation.partialRefundPercent, forfeitedFundsTo: policy.forfeitedFundsTo,
      },
      result: { rule: quote.rule, ratePercent: quote.ratePercent, refundMinor: quote.refundMinor, forfeitedMinor: quote.forfeitedMinor, paidToLenderMinor },
    }, { session: s });

    return { refundMinor: quote.refundMinor, ratePercent: quote.ratePercent, rule: quote.rule, forfeitedMinor: quote.forfeitedMinor, paidToLenderMinor, balanceMinor };
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
async function refundToWallet(input, session) {
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

module.exports = { quoteCancellationRefund, settleCancellation, refundToWallet, releaseDeposit, payLender };
