/**
 * ADMINUSERS CONTROLLER - Owner: Member 4 (Admin User Management)
 * Requirements: 7, 22, 28, 29, 39
 * Mounted at /api/admin-users (see routes/adminUsers.routes.js). Conventions: see docs/TEAM_WORKFLOW.md
 */
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

/**
 * GET /api/admin-users - Req 28, 29 - admin
 * List/search users (q=name, role, lenderStatus, status, page)
 * TODO: implement
 */
exports.listUsers = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('listUsers');
});

/**
 * GET /api/admin-users/:id - Req 22 - admin
 * Basic information for one user
 * TODO: implement
 */
exports.getUser = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('getUser');
});

/**
 * PATCH /api/admin-users/:id/status - Req 39 - admin
 * Suspend or reinstate an account
 * TODO: implement
 */
exports.setUserStatus = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('setUserStatus');
});

/**
 * DELETE /api/admin-users/:id - Req 7 - admin
 * Remove a member/lender/admin (+ cascade cleanup)
 * TODO: implement
 */
exports.removeUser = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('removeUser');
});
