/**
 * ADMINS CONTROLLER - Owner: Member 1 (Authentication, Sessions & Admin Accounts)
 * Requirements: 6
 * Mounted at /api/admins (see routes/admins.routes.js). Conventions: see docs/TEAM_WORKFLOW.md
 */
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

/**
 * POST /api/admins - Req 6 - admin
 * Create another admin account
 * TODO: implement
 */
exports.createAdmin = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('createAdmin');
});
