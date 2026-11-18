/**
 * CONDITION PHOTOS SERVICE - Owner: Member 3 - Requirements: 79, 80
 * Contract: docs/sprint2/member3.md §3 (and docs/SPRINT2_CONTRACT.md, "Member 3 and Member 5 lifecycle")
 *
 * Photos are evidence: stored privately (Member 1's uploadConditionPhotos preset), streamed only to the reservation's
 * participants and admins, and locked once a damage report exists so the evidence an admin sees can't change.
 * Uploads and deletes run inside Member 1's reservation lock (withReservation), as the lifecycle contract asks.
 */
const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const Reservation = require('../../models/Reservation');
const DamageReport = require('../../models/DamageReport');
const { ROLES, LENDER_STATUS } = require('../../config/constants');
const { fileInfo, absolutePath, removeFile } = require('../../middleware/upload');
const { withReservation } = require('../reservations/reservationCommands');

/** Decision D6 in the contract. Per-file limits (type, size, 5 per upload) come from the upload preset. */
const PHOTO_CONFIG = Object.freeze({ maxPerStage: 10, returnWindowHours: 48 });
const STAGES = ['pickup', 'return'];
const isEvidencePath = (path) => typeof path === 'string' && /^private\/condition-photos\/[\w.-]+\.(?:jpe?g|png)$/i.test(path);

const sameId = (a, b) => a != null && b != null && String(a?._id ?? a) === String(b?._id ?? b);
const isAdmin = (user) => user.role === ROLES.ADMIN;
const isLender = (user, reservation) =>
  sameId(reservation.lender, user._id) && user.role === ROLES.MEMBER && user.lenderStatus === LENDER_STATUS.VERIFIED;

/** Metadata only - the stored path never leaves the server. */
const toPhotoDto = (photo, stage) => ({
  _id: photo._id,
  stage,
  originalName: photo.originalName,
  mimeType: photo.mimeType,
  size: photo.size,
  uploadedBy: photo.uploadedBy,
  takenAt: photo.takenAt,
});

const photosDto = (reservation) => Object.fromEntries(
  STAGES.map((stage) => [stage, (reservation.conditionPhotos?.[stage] || []).map((p) => toPhotoDto(p, stage))])
);

/** Why a stage is closed for uploads/deletes, or null when it's open. */
function stageClosedReason(reservation, stage, hasDamageCase) {
  if (hasDamageCase) return 'Photos are locked because a damage report exists for this reservation';
  if (stage === 'pickup') {
    return ['confirmed', 'active'].includes(reservation.status) ? null : 'Pickup photos can be added only before the item is returned';
  }
  if (reservation.status === 'active') return null;
  const returnedAt = reservation.returnedAt && new Date(reservation.returnedAt).getTime();
  if (reservation.status === 'completed' && returnedAt && Date.now() <= returnedAt + PHOTO_CONFIG.returnWindowHours * 60 * 60 * 1000) {
    return null;
  }
  return reservation.status === 'completed'
    ? `Return photos can be added up to ${PHOTO_CONFIG.returnWindowHours} hours after the return`
    : 'Return photos can be added once the item has been picked up';
}

const hasCase = (reservationId, session = null) => DamageReport.exists({ reservation: reservationId }).session(session).then(Boolean);

/** Participant or admin access; 404 for everyone else so other people's reservations stay hidden. */
async function loadForViewer(user, reservationId) {
  if (!mongoose.isValidObjectId(reservationId)) throw ApiError.badRequest('Invalid reservation id');
  const reservation = await Reservation.findById(reservationId).select('borrower lender status returnedAt conditionPhotos').lean();
  if (!reservation || (!isAdmin(user) && !sameId(reservation.borrower, user._id) && !sameId(reservation.lender, user._id))) {
    throw ApiError.notFound('Reservation not found');
  }
  return reservation;
}

/** Req 79, 80 - photo metadata for a reservation, plus what the caller may change in each stage. */
async function listPhotos(user, reservationId) {
  const reservation = await loadForViewer(user, reservationId);
  const locked = await hasCase(reservation._id);
  const canRemove = Object.fromEntries(STAGES.map((stage) => [
    stage,
    isLender(user, reservation) && !stageClosedReason(reservation, stage, locked),
  ]));
  const canUpload = Object.fromEntries(STAGES.map((stage) => [
    stage,
    canRemove[stage] && (reservation.conditionPhotos?.[stage]?.length || 0) < PHOTO_CONFIG.maxPerStage,
  ]));
  return { photos: photosDto(reservation), canUpload, canRemove, maxPerStage: PHOTO_CONFIG.maxPerStage, locked };
}

