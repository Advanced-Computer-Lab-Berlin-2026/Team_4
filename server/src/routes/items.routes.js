// ITEMS ROUTES - Owner: Member 5 - mounted automatically at /api/items
const router = require('express').Router();
const { body, param, query } = require('express-validator');
const c = require('../controllers/items.controller');
const { protect } = require('../middleware/auth');
const { requireVerifiedLender } = require('../middleware/roles');
const { uploadItemPhotos, removeFile, fileInfo } = require('../middleware/upload');
const validate = require('../middleware/validate');
const multer = require('multer');
const ApiError = require('../utils/ApiError');
const Item = require('../models/Item');

const MAX_PHOTOS_PER_UPLOAD = 8; // same limit as uploadItemPhotos in middleware/upload.js

// Multipart fields always arrive as strings; anything else (arrays, objects) is rejected.
const isText = (v) => typeof v === 'string';
// Non-negative amount with at most 2 decimals, up to 1,000,000 EGP.
const MONEY_REGEX = /^\d{1,7}(\.\d{1,2})?$/;
const MAX_DEPOSIT = 1000000;

// Count length the same way the database does (an emoji counts as 2), so the friendly message always comes first.
const len = (min, max) => (v) => v.length >= min && v.length <= max;

// Create: title, description, category and deposit are required. Edit (partial = true): every field is optional,
// but any field that IS sent must pass the same rule (e.g. a title can't be changed to empty).
const itemFieldRules = (partial = false) => {
  const field = (name) => (partial ? body(name).optional() : body(name));
  return [
    field('title').custom(isText).withMessage('Title is required').bail()
      .trim().custom(len(1, 120)).withMessage('Title is required (up to 120 characters)'),
    field('description').custom(isText).withMessage('Description is required').bail()
      .trim().custom(len(1, 4000)).withMessage('Description is required (up to 4000 characters)'),
    field('category').custom(isText).withMessage('Category is required').bail()
      .trim().isMongoId().withMessage('Choose a valid category'),
    field('depositAmount').custom((v) => isText(v) || typeof v === 'number').withMessage('Deposit amount is required').bail()
      .custom((v) => MONEY_REGEX.test(String(v).trim()) && Number(v) <= MAX_DEPOSIT)
      .withMessage(`Deposit must be a number from 0 to ${MAX_DEPOSIT} with at most 2 decimals`).bail()
      .customSanitizer((v) => Number(String(v).trim())),
    body('conditionNotes').optional().custom(isText).withMessage('Condition notes must be text').bail()
      .trim().custom(len(0, 2000)).withMessage('Condition notes can be up to 2000 characters'),
  ];
};

// ---- Tags (Sprint 2, for Member 7's alternatives - Req 92) ----
// Optional on create and edit: 0-10 tags, each 1-30 characters of letters (any language), numbers, spaces and hyphens.
// Multipart create sends one `tags` field per tag (a single tag arrives as a string); JSON edit sends a list.
// Tags are cleaned (trimmed, single spaces, lower case, empty ones and duplicates removed) before they are checked.
const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 30;
const TAG_REGEX = /^[\p{L}\p{M}\p{N}](?:[\p{L}\p{M}\p{N} -]*[\p{L}\p{M}\p{N}])?$/u; // no leading/trailing space or hyphen
const TAG_FORMAT_MESSAGE = `Tags can contain letters, numbers, spaces and hyphens (up to ${MAX_TAG_LENGTH} characters)`;
const tagError = (message) => ApiError.badRequest(message, [{ field: 'tags', message }]);

const normalizeTags = (req, res, next) => {
  if (!req.body || req.body.tags === undefined) return next(); // not sent: the item's tags stay as they are
  const raw = isText(req.body.tags) ? [req.body.tags] : req.body.tags;
  if (!Array.isArray(raw) || !raw.every(isText)) return next(tagError('Tags must be a list of words'));
  const tags = [...new Set(raw.map((t) => t.trim().replace(/\s+/g, ' ').toLowerCase()).filter(Boolean))];
  if (tags.length > MAX_TAGS) return next(tagError(`You can add up to ${MAX_TAGS} tags`));
  if (!tags.every((t) => t.length <= MAX_TAG_LENGTH && TAG_REGEX.test(t))) return next(tagError(TAG_FORMAT_MESSAGE));
  req.body.tags = tags;
  return next();
};

const itemIdParam = param('id').isMongoId().withMessage('Invalid item id');
const listQueryRules = [
  query('status').optional().custom((v) => isText(v) && ['all', 'active', 'archived'].includes(v))
    .withMessage('status must be all, active or archived'),
];

router.get('/mine', protect, requireVerifiedLender, listQueryRules, validate, c.listMyItems); // Req 21
router.post('/', protect, requireVerifiedLender, uploadItemPhotos, itemFieldRules(), validate, normalizeTags, c.createItem); // Req 13 (+ tags, Req 92)
router.get('/:id', protect, requireVerifiedLender, itemIdParam, validate, c.getMyItem); // Req 14
router.put('/:id', protect, requireVerifiedLender, itemIdParam, itemFieldRules(true), validate, normalizeTags, c.updateItem); // Req 14 (+ tags, Req 92)
// Ownership is checked BEFORE the upload, so no files are saved for someone else's item.
router.post('/:id/photos', protect, requireVerifiedLender, itemIdParam, validate, c.loadMyItem, uploadItemPhotos, c.addPhotos); // Req 13, 14
router.delete('/:id/photos/:photoId', protect, requireVerifiedLender, itemIdParam,
  param('photoId').isMongoId().withMessage('Invalid photo id'), validate, c.removePhoto); // Req 14
router.patch('/:id/archive', protect, requireVerifiedLender, itemIdParam, validate, c.archiveItem); // Req 15
router.patch('/:id/unarchive', protect, requireVerifiedLender, itemIdParam, validate, c.unarchiveItem); // Req 15

// If a request fails after photos were saved to disk, delete them so no orphan files are left.
// Also turns multer's vague "Unexpected field" (more than 8 photos in one upload) into a clear message.
router.use(async (err, req, res, next) => {
  const paths = (req.files || []).map((file) => fileInfo(file).path);
  if (paths.length) {
    try {
      // A write may have succeeded before a subsequent populate/read failed.
      // Delete only unreferenced uploads; on database uncertainty preserve files.
      const items = await Item.find({ 'photos.path': { $in: paths } }).select('photos.path').lean();
      const referenced = new Set(items.flatMap((item) => item.photos.map((photo) => photo.path)));
      paths.filter((path) => !referenced.has(path)).forEach(removeFile);
    } catch { /* Never destroy possibly committed photos when the database is unavailable. */ }
  }
  if (err instanceof multer.MulterError && err.code === 'LIMIT_UNEXPECTED_FILE' && err.field === 'photos') {
    return next(ApiError.badRequest(`You can add up to ${MAX_PHOTOS_PER_UPLOAD} photos`, [{ field: 'photos', message: `You can add up to ${MAX_PHOTOS_PER_UPLOAD} photos` }]));
  }
  next(err);
});

module.exports = router;
