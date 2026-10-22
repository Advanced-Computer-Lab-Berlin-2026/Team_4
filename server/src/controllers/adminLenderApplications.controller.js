/**
 * ADMINLENDERAPPLICATIONS CONTROLLER - Owner: Member 3 (Verified-Lender Application & Review)
 * Requirements: 8, 9
 * Mounted at /api/admin-lender-applications (see routes/adminLenderApplications.routes.js). Conventions: see docs/TEAM_WORKFLOW.md
 */
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

/**
 * GET /api/admin-lender-applications - Req 9 - admin
 * List applications (filter by status)
 * TODO: implement
 */
exports.listApplications = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('listApplications');
});

/**
 * GET /api/admin-lender-applications/:id - Req 8 - admin
 * One application with applicant info + document list
 * TODO: implement
 */
exports.getApplication = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('getApplication');
});

/**
 * GET /api/admin-lender-applications/:id/documents/:docId - Req 8 - admin
 * Stream a private document file to the admin
 * TODO: implement
 */
exports.downloadDocument = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('downloadDocument');
});

/**
 * PATCH /api/admin-lender-applications/:id/decision - Req 9 - admin
 * Accept/reject; accept sets user.lenderStatus='verified'
 * TODO: implement
 */
exports.decideApplication = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('decideApplication');
});
