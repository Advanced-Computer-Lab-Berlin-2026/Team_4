const PromoCode = require('../../models/PromoCode');
const PromoRedemption = require('../../models/PromoRedemption');
const ApiError = require('../../utils/ApiError');

function normalizeCode(value) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!/^[A-Z0-9][A-Z0-9_-]{0,79}$/.test(code)) {
    throw ApiError.badRequest('Use up to 80 letters, numbers, hyphens or underscores for the promo code');
  }
  return code;
}

function assertAvailable(promotion, now) {
  if (!promotion || !promotion.isActive || (promotion.validFrom && promotion.validFrom > now) ||
    (promotion.validUntil && promotion.validUntil <= now)) {
    throw ApiError.badRequest('This promo code is invalid or is outside its validity period');
  }
  if (promotion.maxRedemptions != null && (promotion.redemptionCount ?? 0) >= promotion.maxRedemptions) {
    throw ApiError.conflict('This promo code has reached its redemption limit');
  }
}

async function assertMemberEligible(promotion, borrowerId, session) {
  if (!promotion.onePerMember) return;
  if (!borrowerId) throw ApiError.unauthorized();
  const existing = await PromoRedemption.exists({ promoCode: promotion._id, user: borrowerId })
    .session(session || null);
  if (existing) throw ApiError.conflict('You have already used this promo code');
}

async function findCheckoutPromo(code, { borrowerId, session } = {}) {
  const promotion = await PromoCode.findOne({ code: normalizeCode(code) }).session(session || null);
  assertAvailable(promotion, new Date());
  await assertMemberEligible(promotion, borrowerId, session);
  return promotion;
}

async function redeemCheckoutPromo({ promoCodeId, reservationId, borrowerId }, session) {
  if (!session?.inTransaction()) throw new Error('Promo redemption requires the checkout transaction');

  const previous = await PromoRedemption.findOne({ reservation: reservationId }).session(session);
  if (previous) {
    if (String(previous.user) === String(borrowerId) && String(previous.promoCode) === String(promoCodeId)) {
      return previous;
    }
    throw ApiError.conflict('This reservation already has a promo redemption');
  }

  const promotion = await PromoCode.findById(promoCodeId).session(session);
  assertAvailable(promotion, new Date());
  await assertMemberEligible(promotion, borrowerId, session);

  // Every checkout using this code writes the same promo row. Concurrent transactions
  // conflict and retry before checking member eligibility and incrementing the count.
  await PromoCode.updateOne({ _id: promotion._id }, { $inc: { redemptionCount: 1 } }, { session });
  const [redemption] = await PromoRedemption.create([{
    promoCode: promotion._id, user: borrowerId, reservation: reservationId,
  }], { session });
  return redemption;
}

module.exports = { findCheckoutPromo, normalizeCode, redeemCheckoutPromo };
