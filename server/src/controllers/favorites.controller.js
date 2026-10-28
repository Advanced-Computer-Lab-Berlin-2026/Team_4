/**
 * FAVORITES CONTROLLER - Owner: Member 9 (Favorites, Notices & Category/Admin Listing Views)
 * Requirements: 37, 38
 * Mounted at /api/favorites (see routes/favorites.routes.js). Conventions: see docs/TEAM_WORKFLOW.md
 */
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const mongoose = require('mongoose');
const Favorite = require('../models/Favorite');
const Item = require('../models/Item');

/**
 * GET /api/favorites - Req 38 - member
 * My favorites with item data
 */
exports.listFavorites = asyncHandler(async (req, res) => {
  const favorites = await Favorite.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .populate({
      path: 'item',
      match: Item.publicFilter(),
      populate: [
        { path: 'owner', select: 'name username' },
        { path: 'category', select: 'name slug' },
      ],
    });

  res.json({ favorites: favorites.filter((favorite) => favorite.item) });
});

/**
 * GET /api/favorites/ids - Req 37 - member
 * Only item ids (for heart-button state)
 */
exports.listFavoriteIds = asyncHandler(async (req, res) => {
  const favorites = await Favorite.find({ user: req.user._id }).select('item -_id').lean();
  res.json({ ids: favorites.map((favorite) => favorite.item.toString()) });
});

/**
 * POST /api/favorites/:itemId - Req 37 - member
 * Add to favorites
 */
exports.addFavorite = asyncHandler(async (req, res) => {
  const { itemId } = req.params;
  if (!mongoose.isValidObjectId(itemId)) throw ApiError.badRequest('Invalid item id');

  const item = await Item.findOne(Item.publicFilter({ _id: itemId })).select('_id');
  if (!item) throw ApiError.notFound('Item not found');

  const favorite = await Favorite.findOneAndUpdate(
    { user: req.user._id, item: item._id },
    { $setOnInsert: { user: req.user._id, item: item._id } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  res.status(201).json({ favorite });
});

/**
 * DELETE /api/favorites/:itemId - Req 38 - member
 * Remove from favorites
 */
exports.removeFavorite = asyncHandler(async (req, res) => {
  const { itemId } = req.params;
  if (!mongoose.isValidObjectId(itemId)) throw ApiError.badRequest('Invalid item id');

  const favorite = await Favorite.findOneAndDelete({ user: req.user._id, item: itemId });
  if (!favorite) throw ApiError.notFound('Favorite not found');

  res.json({ message: 'Favorite removed' });
});
