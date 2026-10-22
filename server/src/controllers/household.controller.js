/**
 * HOUSEHOLD CONTROLLER - Owner: Member 8 (Household Linking)
 * Requirements: 24, 25, 26, 27
 * Mounted at /api/household (see routes/household.routes.js). Conventions: see docs/TEAM_WORKFLOW.md
 */
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

/**
 * GET /api/household - Req 26 - member
 * My links (incoming + outgoing) with status
 * TODO: implement
 */
exports.listLinks = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('listLinks');
});

/**
 * POST /api/household/requests - Req 24 - member
 * Send request by email/phone + relation
 * TODO: implement
 */
exports.sendRequest = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('sendRequest');
});

/**
 * PATCH /api/household/requests/:id/respond - Req 25 - member
 * Accept or decline an incoming request
 * TODO: implement
 */
exports.respondToRequest = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('respondToRequest');
});

/**
 * DELETE /api/household/:id - Req 27 - member
 * Unlink
 * TODO: implement
 */
exports.removeLink = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('removeLink');
});
