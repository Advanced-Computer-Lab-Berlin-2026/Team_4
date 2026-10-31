/**
 * ITEMPOLICIES CONTROLLER - Owner: Member 6 (Item Policies & Category Configuration)
 * Requirements: 30, 31, 32
 * Mounted at /api/item-policies (see routes/itemPolicies.routes.js). Conventions: see docs/TEAM_WORKFLOW.md
 */
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const Item = require('../models/Item');
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');
const { fileInfo, removeFile } = require('../middleware/upload');

const findOwnedItem = async (itemId, ownerId) => {
  const item = await Item.findOne({ _id: itemId, owner: ownerId });
  if (!item) throw ApiError.notFound('Item not found');
  return item;
};

/**
 * PUT /api/item-policies/:itemId/pickup - Req 30 - verified lender
 * Set pickup location + instructions
 */
exports.setPickup = asyncHandler(async (req, res) => {
  if (typeof req.body.location !== 'string' || (req.body.instructions !== undefined && typeof req.body.instructions !== 'string')) {
    throw ApiError.badRequest('Pickup location and instructions must be text');
  }
  const location = req.body.location.trim();
  const instructions = (req.body.instructions || '').trim();

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
 */
exports.setRules = asyncHandler(async (req, res) => {
  const maxBorrowDaysRaw = req.body.maxBorrowDays;
  const minTrustScoreRaw = req.body.minTrustScore;
  const errors = [];
  for (const [field, value] of Object.entries({ maxBorrowDays: maxBorrowDaysRaw, minTrustScore: minTrustScoreRaw })) {
    if (value !== undefined && value !== null && typeof value !== 'number' && typeof value !== 'string') {
      throw ApiError.badRequest(`${field} must be a number or numeric text`);
    }
    if (typeof value === 'string' && value !== '' && !/^\d+$/.test(value)) {
      throw ApiError.badRequest(`${field} must be a whole number`);
    }
  }

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

// File cleanup is conservative: an uncertain database result must never destroy
// a manual that may already have been committed.
const removeUnreferenced = async (manualPath) => {
  if (!manualPath || !/^public\/manuals\/[^/\\]+$/.test(manualPath)) return;
  try {
    if (!await Item.exists({ 'manual.path': manualPath })) removeFile(manualPath);
  } catch { /* Retain the file until its references can be established safely. */ }
};

const validateManual = async (file) => {
  try {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.mimetype === 'application/pdf' && ext === '.pdf') {
      const bytes = await fs.readFile(file.path);
      if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-')) || !bytes.toString('latin1').trimEnd().endsWith('%%EOF')) {
        throw new Error('Incomplete PDF');
      }
      const pdf = await PDFDocument.load(bytes, { throwOnInvalidObject: true });
      if (!pdf.getPageCount()) throw new Error('Empty PDF');
      pdf.getPages();
    } else {
      const expected = file.mimetype === 'image/png' && ext === '.png' ? 'png'
        : file.mimetype === 'image/jpeg' && ['.jpg', '.jpeg'].includes(ext) ? 'jpeg' : null;
      if (!expected) throw new Error('Unsupported manual');
      const image = sharp(file.path, { failOn: 'warning', limitInputPixels: 25000000 });
      const metadata = await image.metadata();
      if (metadata.format !== expected || (metadata.pages || 1) > 1) throw new Error('Wrong image format');
      await image.raw().toBuffer();
    }
  } catch {
    throw ApiError.badRequest('Upload a complete, readable PDF, JPG or PNG manual (images up to 25 megapixels)');
  }
};

// Match the manual read by this request. A concurrent replacement/removal wins
// only once; query updates do not overwrite unrelated item fields.
const manualFilter = (item) => ({
  _id: item._id, owner: item.owner,
  'manual.path': item.manual?.path || { $exists: false },
});

exports.uploadManual = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('Manual file is required');
  const info = fileInfo(req.file);
  let previousPath;
  let updated;
  try {
    const item = await findOwnedItem(req.params.itemId, req.user._id);
    previousPath = item.manual?.path;
    await validateManual(req.file);
    updated = await Item.findOneAndUpdate(manualFilter(item), { $set: { manual: {
      url: info.url, path: info.path, originalName: info.originalName,
      mimeType: info.mimeType, uploadedAt: info.uploadedAt,
    } } }, { new: true, runValidators: true });
    if (!updated) throw ApiError.conflict('The manual changed. Refresh and try again.');
  } catch (err) {
    await removeUnreferenced(info.path);
    throw err;
  }
  await removeUnreferenced(previousPath);
  res.status(201).json({ item: updated });
});

exports.removeManual = asyncHandler(async (req, res) => {
  const item = await findOwnedItem(req.params.itemId, req.user._id);
  const previousPath = item.manual?.path;
  const updated = await Item.findOneAndUpdate(manualFilter(item), { $unset: { manual: 1 } }, { new: true });
  if (!updated) throw ApiError.conflict('The manual changed. Refresh and try again.');
  await removeUnreferenced(previousPath);
  res.json({ item: updated });
});
