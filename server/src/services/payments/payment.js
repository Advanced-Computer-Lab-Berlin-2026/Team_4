// Member 2 - payment service: the functions other members call (docs/SPRINT2_CONTRACT.md "Member 2 payment
// module" and docs/sprint2/member2.md). Member 1's bootstrap loads this file automatically, so every
// function other members use is exported from here (refunds live in refund.js and are re-exported below).
// Each function runs through runOperation() (operation.js): exactly once per idempotencyKey, in one transaction.
const ApiError = require('../../utils/ApiError');
const wallet = require('./wallet');
const audit = require('./audit');
const refund = require('./refund');
const lateFee = require('./lateFee'); // also registers the "collect owed late fees after a credit" hook
const card = require('./card');
const stripe = require('./stripe');
const { runOperation, checkReference } = require('./operation');
const { assertAmountMinor, toMinor, fromMinor } = require('./money');

/**
 * charge - pay from the wallet (Req 50 wallet option, M8 membership by wallet).
 * Deposits and membership payments stay distinct: different purpose, ledger type and audit action.
 */
async function charge({ userId, amountMinor, currency, purpose, reference, idempotencyKey }, opts) {
  assertAmountMinor(amountMinor);
  if (!['deposit', 'membership'].includes(purpose)) throw ApiError.badRequest("purpose must be 'deposit' or 'membership'");
  checkReference(reference);

  return runOperation({ idempotencyKey, kind: 'charge', purpose, userId, reference, amountMinor, currency }, async ({ session, operation }) => {
    const { balanceMinor } = await wallet.applyChange({
      userId,
      deltaMinor: -amountMinor,
      type: purpose === 'deposit' ? 'deposit_hold' : 'membership',
      reference,
      operationId: operation._id,
      note: purpose === 'deposit' ? 'Deposit paid from wallet' : 'Membership paid from wallet',
    }, { session });

    await audit.record({
      action: `${purpose}_charged`,
      reservationId: reference.type === 'reservation' ? reference.id : undefined,
      userId,
      amountMinor,
      operationId: operation._id,
      inputs: { method: 'wallet', purpose, amountMinor, reference },
      result: { chargedMinor: amountMinor, balanceAfterMinor: balanceMinor },
    }, { session });

    return { chargedMinor: amountMinor, balanceMinor };
  }, opts);
}

/**
 * creditReferral - M9 rewards the referrer on the referred user's first completed reservation (Req 99).
 * input: { userId, amountMinor, currency, reference: 'referral:<referralId>', idempotencyKey }
 * (also accepted: reference { type: 'referral', id } or referralId)
 */
async function creditReferral({ userId, amountMinor, currency, reference: ref, referralId, idempotencyKey }, opts) {
  assertAmountMinor(amountMinor);
  const referralRef = typeof ref === 'string' ? ref.replace(/^referral:/, '') : ref?.id ?? referralId;
  const reference = { type: 'referral', id: referralRef };
  if (ref && typeof ref === 'object' && ref.type !== 'referral') throw ApiError.badRequest("reference.type must be 'referral'");
  checkReference(reference);

  return runOperation({ idempotencyKey, kind: 'referral_credit', purpose: 'referral', userId, reference, amountMinor, currency }, async ({ session, operation }) => {
    const { balanceMinor } = await wallet.applyChange({
      userId, deltaMinor: amountMinor, type: 'referral_credit', reference, operationId: operation._id, note: 'Referral reward',
    }, { session });

    await audit.record({
      action: 'referral_credited',
      userId,
      amountMinor,
      operationId: operation._id,
      inputs: { amountMinor, referralId: referralRef },
      result: { creditedMinor: amountMinor, balanceAfterMinor: balanceMinor },
    }, { session });

    return { creditedMinor: amountMinor, balanceMinor };
  }, opts);
}