/** Same as listPhotos, for Member 5's server code (contract §6.1). */
const getEvidence = (reservationId, actor) => listPhotos(actor, reservationId).then((r) => r.photos);

/** Cheap check before multer writes any file (the real check runs again under the lock). */
async function assertCanUpload(user, reservationId, stage) {
  const reservation = await loadForViewer(user, reservationId);
  if (!isLender(user, reservation)) throw ApiError.forbidden('Only the lender of this reservation can add condition photos');
  const reason = stageClosedReason(reservation, stage, await hasCase(reservation._id));
  if (reason) throw ApiError.conflict(reason);
}

/** Req 79 - add uploaded files to a stage. Deletes the files again if anything fails. */
async function addPhotos(user, reservationId, stage, files = []) {
  try {
    if (!files.length) throw ApiError.badRequest('Choose at least one photo');
    const saved = await withReservation({ actorId: user._id, reservationId }, async (record, actor, session) => {
      if (!sameId(record.lender, actor._id) || !actor.isVerifiedLender()) {
        throw ApiError.forbidden('Only the lender of this reservation can add condition photos');
      }
      const reason = stageClosedReason(record, stage, await hasCase(record._id, session));
      if (reason) throw ApiError.conflict(reason);
      const current = record.conditionPhotos?.[stage]?.length || 0;
      if (current + files.length > PHOTO_CONFIG.maxPerStage) {
        throw ApiError.conflict(`A stage can have at most ${PHOTO_CONFIG.maxPerStage} photos (${current} already added)`);
      }
      for (const file of files) {
        const { path, originalName, mimeType, size } = fileInfo(file);
        record.conditionPhotos[stage].push({ path, originalName, mimeType, size, uploadedBy: actor._id, takenAt: new Date() });
      }
      return record.save({ session });
    });
    return photosDto(saved);
  } catch (err) {
    const record = await Reservation.findById(reservationId).select('conditionPhotos').lean().catch(() => undefined);
    // If the commit outcome could not be confirmed, preserve evidence referenced by a committed reservation.
    if (record !== undefined) {
      const recorded = new Set(STAGES.flatMap((name) => (record?.conditionPhotos?.[name] || []).map((photo) => photo.path)));
      for (const file of files) {
        const path = fileInfo(file).path;
        if (!recorded.has(path)) removeFile(path);
      }
    }
    throw err;
  }
}

/** Remove one photo while its stage is still open. The file is deleted only after the change is committed. */
async function removePhoto(user, reservationId, photoId) {
  let removedPath = null;
  const saved = await withReservation({ actorId: user._id, reservationId }, async (record, actor, session) => {
    if (!sameId(record.lender, actor._id) || !actor.isVerifiedLender()) {
      throw ApiError.forbidden('Only the lender of this reservation can remove condition photos');
    }
    const stage = STAGES.find((s) => record.conditionPhotos?.[s]?.id(photoId));
    if (!stage) throw ApiError.notFound('Photo not found');
    const reason = stageClosedReason(record, stage, await hasCase(record._id, session));
    if (reason) throw ApiError.conflict(reason);
    const photo = record.conditionPhotos[stage].id(photoId);
    removedPath = photo.path;
    photo.deleteOne();
    return record.save({ session });
  });
  if (isEvidencePath(removedPath)) removeFile(removedPath);
  return photosDto(saved);
}

/** Req 79, 80 - the file to stream, after the participant/admin check. */
async function getPhotoFile(user, reservationId, photoId) {
  const reservation = await loadForViewer(user, reservationId);
  for (const stage of STAGES) {
    const photo = (reservation.conditionPhotos?.[stage] || []).find((p) => sameId(p._id, photoId));
    if (photo && isEvidencePath(photo.path)) return { absPath: absolutePath(photo.path), mimeType: photo.mimeType, originalName: photo.originalName };
  }
  throw ApiError.notFound('Photo not found');
}

module.exports = { PHOTO_CONFIG, STAGES, listPhotos, getEvidence, assertCanUpload, addPhotos, removePhoto, getPhotoFile, toPhotoDto };
