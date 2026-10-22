/**
 * FAVORITES CONTROLLER - Owner: Member 9 (Favorites, Notices & Category/Admin Listing Views)
 * Requirements: 37, 38
 * Mounted at /api/favorites (see routes/favorites.routes.js). Conventions: see docs/TEAM_WORKFLOW.md
 */
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

/**
 * GET /api/favorites - Req 38 - member
 * My favorites with item data
 * TODO: implement
 */
exports.listFavorites = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('listFavorites');
});

/**
 * GET /api/favorites/ids - Req 37 - member
 * Only item ids (for heart-button state)
 * TODO: implement
 */
exports.listFavoriteIds = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('listFavoriteIds');
});

/**
 * POST /api/favorites/:itemId - Req 37 - member
 * Add to favorites
 * TODO: implement
 */
exports.addFavorite = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('addFavorite');
});

/**
 * DELETE /api/favorites/:itemId - Req 38 - member
 * Remove from favorites
 * TODO: implement
 */
exports.removeFavorite = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('removeFavorite');
});
