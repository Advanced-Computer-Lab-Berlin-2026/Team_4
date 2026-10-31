/**
 * CATEGORIES CONTROLLER - Owner: Member 6
 * Requirements: 40 (deposit multiplier). listCategories + getCategory are PRE-IMPLEMENTED because
 * Members 5, 7 and 9 all need categories on day 1.
 */
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const Category = require('../models/Category');

/** GET /api/categories - public */
exports.listCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find({ isActive: true }).sort('name');
  res.json({ categories });
});

/** GET /api/categories/:slug - public */
exports.getCategory = asyncHandler(async (req, res) => {
  const category = await Category.findOne({ slug: req.params.slug, isActive: true });
  if (!category) throw ApiError.notFound('Category not found');
  res.json({ category });
});

/**
 * PATCH /api/categories/:id/deposit-multiplier - Req 40 - admin
 * body: { depositMultiplier }  (number >= 1, e.g. 1.5 for power tools)
 */
exports.setDepositMultiplier = asyncHandler(async (req, res) => {
  const raw = req.body.depositMultiplier;
  if ((typeof raw !== 'number' && typeof raw !== 'string') ||
      (typeof raw === 'string' && !/^\d+(?:\.\d+)?$/.test(raw.trim()))) {
    throw ApiError.badRequest('Deposit multiplier must be a number');
  }
  const depositMultiplier = Number(raw);

  if (!Number.isFinite(depositMultiplier) || depositMultiplier < 1 || depositMultiplier > 10) {
    throw ApiError.badRequest('Deposit multiplier must be a number from 1 to 10', [
      { field: 'depositMultiplier', message: 'Deposit multiplier must be a number from 1 to 10' },
    ]);
  }

  const category = await Category.findById(req.params.id);
  if (!category) throw ApiError.notFound('Category not found');

  category.depositMultiplier = Math.round(depositMultiplier * 100) / 100;
  await category.save();
  res.json({ category });
});
