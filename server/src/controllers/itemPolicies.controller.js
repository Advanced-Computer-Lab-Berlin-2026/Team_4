/**
 * ITEMPOLICIES CONTROLLER - Owner: Member 6 (Item Policies & Category Configuration)
 * Requirements: 30, 31, 32
 * Mounted at /api/item-policies (see routes/itemPolicies.routes.js). Conventions: see docs/TEAM_WORKFLOW.md
 */
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const Item = require('../models/Item');
const { fileInfo, removeFile } = require('../middleware/upload');

const findOwnedItem = async (itemId, ownerId) => {
  const item = await Item.findOne({ _id: itemId, owner: ownerId });
  if (!item) throw ApiError.notFound('Item not found');
  return item;
};

/**
 * PUT /api/item-policies/:itemId/pickup - Req 30 - verified lender
 * Set pickup location + instructions
 * TODO: implement
 */
exports.setPickup = asyncHandler(async (req, res) => {
  const location = String(req.body.location || '').trim();
  const instructions = String(req.body.instructions || '').trim();

  if (!location) {
    throw ApiError.badRequest('Pickup location is required', [
      { field: 'location', message: 'Pickup location is required' },
    ]);
  }
  if (location.length > 200) {
    throw ApiError.badRequest('Pickup location must be 200 characters or fewer', [
      { field: 'location', message: 'Pickup location must be 200 characters or fewer' },
    ]);
  }
  if (instructions.length > 1000) {
    throw ApiError.badRequest('Pickup instructions must be 1000 characters or fewer', [
      { field: 'instructions', message: 'Pickup instructions must be 1000 characters or fewer' },
    ]);
  }

  const item = await findOwnedItem(req.params.itemId, req.user._id);
  item.pickup = { location, instructions };
  await item.save();
  res.json({ item });
});

/**
 * PUT /api/item-policies/:itemId/rules - Req 31 - verified lender
 * Set maxBorrowDays / minTrustScore
 * TODO: implement
 */
exports.setRules = asyncHandler(async (req, res) => {
  const maxBorrowDaysRaw = req.body.maxBorrowDays;
  const minTrustScoreRaw = req.body.minTrustScore;
  const errors = [];

  let maxBorrowDays;
  if (maxBorrowDaysRaw !== undefined && maxBorrowDaysRaw !== null && maxBorrowDaysRaw !== '') {
    maxBorrowDays = Number(maxBorrowDaysRaw);
    if (!Number.isInteger(maxBorrowDays) || maxBorrowDays < 1 || maxBorrowDays > 365) {
      errors.push({ field: 'maxBorrowDays', message: 'Max duration must be a whole number from 1 to 365 days' });
    }
  }

  const minTrustScore = minTrustScoreRaw === undefined || minTrustScoreRaw === null || minTrustScoreRaw === ''
    ? 0
    : Number(minTrustScoreRaw);
  if (!Number.isInteger(minTrustScore) || minTrustScore < 0 || minTrustScore > 100) {
    errors.push({ field: 'minTrustScore', message: 'Minimum trust score must be a whole number from 0 to 100' });
  }
  if (errors.length) throw ApiError.badRequest(errors[0].message, errors);

  const item = await findOwnedItem(req.params.itemId, req.user._id);
  item.rules = { maxBorrowDays, minTrustScore };
  await item.save();
  res.json({ item });
});

/**
 * POST /api/item-policies/:itemId/manual - Req 32 - verified lender
 * Upload usage manual (multipart: file)
 * TODO: implement
 */
exports.uploadManual = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('Manual file is required');

  let item;
  try {
    item = await findOwnedItem(req.params.itemId, req.user._id);
  } catch (err) {
    removeFile(fileInfo(req.file).path);
    throw err;
  }

  if (item.manual?.path) removeFile(item.manual.path);
  const info = fileInfo(req.file);
  item.manual = {
    url: info.url,
    path: info.path,
    originalName: info.originalName,
    mimeType: info.mimeType,
    uploadedAt: info.uploadedAt,
  };
  await item.save();
  res.status(201).json({ item });
});

/**
 * DELETE /api/item-policies/:itemId/manual - Req 32 - verified lender
 * Remove the manual
 * TODO: implement
 */
exports.removeManual = asyncHandler(async (req, res) => {
  const item = await findOwnedItem(req.params.itemId, req.user._id);
  if (item.manual?.path) removeFile(item.manual.path);
  item.set('manual', undefined);
  await item.save();
  res.json({ item });
});
