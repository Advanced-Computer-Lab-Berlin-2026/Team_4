// Member 2 - the ONLY code that changes User.walletBalance.
// Each change is a compare-and-set: "set the balance to NEW only if it is still OLD". Two parallel debits can
// therefore never both succeed against the same old balance, and the math is exact because it is done in
// piastres. The balance change and its ledger row are written with the caller's session, so they commit or
// roll back together (callers always run this inside a transaction - see payment.js).
const User = require('../../models/User');
const WalletTransaction = require('../../models/WalletTransaction');
const ApiError = require('../../utils/ApiError');
const { toMinor, fromMinor } = require('./money');

const MAX_ATTEMPTS = 5; // retries when another request changed the balance between our read and write

/** Current balance in piastres. */
async function getBalanceMinor(userId, { session } = {}) {
  const user = await User.findById(userId).select('walletBalance').session(session || null).lean();
  if (!user) throw ApiError.notFound('User not found');
  return toMinor(user.walletBalance);
}

/**
 * Apply a signed change (+credit / -debit) to a user's wallet and write the ledger row.
 * Throws 409 (conflict, as the team contract asks) if a debit would make the balance negative;
 * nothing is written in that case.
 */
async function applyChange({ userId, deltaMinor, type, reference, reservationId, operationId, note }, { session }) {
  if (!session) throw new Error('wallet.applyChange must run inside a transaction session');
  if (!Number.isSafeInteger(deltaMinor) || deltaMinor === 0) throw ApiError.badRequest('Invalid wallet amount');

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const user = await User.findById(userId).select('walletBalance').session(session).lean();
    if (!user) throw ApiError.notFound('User not found');

    const beforeMinor = toMinor(user.walletBalance);
    const afterMinor = beforeMinor + deltaMinor;
    if (afterMinor < 0) throw ApiError.conflict('Insufficient wallet balance');

    // Match the exact stored value (or a missing field for very old accounts) - that is the "compare" part.
    const expected = user.walletBalance === undefined ? { $exists: false } : user.walletBalance;
    const { modifiedCount } = await User.updateOne(
      { _id: userId, walletBalance: expected },
      { $set: { walletBalance: fromMinor(afterMinor) } }, // field-scoped: only walletBalance is touched
      { session }
    );
    if (modifiedCount !== 1) continue; // balance changed under us - read again and retry

    const [transaction] = await WalletTransaction.create(
      [{
        user: userId,
        type,
        amountMinor: deltaMinor,
        amount: fromMinor(deltaMinor),
        balanceAfterMinor: afterMinor,
        balanceAfter: fromMinor(afterMinor),
        reservation: reference?.type === 'reservation' ? reference.id : reservationId,
        reference,
        operation: operationId,
        note,
      }],
      { session }
    );
    // After money comes IN, let lateFee.js collect any late fee still owed (same transaction).
    if (deltaMinor > 0 && creditHook) {
      const collectedMinor = await creditHook({ userId, session });
      if (collectedMinor > 0) return { transaction, balanceMinor: afterMinor - collectedMinor, collectedMinor };
    }
    return { transaction, balanceMinor: afterMinor };
  }
  throw ApiError.conflict('The wallet is busy, please try again');
}

// Registered by lateFee.js (wallet.js must not require it - that would be a circular require).
let creditHook = null;
function setCreditHook(fn) { creditHook = fn; }

module.exports = { getBalanceMinor, applyChange, setCreditHook };
