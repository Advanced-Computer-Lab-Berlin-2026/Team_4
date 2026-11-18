const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Types } = require('mongoose');
const HouseholdLink = require('../../../src/models/HouseholdLink');
const PromoCode = require('../../../src/models/PromoCode');
const PromoRedemption = require('../../../src/models/PromoRedemption');
const { validateBooking } = require('../../../src/services/policies/bookingPolicy');
const { quote } = require('../../../src/services/pricing/depositQuote');
const { findCheckoutPromo, redeemCheckoutPromo } = require('../../../src/services/promotions/promo');

const item = { depositAmount: 100, category: { depositMultiplier: 1.5 }, delivery: { offered: true, fee: 12.25 } };
const range = { startDate: '2030-05-01', endDate: '2030-05-03' };
const promoCodeId = new Types.ObjectId();
const borrowerId = new Types.ObjectId();
const reservationId = new Types.ObjectId();
const session = { inTransaction: () => true };
const queryValue = (value) => ({ session: async () => value });

module.exports = function registerPromoTests() {
  test('applies category, then membership, then promo to the deposit and keeps delivery separate', async (t) => {
    t.mock.method(PromoCode, 'findOne', ({ code }) => {
      assert.equal(code, 'DISCOUNT');
      return queryValue({ _id: promoCodeId, isActive: true, discountType: 'percent', discountValue: 25 });
    });
    const result = await quote(item, range, { discountPercent: 20 }, ' discount ', {
      method: 'delivery', deliveryAddress: '  1 Sample Street  ',
    });
    assert.deepEqual(result, {
      amountMinor: 10225, promoCode: promoCodeId,
      deposit: { base: 100, categoryMultiplier: 1.5, tierDiscountPercent: 20, promoDiscount: 30, amount: 90 },
      fulfilment: { method: 'delivery', deliveryAddress: '1 Sample Street', deliveryFee: 12.25 },
    });
  });

  test('caps large fixed promos at the deposit and rejects forged delivery', async (t) => {
    t.mock.method(PromoCode, 'findOne', () => queryValue({
      _id: promoCodeId, isActive: true, discountType: 'fixed', discountValue: 500,
    }));
    const fixed = await quote(item, range, {}, 'HUGE', { method: 'delivery', deliveryAddress: 'A' });
    assert.equal(fixed.deposit.amount, 0);
    assert.equal(fixed.deposit.promoDiscount, 150);
    assert.equal(fixed.amountMinor, 1225);
    const empty = await quote({ ...item, depositAmount: 0 }, range, {}, 'HUGE', { method: 'pickup' });
    assert.equal(empty.promoCode, undefined);
    await assert.rejects(quote({ ...item, delivery: { offered: false } }, range, {}, null, {
      method: 'delivery', deliveryAddress: 'A',
    }), { status: 400 });
    await assert.rejects(quote(item, range, {}, null, { method: 'delivery', deliveryAddress: '    ' }), { status: 400 });
  });

  test('blocks household discount quotes when the household entitlement provider is unavailable', async (t) => {
    try {
      require.resolve('../../../src/services/membership/entitlements');
      t.skip('The household entitlement provider is installed');
      return;
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') throw error;
    }
    t.mock.method(HouseholdLink, 'exists', (filter) => {
      assert.deepEqual(filter, { status: 'accepted', $or: [{ requester: borrowerId }, { recipient: borrowerId }] });
      return queryValue(true);
    });
    await assert.rejects(quote(item, range, { discountPercent: 10 }, null, null, { borrowerId }), { status: 503 });
  });

  test('enforces stored borrowing duration and trust', () => {
    const rules = { maxBorrowDays: 2, minTrustScore: 60 };
    assert.doesNotThrow(() => validateBooking({ trustScore: 60 }, { rules }, range));
    assert.throws(() => validateBooking({ trustScore: 59 }, { rules }, range), { status: 403 });
    assert.throws(() => validateBooking({ trustScore: 61 }, { rules }, { ...range, endDate: '2030-05-04' }), { status: 400 });
  });

  test('rejects expired, exhausted and already-used one-per-member promos', async (t) => {
    let promo;
    t.mock.method(PromoCode, 'findOne', () => queryValue(promo));
    t.mock.method(PromoRedemption, 'exists', () => queryValue(true));
    promo = { isActive: true, validUntil: new Date('2001-01-01T00:00:00Z') };
    await assert.rejects(findCheckoutPromo('TEST'), { status: 400 });
    promo = { isActive: true, maxRedemptions: 2, redemptionCount: 2 };
    await assert.rejects(findCheckoutPromo('TEST'), { status: 409 });
    promo = { _id: promoCodeId, isActive: true, onePerMember: true };
    await assert.rejects(findCheckoutPromo('TEST', { borrowerId }), { status: 409 });
  });

  test('records a redemption in checkout’s transaction and reuses it on a repeated call', async (t) => {
    let stored;
    t.mock.method(PromoRedemption, 'findOne', () => queryValue(stored));
    t.mock.method(PromoCode, 'findById', () => queryValue({ _id: promoCodeId, isActive: true }));
    const increment = t.mock.method(PromoCode, 'updateOne', async (filter, update, options) => {
      assert.deepEqual({ filter, update, options }, {
        filter: { _id: promoCodeId }, update: { $inc: { redemptionCount: 1 } }, options: { session },
      });
    });
    t.mock.method(PromoRedemption, 'create', async ([row], options) => {
      assert.equal(options.session, session);
      assert.deepEqual(row, { promoCode: promoCodeId, user: borrowerId, reservation: reservationId });
      stored = row;
      return [row];
    });
    const input = { promoCodeId, borrowerId, reservationId };
    await assert.rejects(redeemCheckoutPromo(input), /requires the checkout transaction/);
    assert.equal(await redeemCheckoutPromo(input, session), await redeemCheckoutPromo(input, session));
    assert.equal(increment.mock.callCount(), 1);
  });
};
