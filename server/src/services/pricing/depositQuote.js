const { existsSync } = require('node:fs');
const path = require('node:path');
const ApiError = require('../../utils/ApiError');
const HouseholdLink = require('../../models/HouseholdLink');
const { findCheckoutPromo } = require('../promotions/promo');

const entitlementsFile = path.join(__dirname, '../membership/entitlements.js');

async function assertHouseholdPricingAvailable(borrowerId, session) {
  if (!borrowerId || (existsSync(entitlementsFile) && typeof require(entitlementsFile).getEntitlements === 'function')) {
    return;
  }
  const linked = await HouseholdLink.exists({
    status: 'accepted', $or: [{ requester: borrowerId }, { recipient: borrowerId }],
  }).session(session || null);
  if (linked) throw new ApiError(503, 'Household pricing is unavailable. Please try again later.');
}

function fulfilmentQuote(item, fulfilment) {
  if (fulfilment?.method == null || fulfilment.method === 'pickup') {
    return { method: 'pickup', deliveryFee: 0 };
  }
  if (fulfilment.method !== 'delivery' || !item.delivery?.offered) {
    throw ApiError.badRequest('Delivery is unavailable for this item');
  }
  const deliveryAddress = typeof fulfilment.deliveryAddress === 'string' ? fulfilment.deliveryAddress.trim() : '';
  if (!deliveryAddress || deliveryAddress.length > 500) {
    throw ApiError.badRequest('Enter a delivery address of up to 500 characters');
  }

  const feeMinor = Math.round((item.delivery.fee ?? 0) * 100);
  if (!Number.isSafeInteger(feeMinor) || feeMinor < 0) throw ApiError.conflict('This item has an invalid delivery fee');
  return { method: 'delivery', deliveryFee: feeMinor / 100, deliveryAddress };
}

async function quote(item, _range, entitlements, promo, fulfilment, options = {}) {
  const base = item.depositAmount ?? 0;
  const categoryMultiplier = item.category?.depositMultiplier ?? 1;
  const tierDiscountPercent = entitlements?.discountPercent ?? 0;
  if (!Number.isFinite(base) || base < 0 || !Number.isFinite(categoryMultiplier) || categoryMultiplier < 1 ||
    !Number.isFinite(tierDiscountPercent) || tierDiscountPercent < 0 || tierDiscountPercent > 100) {
    throw ApiError.conflict('The deposit or membership discount is invalid');
  }
  const adjustedMinor = Math.round(base * categoryMultiplier * (100 - tierDiscountPercent));
  if (!Number.isSafeInteger(adjustedMinor)) throw ApiError.conflict('The deposit is too large to quote');

  const fulfilmentResult = fulfilmentQuote(item, fulfilment);
  if (base > 0) await assertHouseholdPricingAvailable(options.borrowerId, options.session);
  const promotion = promo ? await findCheckoutPromo(promo, options) : null;
  let promoDiscountMinor = 0;
  if (promotion) {
    const rawDiscountMinor = promotion.discountType === 'fixed'
      ? promotion.discountValue * 100 : adjustedMinor * promotion.discountValue / 100;
    promoDiscountMinor = Math.min(adjustedMinor, Math.round(rawDiscountMinor));
  }
  if (!Number.isSafeInteger(promoDiscountMinor) || promoDiscountMinor < 0) {
    throw ApiError.conflict('The promo discount is invalid');
  }

  const depositMinor = adjustedMinor - promoDiscountMinor;
  const amountMinor = depositMinor + Math.round(fulfilmentResult.deliveryFee * 100);
  if (!Number.isSafeInteger(amountMinor)) throw ApiError.conflict('The checkout total is too large');
  return {
    amountMinor,
    deposit: { base, categoryMultiplier, tierDiscountPercent, promoDiscount: promoDiscountMinor / 100, amount: depositMinor / 100 },
    fulfilment: fulfilmentResult,
    ...(promoDiscountMinor > 0 && { promoCode: promotion._id }),
  };
}

module.exports = { quote };
