/**
 * NOTICES CONTROLLER - Owner: Member 9 (Favorites, Notices & Category/Admin Listing Views)
 * Requirements: 41, 42
 * Mounted at /api/notices (see routes/notices.routes.js). Conventions: see docs/TEAM_WORKFLOW.md
 */
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

/**
 * GET /api/notices - Req 42 - any logged-in user
 * Notice board (newest first)
 * TODO: implement
 */
exports.listNotices = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('listNotices');
});

/**
 * POST /api/notices - Req 41 - admin
 * Post a community notice
 * TODO: implement
 */
exports.createNotice = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('createNotice');
});
