/**
 * ADMINITEMS CONTROLLER - Owner: Member 9 (Favorites, Notices & Category/Admin Listing Views)
 * Requirements: 23
 * Mounted at /api/admin-items (see routes/adminItems.routes.js). Conventions: see docs/TEAM_WORKFLOW.md
 */
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

/**
 * GET /api/admin-items - Req 23 - admin
 * All item listings on the platform (paginated)
 * TODO: implement
 */
exports.listAllItems = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('listAllItems');
});
