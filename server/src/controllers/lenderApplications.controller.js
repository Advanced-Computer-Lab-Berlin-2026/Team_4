/**
 * LENDERAPPLICATIONS CONTROLLER - Owner: Member 3 (Verified-Lender Application & Review)
 * Requirements: 2, 3
 * Mounted at /api/lender-applications (see routes/lenderApplications.routes.js). Conventions: see docs/TEAM_WORKFLOW.md
 */
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

/**
 * GET /api/lender-applications/mine - Req 2, 3 - member
 * Current user's application (draft/pending/approved/rejected)
 * TODO: implement
 */
exports.getMyApplication = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('getMyApplication');
});

/**
 * POST /api/lender-applications/documents - Req 3 - member
 * Upload a document (multipart: type + file)
 * TODO: implement
 */
exports.uploadDocument = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('uploadDocument');
});

/**
 * GET /api/lender-applications/documents/:docId - Req 3 - member
 * Owner previews one of their own documents
 * TODO: implement
 */
exports.previewDocument = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('previewDocument');
});

/**
 * DELETE /api/lender-applications/documents/:docId - Req 3 - member
 * Remove an uploaded document
 * TODO: implement
 */
exports.removeDocument = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('removeDocument');
});

/**
 * POST /api/lender-applications/submit - Req 2 - member
 * Submit the application (requires ID + proof of address)
 * TODO: implement
 */
exports.submitApplication = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('submitApplication');
});
