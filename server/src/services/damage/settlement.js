/**
 * DAMAGE SETTLEMENT ADAPTER - Owner: Member 3 - Requirements: 62, 64
 * Contract: docs/sprint2/member3.md §2.1 and §8 (Member 2 row)
 *
 * All deposit money moves through Member 2's payment service. This adapter is the only place Member 3's
 * code touches it. Until services/payments/payment.js exists, every call fails with 501 "not implemented",
 * so the calling transaction rolls back and nothing pretends money moved (Stage 0 rule: stubs must fail visibly).
 *
 * Amounts are passed in minor units (piastres) with a unique idempotency key per step, so a retried
 * decision or resolution can never forfeit or refund twice.
 */
const ApiError = require('../../utils/ApiError');
const { CURRENCY } = require('../../config/constants');

let override; // tests only - see setSettlementProvider()

function loadPaymentService() {
  try {
    return require('../payments/payment');
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND' && /payments[\\/]payment/.test(err.message)) return null;
    throw err;
  }
}

function provider(fn) {
  const service = override === undefined ? loadPaymentService() : override;
  if (!service || typeof service[fn] !== 'function') {
    throw ApiError.notImplemented(`Deposit settlement (Member 2 payment service: ${fn})`);
  }
  return service[fn].bind(service);
}

const toMinor = (egp) => Math.round(Number(egp) * 100);

/** Req 62: keep `amount` EGP of the held deposit and release the rest to the borrower. */
const settleForfeiture = ({ reservationId, amount, idempotencyKey, session }) =>
  provider('settleForfeiture')({ reservationId, amountMinor: toMinor(amount), currency: CURRENCY, idempotencyKey, session });

/** Req 64: refund the difference a dispute removed. */
const refundToWallet = ({ userId, amount, reference, idempotencyKey, session }) =>
  provider('refundToWallet')({ userId, amountMinor: toMinor(amount), currency: CURRENCY, reference, idempotencyKey, session });

/** Swap in a fake payment service in tests; pass null to simulate its absence or no argument to restore the real lookup. */
const setSettlementProvider = (service) => { override = service; };

module.exports = { settleForfeiture, refundToWallet, setSettlementProvider, toMinor };
