/**
 * ITEMS CONTROLLER - Owner: Member 5 (Lender Item Listing Management)
 * Requirements: 13, 14, 15, 21
 * Mounted at /api/items (see routes/items.routes.js). Conventions: see docs/TEAM_WORKFLOW.md
 */
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

/**
 * GET /api/items/mine - Req 21 - verified lender
 * All items owned by the current lender (incl. archived)
 * TODO: implement
 */
exports.listMyItems = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('listMyItems');
});

/**
 * POST /api/items - Req 13 - verified lender
 * Create a listing (multipart: fields + photos[])
 * TODO: implement
 */
exports.createItem = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('createItem');
});

/**
 * GET /api/items/:id - Req 14 - verified lender
 * One of my items for the edit form
 * TODO: implement
 */
exports.getMyItem = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('getMyItem');
});

/**
 * PUT /api/items/:id - Req 14 - verified lender
 * Edit details, deposit amount, category
 * TODO: implement
 */
exports.updateItem = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('updateItem');
});

/**
 * POST /api/items/:id/photos - Req 13, 14 - verified lender
 * Add photos to an existing listing
 * TODO: implement
 */
exports.addPhotos = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('addPhotos');
});

/**
 * DELETE /api/items/:id/photos/:photoId - Req 14 - verified lender
 * Remove one photo
 * TODO: implement
 */
exports.removePhoto = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('removePhoto');
});

/**
 * PATCH /api/items/:id/archive - Req 15 - verified lender
 * Archive (hidden from search, history kept)
 * TODO: implement
 */
exports.archiveItem = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('archiveItem');
});

/**
 * PATCH /api/items/:id/unarchive - Req 15 - verified lender
 * Unarchive
 * TODO: implement
 */
exports.unarchiveItem = asyncHandler(async (req, res) => {
  throw ApiError.notImplemented('unarchiveItem');
});
