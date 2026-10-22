/**
 * ITEMPOLICIES CONTROLLER - Owner: Member 6 (Item Policies & Category Configuration)
 * Requirements: 30, 31, 32
 * Mounted at /api/item-policies (see routes/itemPolicies.routes.js). Conventions: see docs/TEAM_WORKFLOW.md
 */
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

/**
 * PUT /api/item-policies/:itemId/pickup - Req 30 - verified lender
 * Set pickup location + instructions
 * TODO: implement
 */
exports.setPickup = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('setPickup');
});

/**
 * PUT /api/item-policies/:itemId/rules - Req 31 - verified lender
 * Set maxBorrowDays / minTrustScore
 * TODO: implement
 */
exports.setRules = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('setRules');
});

/**
 * POST /api/item-policies/:itemId/manual - Req 32 - verified lender
 * Upload usage manual (multipart: file)
 * TODO: implement
 */
exports.uploadManual = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('uploadManual');
});

/**
 * DELETE /api/item-policies/:itemId/manual - Req 32 - verified lender
 * Remove the manual
 * TODO: implement
 */
exports.removeManual = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('removeManual');
});
