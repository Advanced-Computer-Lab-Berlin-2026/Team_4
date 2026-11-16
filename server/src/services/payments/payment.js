// Member 2 - payment service: the functions other members call (see docs/sprint2/member2.md, section 3).
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

const REFERENCE_TYPES = ['reservation', 'membership', 'referral', 'manual'];

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
async function runOperation(spec, work, { session } = {}) {
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
async function charge({ userId, amountMinor, currency, purpose, reference, idempotencyKey }, opts = {}) {
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
async function creditReferral({ userId, amountMinor, currency, referralId, idempotencyKey }, opts = {}) {
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

module.exports = { runOperation, charge, creditReferral, toMinor, fromMinor };
