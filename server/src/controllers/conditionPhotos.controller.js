/**
 * CONDITION PHOTOS CONTROLLER - Owner: Member 3 (Sprint 2: damage evidence, disputes, reviews and trust)
 * Requirements: 79, 80
 * Mounted at /api/condition-photos (see routes/conditionPhotos.routes.js). Contract: docs/sprint2/member3.md §3
 */
const asyncHandler = require('../utils/asyncHandler');
const photos = require('../services/damage/conditionPhotos');

/**
 * GET /api/condition-photos/:reservationId - Req 79, 80 - participant or admin
 * -> { photos: { pickup, return }, canUpload: { pickup, return }, canRemove: { pickup, return }, maxPerStage, locked }
 */
exports.listPhotos = asyncHandler(async (req, res) => {
  res.json(await photos.listPhotos(req.user, req.params.reservationId));
});

/** Runs before the upload middleware so no file is written for a request that will be refused. */
exports.checkCanUpload = asyncHandler(async (req, res, next) => {
  await photos.assertCanUpload(req.user, req.params.reservationId, req.params.stage);
  next();
});

/**
 * POST /api/condition-photos/:reservationId/:stage - Req 79 - lender (participant)
 * Multipart field `photos` (1-5 JPEG/PNG files). 201 -> { photos }
 */
exports.uploadPhotos = asyncHandler(async (req, res) => {
  res.status(201).json({ photos: await photos.addPhotos(req.user, req.params.reservationId, req.params.stage, req.files) });
});

/**
 * GET /api/condition-photos/:reservationId/:photoId/file - Req 79, 80 - participant or admin
 * Streams the image.
 */
exports.streamPhoto = asyncHandler(async (req, res) => {
  const file = await photos.getPhotoFile(req.user, req.params.reservationId, req.params.photoId);
  res.type(file.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.originalName)}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(file.absPath);
});

/**
 * DELETE /api/condition-photos/:reservationId/:photoId - Req 79 - lender (participant)
 * Only while the stage is open and no damage report exists. -> { photos }
 */
exports.removePhoto = asyncHandler(async (req, res) => {
  res.json({ photos: await photos.removePhoto(req.user, req.params.reservationId, req.params.photoId) });
});
