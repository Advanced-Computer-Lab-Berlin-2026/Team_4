// Member 2 - payment service: the functions other members call (docs/SPRINT2_CONTRACT.md "Member 2 payment
// module" and docs/sprint2/member2.md). Member 1's bootstrap loads this file automatically.
//
// runOperation() is the idempotency + atomicity core used by every money function:
//   1. Look up the idempotencyKey. Already done -> return the stored result (replayed: true), change nothing.
//   2. Otherwise create a PaymentOperation, do the work (wallet change + audit), store the result -
//      all in ONE MongoDB transaction, so either everything is saved or nothing is.
// The unique index on idempotencyKey means two parallel requests with the same key cannot both run.
const crypto = require('crypto');
const mongoose = require('mongoose');
const PaymentOperation = require('../../models/PaymentOperation');
const ApiError = require('../../utils/ApiError');
const wallet = require('./wallet');
const audit = require('./audit');
const { assertAmountMinor, assertCurrency, toMinor, fromMinor } = require('./money');

const REFERENCE_TYPES = ['checkout', 'reservation', 'membership', 'referral', 'manual'];

/**
 * The team contract passes the MongoDB session as the 2nd argument: fn(input, session).
 * Older callers/tests pass { session }. Accept both.
 */
const sessionOf = (arg) => (arg && typeof arg.startTransaction === 'function' ? arg : arg?.session);

/** Fingerprint of the request, so a key reused with different details is rejected instead of replayed. */
function hashRequest({ kind, purpose, userId, reference, amountMinor, currency }) {
  const canonical = JSON.stringify([kind, purpose, String(userId), reference?.type, String(reference?.id), amountMinor, currency]);
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function replay(existing, requestHash) {
  if (existing.requestHash !== requestHash) {
    throw ApiError.conflict('This idempotency key was already used for a different payment');
  }
  if (existing.status !== 'succeeded') throw ApiError.conflict('This payment is still being processed');
  return { ...existing.result, operationId: existing._id, replayed: true };
}

function checkReference(reference) {
  if (!reference || !REFERENCE_TYPES.includes(reference.type) || !mongoose.isValidObjectId(reference.id)) {
    throw ApiError.badRequest('A valid reference { type, id } is required');
  }
}

/**
 * Run `work({ session, operation })` exactly once per idempotencyKey.
 * Pass { session } to join the caller's transaction (e.g. M1 checkout); otherwise a transaction is started here.
 */
async function runOperation(spec, work, sessionArg) {
  const session = sessionOf(sessionArg);
  const { idempotencyKey, kind, purpose, userId, reference, amountMinor } = spec;
  if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) throw ApiError.badRequest('idempotencyKey is required');
  const currency = assertCurrency(spec.currency);
  const requestHash = hashRequest({ ...spec, currency });

  const execute = async (s) => {
    const existing = await PaymentOperation.findOne({ idempotencyKey }).session(s);
    if (existing) return replay(existing, requestHash);

    const [operation] = await PaymentOperation.create(
      [{ idempotencyKey, kind, purpose, user: userId, reference, amountMinor, currency, requestHash, status: 'pending' }],
      { session: s }
    );
    const result = await work({ session: s, operation });
    await PaymentOperation.updateOne(
      { _id: operation._id },
      { $set: { status: 'succeeded', result, completedAt: new Date() } },
      { session: s }
    );
    return { ...result, operationId: operation._id, replayed: false };
  };

  try {
    if (session) return await execute(session);
    let output;
    // connection.transaction() commits at the end and retries automatically on transient write conflicts.
    await mongoose.connection.transaction(async (s) => { output = await execute(s); });
    return output;
  } catch (err) {
    // A parallel request with the same key committed first: return its result instead of failing.
    if (err?.code === 11000 && err.keyPattern?.idempotencyKey) {
      if (session) throw ApiError.conflict('This payment is already being processed, please retry');
      const existing = await PaymentOperation.findOne({ idempotencyKey });
      if (existing) return replay(existing, requestHash);
    }
    throw err;
  }
}

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

/** creditReferral - M9 rewards the referrer on the referred user's first completed reservation (Req 99). */
async function creditReferral({ userId, amountMinor, currency, referralId, idempotencyKey }, opts) {
  assertAmountMinor(amountMinor);
  const reference = { type: 'referral', id: referralId };
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
      inputs: { amountMinor, referralId },
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
  if (!Array.isArray(lines) || lines.length === 0) throw ApiError.badRequest('The checkout has no lines');
  for (const line of lines) {
    if (!mongoose.isValidObjectId(line.reservationId)) throw ApiError.badRequest('Each line needs a reservationId');
    if (!Number.isSafeInteger(line.amountMinor) || line.amountMinor < 0) throw ApiError.badRequest('Invalid line amount');
  }
  // The total must equal the sum of the lines, otherwise something upstream is wrong - refuse to charge.
  if (lines.reduce((sum, line) => sum + line.amountMinor, 0) !== amountMinor) {
    throw ApiError.badRequest('The checkout total does not match its lines');
  }
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

      const deliveryFeeMinor = toMinor(line.fulfilment?.deliveryFee);
      await audit.record({
        action: 'deposit_charged',
        reservationId: line.reservationId,
        userId: borrowerId,
        amountMinor: line.amountMinor,
        operationId: operation._id,
        inputs: {
          method: 'wallet', checkoutAttemptId: attemptId, itemId: line.itemId, startDate: line.startDate, endDate: line.endDate,
          deposit: line.deposit, fulfilmentMethod: line.fulfilment?.method, deliveryFeeMinor, lineAmountMinor: line.amountMinor,
        },
        result: { chargedMinor: line.amountMinor, balanceAfterMinor: balanceMinor },
      }, { session: s });
    }
    return { chargedMinor: amountMinor, balanceMinor };
  }, session);
}

module.exports = { runOperation, charge, chargeWalletCheckout, creditReferral, toMinor, fromMinor };