/**
 * chargeWalletCheckout(input, session) - Req 50 wallet option. Called by M1's checkout INSIDE its booking
 * transaction, before it creates the reservations. One idempotent operation for the whole cart; one ledger
 * row and one audit row per reserved line, so each reservation's payment can be traced (NFR 14).
 * input: { attemptId, borrowerId, idempotencyKey, amountMinor, currency, expiresAt,
 *          lines: [{ reservationId, itemId, title, startDate, endDate, amountMinor, deposit, fulfilment }] }
 * The amounts come from M1's server-side quote; nothing here is computed by the browser.
 */
async function chargeWalletCheckout(input, session) {
  const { attemptId, borrowerId, idempotencyKey, amountMinor, currency, lines } = input || {};
  assertAmountMinor(amountMinor);
  // Valid lines whose amounts add up to the total, otherwise something upstream is wrong - refuse to charge.
  card.assertCheckoutLines(lines, amountMinor);
  const reference = { type: 'checkout', id: attemptId };
  checkReference(reference);

  return runOperation({ idempotencyKey, kind: 'charge', purpose: 'deposit', userId: borrowerId, reference, amountMinor, currency }, async ({ session: s, operation }) => {
    let balanceMinor;
    for (const line of lines.filter((l) => l.amountMinor > 0)) {
      const lineReference = { type: 'reservation', id: line.reservationId };
      ({ balanceMinor } = await wallet.applyChange({
        userId: borrowerId,
        deltaMinor: -line.amountMinor,
        type: 'deposit_hold',
        reference: lineReference,
        operationId: operation._id,
        note: `Deposit paid: ${line.title || 'reservation'}`,
      }, { session: s }));

      await audit.checkoutLine({
        attemptId, borrowerId, method: 'wallet', line, operationId: operation._id, balanceMinor,
      }, s);
    }
    return { chargedMinor: amountMinor, balanceMinor };
  }, session);
}

// Free lines still have a deposit calculation. The booking transaction records it once with the reservation.
async function auditFreeCheckoutLines({ attemptId, borrowerId, lines, method }, session) {
  for (const line of lines.filter(({ amountMinor }) => amountMinor === 0)) {
    await audit.checkoutLine({ attemptId, borrowerId, method, line }, session);
  }
}

/**
 * chargeMembership(input, session) - M8 membership paid from the WALLET (Req 85).
 * input: { userId, amountMinor, currency, reference:{ type:'membership', id }, idempotencyKey }
 * (Card memberships: startCardPayment with purpose 'membership', then recordMembershipPayment - card.js.)
 */
function chargeMembership(input, session) {
  if (input?.reference?.type !== 'membership') throw ApiError.badRequest("reference.type must be 'membership'");
  return charge({ ...input, purpose: 'membership' }, session);
}

module.exports = {
  runOperation,
  charge,
  chargeWalletCheckout,
  auditFreeCheckoutLines,
  creditReferral,
  chargeMembership,
  recordMembershipPayment: card.recordMembershipPayment,
  // Req 52 / 81 - refunds and deposit settlement (refund.js)
  quoteCancellationRefund: refund.quoteCancellationRefund,
  settleCancellation: refund.settleCancellation,
  refundToWallet: refund.refundToWallet,
  releaseDeposit: refund.releaseDeposit,
  // Req 62 / 64 - damage decisions (Member 3); dispute refunds go through refundToWallet with reference 'damage:<reportId>'
  settleForfeiture: refund.settleForfeiture,
  // Req 77 - late fees (lateFee.js)
  applyLateFee: lateFee.applyLateFee,
  calculateLateFee: lateFee.calculateLateFee,
  toMinor,
  fromMinor,
};

// Req 51 - card payments (card.js). Member 1's checkout offers "Card" only when these functions exist, so they are
// exported ONLY while Stripe is configured with a TEST key (stripe.js). Without a key: no card option, nothing breaks.
for (const name of ['startCardPayment', 'getCardPayment', 'recordCardCheckout', 'verifyCheckoutWebhook', 'refundFailedCheckout']) {
  Object.defineProperty(module.exports, name, { enumerable: true, get: () => (stripe.isConfigured() ? card[name] : undefined) });
}
