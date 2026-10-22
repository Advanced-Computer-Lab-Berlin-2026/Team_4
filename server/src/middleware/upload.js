/**
 * File uploads (multer, local disk). ALL storage logic lives here, so moving to
 * Cloudinary/S3 later means changing only this file.
 *
 *   public/  -> served at /uploads/...   (item photos, manuals)
 *   private/ -> NEVER served statically  (lender ID / proof-of-address documents)
 *
 * Presets (use in routes):
 *   uploadLenderDoc    single field "file"      pdf/jpg/png   -> private/lender-docs
 *   uploadItemPhotos   array  field "photos"    jpg/png (<=8) -> public/items
 *   uploadManualFile   single field "file"      pdf/jpg/png   -> public/manuals
 *
 * After upload, use fileInfo(req.file) to get what to store in MongoDB.
 */
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { ALLOWED_DOC_MIME, ALLOWED_IMAGE_MIME, ALLOWED_EXT } = require('../config/constants');

const UPLOADS_ROOT = path.join(__dirname, '..', '..', 'uploads');

function makeUploader({ folder, allowedMime }) {
  const dest = path.join(UPLOADS_ROOT, folder);
  fs.mkdirSync(dest, { recursive: true });
  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, dest),
      filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
    }),
    limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (!allowedMime.includes(file.mimetype) || !ALLOWED_EXT.includes(ext)) {
        const label = allowedMime === ALLOWED_IMAGE_MIME ? 'JPG, JPEG or PNG' : 'PDF, JPG, JPEG or PNG';
        return cb(ApiError.badRequest(`Unsupported file type. Allowed: ${label}`));
      }
      cb(null, true);
    },
  });
}

const lenderDocs = makeUploader({ folder: 'private/lender-docs', allowedMime: ALLOWED_DOC_MIME });
const itemPhotos = makeUploader({ folder: 'public/items', allowedMime: ALLOWED_IMAGE_MIME });
const manuals = makeUploader({ folder: 'public/manuals', allowedMime: ALLOWED_DOC_MIME });

/** Describe an uploaded multer file for storage in MongoDB. `url` is set only for public files. */
function fileInfo(file) {
  const rel = path.relative(UPLOADS_ROOT, file.path).split(path.sep).join('/'); // e.g. public/items/uuid.jpg
  return {
    originalName: file.originalname,
    storedName: file.filename,
    path: rel,
    url: rel.startsWith('public/') ? `/uploads/${rel.slice('public/'.length)}` : undefined,
    mimeType: file.mimetype,
    size: file.size,
    uploadedAt: new Date(),
  };
}

/** Absolute path from a stored relative `path` (e.g. to res.sendFile a private document). */
const absolutePath = (rel) => path.join(UPLOADS_ROOT, rel);

/** Delete a stored file; never throws. */
const removeFile = (rel) => {
  if (!rel) return;
  fs.unlink(absolutePath(rel), () => {});
};

module.exports = {
  uploadLenderDoc: lenderDocs.single('file'),
  uploadItemPhotos: itemPhotos.array('photos', 8),
  uploadManualFile: manuals.single('file'),
  fileInfo,
  absolutePath,
  removeFile,
  UPLOADS_ROOT,
};
