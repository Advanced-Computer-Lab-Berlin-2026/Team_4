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
 * TODO(M6): validate, update, return { category }.
 */
exports.setDepositMultiplier = asyncHandler(async () => {
  throw ApiError.notImplemented('setDepositMultiplier');
});
