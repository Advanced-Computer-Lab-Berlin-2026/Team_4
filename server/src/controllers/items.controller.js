/**
 * ITEMS CONTROLLER - Owner: Member 5 (Lender Item Listing Management)
 * Requirements: 13, 14, 15, 21
 * Mounted at /api/items (see routes/items.routes.js). Conventions: see docs/TEAM_WORKFLOW.md
 */
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const Item = require('../models/Item');
const Category = require('../models/Category');
const sharp = require('sharp');
const { fileInfo, removeFile } = require('../middleware/upload');

const MAX_PHOTOS = 8; // per item, across all uploads (decision B)
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

/** Decode every image, not just its header, before accepting it as a listing photo. */
const assertRealImages = async (files) => {
  for (const file of files) {
    try {
      const image = sharp(file.path, { failOn: 'warning', limitInputPixels: 25000000 });
      const metadata = await image.metadata();
      if (!['jpeg', 'png'].includes(metadata.format) || (metadata.pages || 1) > 1) throw new Error('Unsupported image');
      await image.raw().toBuffer(); // force pixel decoding so truncated/corrupt data is rejected
    } catch {
      const message = `"${file.originalname}" must be a complete JPG or PNG image (up to 25 megapixels)`;
      throw ApiError.badRequest(message, [{ field: 'photos', message }]);
    }
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
  await assertRealImages(files);
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

/** Route middleware: 404 unless :id is one of my items. Used before uploads so nothing is saved for other items. */
exports.loadMyItem = asyncHandler(async (req, res, next) => {
  await findMyItem(req);
  next();
});

/**
 * POST /api/items/:id/photos - Req 13, 14 - verified lender
 * Add photos to an existing listing (multipart: photos[]). Max 8 photos per item in total.
 * Photos already saved are cleaned up by the routes file if anything fails.
 */
exports.addPhotos = asyncHandler(async (req, res) => {
  const files = req.files || [];
  if (files.length === 0) {
    throw ApiError.badRequest('Add at least one photo', [{ field: 'photos', message: 'Add at least one photo' }]);
  }
  await assertRealImages(files);

  // Atomic: only push if the item will still have at most 8 photos (safe against two uploads at once).
  const roomFilter = { [`photos.${MAX_PHOTOS - files.length}`]: { $exists: false } };
  const item = await Item.findOneAndUpdate(
    { _id: req.params.id, owner: req.user._id, ...roomFilter },
    { $push: { photos: { $each: files.map(toPhoto) } } },
    { new: true, runValidators: true },
  ).populate('category', 'name slug');
  if (!item) {
    const current = await findMyItem(req);
    const left = Math.max(MAX_PHOTOS - current.photos.length, 0);
    const message = `An item can have up to ${MAX_PHOTOS} photos. You can add ${left} more.`;
    throw ApiError.badRequest(message, [{ field: 'photos', message }]);
  }
  res.json({ item });
});

/**
 * DELETE /api/items/:id/photos/:photoId - Req 14 - verified lender
 * Remove one photo and delete its file. The last photo can't be removed (an item needs at least one).
 */
exports.removePhoto = asyncHandler(async (req, res) => {
  const { id, photoId } = req.params;
  // Atomic: only pull if the item has this photo AND at least 2 photos (safe against two deletes at once).
  const before = await Item.findOneAndUpdate(
    { _id: id, owner: req.user._id, 'photos._id': photoId, 'photos.1': { $exists: true } },
    { $pull: { photos: { _id: photoId } } },
    { new: false },
  );
  if (!before) {
    const current = await findMyItem(req); // 404 if not mine
    if (!current.photos.some((p) => p._id.equals(photoId))) throw ApiError.notFound('Photo not found');
    throw ApiError.badRequest('An item must keep at least one photo. Add another photo before removing this one.');
  }

  const removed = before.photos.find((p) => p._id.equals(photoId));
  if (removed.path && removed.path.startsWith('public/items/')) removeFile(removed.path); // never the shared placeholder
  const item = await findMyItem(req);
  res.json({ item });
});

/**
 * Flip isArchived in one atomic step (only if it is currently the opposite), so double clicks can't conflict.
 * Nothing is deleted: photos, history and anything that references the item stay (Req 15).
 */
const setArchived = async (req, archive) => {
  const update = archive
    ? { $set: { isArchived: true, archivedAt: new Date() } }
    : { $set: { isArchived: false }, $unset: { archivedAt: 1 } };
  const item = await Item.findOneAndUpdate(
    { _id: req.params.id, owner: req.user._id, isArchived: !archive },
    update,
    { new: true },
  ).populate('category', 'name slug');
  if (!item) {
    await findMyItem(req); // 404 if it is not my item
    throw ApiError.conflict(archive ? 'Item is already archived' : 'Item is not archived');
  }
  return item;
};

/**
 * PATCH /api/items/:id/archive - Req 15 - verified lender
 * Archive: hidden from search (Item.publicFilter), reservation history kept.
 */
exports.archiveItem = asyncHandler(async (req, res) => {
  res.json({ item: await setArchived(req, true) });
});

/**
 * PATCH /api/items/:id/unarchive - Req 15 - verified lender
 * Unarchive: the item shows up in search again.
 */
exports.unarchiveItem = asyncHandler(async (req, res) => {
  res.json({ item: await setArchived(req, false) });
});
