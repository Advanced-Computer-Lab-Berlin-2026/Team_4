/**
 * ACCOUNT CONTROLLER - Owner: Member 2 (Account, Passwords & Wallet)
 * Requirements: 10, 12, 36
 * Mounted at /api/account (see routes/account.routes.js). Conventions: see docs/TEAM_WORKFLOW.md
 */
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

/**
 * PUT /api/account/password - Req 10 - any logged-in user
 * Change own password (member or admin)
 * TODO: implement
 */
exports.changePassword = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('changePassword');
});

/**
 * PUT /api/account/profile - Req 12 - member
 * Edit phone number / address
 * TODO: implement
 */
exports.updateProfile = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('updateProfile');
});

/**
 * GET /api/account/wallet - Req 36 - member
 * Return wallet balance
 * TODO: implement
 */
exports.getWallet = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('getWallet');
});
