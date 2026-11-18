const mongoose = require('mongoose');
const PromoCode = require('../models/PromoCode');
const PromoRedemption = require('../models/PromoRedemption');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { parsePagination, paginated } = require('../utils/pagination');
const { normalizeCode } = require('../services/promotions/promo');

const newestFirst = { createdAt: -1, _id: -1 };
const datePattern = /^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/;
const keepReference = (doc, id) => doc ?? (id && { _id: id });

function readDate(value, field) {
  if (value == null || value === '') return undefined;
  if (typeof value !== 'string' || !datePattern.test(value)) throw ApiError.badRequest('Enter a valid ' + field);
  const day = value.slice(0, 10);
  const date = new Date(value);
  const utcDay = new Date(day);
  if (!Number.isFinite(date.getTime()) || !Number.isFinite(utcDay.getTime()) || utcDay.toISOString().slice(0, 10) !== day) {
    throw ApiError.badRequest('Enter a valid ' + field);
  }
  return date;
}

exports.create = asyncHandler(async (req, res) => {
  const {
    code: rawCode, discountType, discountValue, maxRedemptions, onePerMember = false,
    validFrom: start, validUntil: end,
  } = req.body || {};
  const code = normalizeCode(rawCode);
  if (!['percent', 'fixed'].includes(discountType)) throw ApiError.badRequest('Choose a percentage or fixed EGP discount');
  if (!Number.isFinite(discountValue) || discountValue <= 0 ||
    (discountType === 'percent' && discountValue > 100) ||
    !Number.isSafeInteger(Math.round(discountValue * 100)) || Math.round(discountValue * 100) / 100 !== discountValue) {
    throw ApiError.badRequest(discountType === 'percent'
      ? 'Enter a percentage above 0 and up to 100, with at most two decimal places'
      : 'Enter a positive EGP discount with at most two decimal places');
  }
  if (maxRedemptions != null && (!Number.isSafeInteger(maxRedemptions) || maxRedemptions < 1)) {
    throw ApiError.badRequest('Maximum redemptions must be a positive whole number');
  }
  if (typeof onePerMember !== 'boolean') throw ApiError.badRequest('Specify whether the code is limited to one use per member');

  const validFrom = readDate(start, 'start date');
  const validUntil = readDate(end, 'expiry date');
  if (validFrom && validUntil && validUntil <= validFrom) {
    throw ApiError.badRequest('The expiry date must come after the start date');
  }

  const promoCode = await PromoCode.create({
    code, discountType, discountValue, maxRedemptions, onePerMember, validFrom, validUntil, createdBy: req.user._id,
  });
  res.status(201).json({ promoCode });
});

exports.list = asyncHandler(async (req, res) => {
  const options = parsePagination(req.query);
  const [items, total] = await Promise.all([
    PromoCode.find().sort(newestFirst).skip(options.skip).limit(options.limit).lean(),
    PromoCode.countDocuments(),
  ]);
  res.json(paginated(items, total, options));
});

exports.usage = asyncHandler(async (req, res) => {
  const { promoCodeId } = req.query;
  const filter = {};
  if (promoCodeId != null && !mongoose.isObjectIdOrHexString(promoCodeId)) {
    throw ApiError.badRequest('Choose a valid promo code');
  }
  if (promoCodeId) filter.promoCode = promoCodeId;
  const options = parsePagination(req.query);
  const [rows, total] = await Promise.all([
    PromoRedemption.find(filter).sort(newestFirst).skip(options.skip).limit(options.limit)
      .populate({ path: 'promoCode', select: 'code', transform: keepReference })
      .populate({ path: 'reservation', select: 'deposit.promoDiscount', transform: keepReference }).lean(),
    PromoRedemption.countDocuments(filter),
  ]);
  const items = rows.map((row) => ({
    _id: row._id,
    promoCodeId: row.promoCode?._id,
    code: row.promoCode?.code,
    userId: row.user,
    reservationId: row.reservation?._id,
    discountApplied: row.reservation?.deposit?.promoDiscount ?? row.discountApplied ?? null,
    createdAt: row.createdAt,
  }));
  res.json(paginated(items, total, options));
});
