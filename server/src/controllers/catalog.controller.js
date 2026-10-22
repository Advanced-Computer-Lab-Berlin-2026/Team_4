/**
 * CATALOG CONTROLLER - Owner: Member 7 (Public Catalog, Search & Item Details)
 * Requirements: 16, 17, 18, 19, 20, 35
 * Mounted at /api/catalog (see routes/catalog.routes.js). Conventions: see docs/TEAM_WORKFLOW.md
 */
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

/**
 * GET /api/catalog - Req 16, 17, 18, 35 - public
 * Public list: q (name), category, page, limit, sort. Use Item.publicFilter()
 * TODO: implement
 */
exports.listItems = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('listItems');
});

/**
 * GET /api/catalog/:id - Req 19, 20, 35 - public
 * Item details + owner name + category
 * TODO: implement
 */
exports.getItem = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('getItem');
});
