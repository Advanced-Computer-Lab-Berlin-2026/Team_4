/**
 * PASSWORDRESET CONTROLLER - Owner: Member 2 (Account, Passwords & Wallet)
 * Requirements: 11
 * Mounted at /api/password-reset (see routes/passwordReset.routes.js). Conventions: see docs/TEAM_WORKFLOW.md
 */
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

/**
 * POST /api/password-reset/request - Req 11 - public
 * Generate OTP, store its hash, email it
 * TODO: implement
 */
exports.requestOtp = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('requestOtp');
});

/**
 * POST /api/password-reset/confirm - Req 11 - public
 * Verify OTP and set the new password
 * TODO: implement
 */
exports.confirmReset = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('confirmReset');
});
