// Member 2 - the exactly-once engine shared by every money function (payment.js, refund.js, lateFee.js).
// runOperation() is the idempotency + atomicity core used by every money function:
//   1. Look up the idempotencyKey. Already done -> return the stored result (replayed: true), change nothing.
//   2. Otherwise create a PaymentOperation, do the work (wallet change + audit), store the result -
//      all in ONE MongoDB transaction, so either everything is saved or nothing is.
// The unique index on idempotencyKey means two parallel requests with the same key cannot both run.
const crypto = require('crypto');
const mongoose = require('mongoose');
const PaymentOperation = require('../../models/PaymentOperation');
const ApiError = require('../../utils/ApiError');
const { assertCurrency } = require('./money');

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

module.exports = { runOperation, checkReference, sessionOf, REFERENCE_TYPES };
