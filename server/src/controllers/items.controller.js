/**
 * ITEMS CONTROLLER - Owner: Member 5 (Lender Item Listing Management)
 * Requirements: 13, 14, 15, 21
 * Mounted at /api/items (see routes/items.routes.js). Conventions: see docs/TEAM_WORKFLOW.md
 */
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const Item = require('../models/Item');
const Category = require('../models/Category');
const fs = require('fs');
const { fileInfo } = require('../middleware/upload');
const { parsePagination, paginated } = require('../utils/pagination');

/** Load one of the current lender's items (archived included). Another lender's item is a 404, so we don't reveal it exists. */
const findMyItem = async (req) => {
  const item = await Item.findOne({ _id: req.params.id, owner: req.user._id }).populate('category', 'name slug');
  if (!item) throw ApiError.notFound('Item not found');
  return item;
};

/** Only these fields can be set by the lender (owner, archive and moderation fields never come from the body). */
const pickItemFields = (body) => {
  const fields = {};
  ['title', 'description', 'category', 'depositAmount', 'conditionNotes'].forEach((k) => {
    if (body[k] !== undefined) fields[k] = body[k];
  });
  return fields;
};

const assertActiveCategory = async (id) => {
  const category = await Category.findOne({ _id: id, isActive: true });
  if (!category) throw ApiError.badRequest('Choose a valid category', [{ field: 'category', message: 'Choose a valid category' }]);
};

/** The upload middleware trusts the file name/type label; also check the file really starts like a JPG or PNG. */
const looksLikeImage = (file) => {
  const head = Buffer.alloc(8);
  const fd = fs.openSync(file.path, 'r');
  try { fs.readSync(fd, head, 0, 8, 0); } finally { fs.closeSync(fd); }
  const isPng = head.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  return isPng || isJpg;
};

const assertRealImages = (files) => {
  const bad = files.find((f) => !looksLikeImage(f));
  if (bad) {
    const message = `"${bad.originalname}" is not a valid JPG or PNG image`;
    throw ApiError.badRequest(message, [{ field: 'photos', message }]);
  }
};

const toPhoto = (file) => {
  const { url, path, originalName } = fileInfo(file);
  return { url, path, originalName };
};

/**
 * GET /api/items/mine - Req 21 - verified lender
 * All items owned by the current lender (incl. archived), newest first.
 * Query: status=all|active|archived (default all), page, limit (default 12, max 50).
 */
exports.listMyItems = asyncHandler(async (req, res) => {
  const filter = { owner: req.user._id };
  if (req.query.status === 'active') filter.isArchived = false;
  if (req.query.status === 'archived') filter.isArchived = true;

  const pg = parsePagination(req.query);
  const [items, total] = await Promise.all([
    Item.find(filter).sort({ createdAt: -1, _id: -1 }).skip(pg.skip).limit(pg.limit).populate('category', 'name slug'),
    Item.countDocuments(filter),
  ]);
  res.json(paginated(items, total, pg));
});

/**
 * POST /api/items - Req 13 - verified lender
 * Create a listing (multipart: fields + photos[]). Fields are validated in items.routes.js.
 * Requires 1-8 photos. Photos already saved are cleaned up by the routes file if anything fails.
 */
exports.createItem = asyncHandler(async (req, res) => {
  const files = req.files || [];
  if (files.length === 0) { // more than 8 is already rejected by the upload middleware
    throw ApiError.badRequest('Add at least one photo', [{ field: 'photos', message: 'Add at least one photo' }]);
  }
  assertRealImages(files);
  const fields = pickItemFields(req.body);
  await assertActiveCategory(fields.category);

  const item = await Item.create({ ...fields, owner: req.user._id, photos: files.map(toPhoto) });
  await item.populate('category', 'name slug');
  res.status(201).json({ item });
});

/**
 * GET /api/items/:id - Req 14 - verified lender
 * One of my items for the edit form (archived included)
 */
exports.getMyItem = asyncHandler(async (req, res) => {
  const item = await findMyItem(req);
  res.json({ item });
});

/**
 * PUT /api/items/:id - Req 14 - verified lender
 * Edit details, deposit amount, category (JSON). Partial updates: only the fields sent are changed.
 * Owner, archive, moderation, photos and Member 6's pickup/rules/manual are ignored here.
 */
exports.updateItem = asyncHandler(async (req, res) => {
  const fields = pickItemFields(req.body || {});
  if (Object.keys(fields).length === 0) throw ApiError.badRequest('Nothing to update');
  const item = await findMyItem(req);
  if (fields.category) await assertActiveCategory(fields.category);

  item.set(fields);
  await item.save();
  await item.populate('category', 'name slug');
  res.json({ item });
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
