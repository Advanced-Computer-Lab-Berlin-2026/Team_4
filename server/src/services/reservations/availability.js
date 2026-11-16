const mongoose = require('mongoose');
const Reservation = require('../../models/Reservation');
const ReservationHold = require('../../models/ReservationHold');
const ApiError = require('../../utils/ApiError');

const BLOCKING_STATUSES = ['pending', 'confirmed', 'active'];
const DAY_MS = 86400000;

function objectId(value) {
  if (!mongoose.isObjectIdOrHexString(value)) throw ApiError.badRequest('Invalid ID');
  return String(value).toLowerCase();
}

function dateOnly(value) {
  const date = value instanceof Date ? value : new Date(value + 'T00:00:00.000Z');
  if (!Number.isFinite(date.getTime())) throw ApiError.badRequest('Use valid dates in YYYY-MM-DD format');
  const iso = date.toISOString();
  const valid = value instanceof Date ? iso.endsWith('T00:00:00.000Z') :
    typeof value === 'string' && value === iso.slice(0, 10);
  if (!valid) throw ApiError.badRequest('Use valid dates in YYYY-MM-DD format');
  return date;
}

function normalizeRange({ startDate, endDate } = {}, { booking = false, now = new Date() } = {}) {
  const start = dateOnly(startDate);
  const end = dateOnly(endDate);
  if (end <= start) throw ApiError.badRequest('The return date must be after the pickup date');
  if (booking && start < dateOnly(now.toISOString().slice(0, 10))) {
    throw ApiError.badRequest('The pickup date cannot be in the past');
  }
  return { startDate: start, endDate: end };
}

function overlapFilter(range) {
  return { startDate: { $lt: range.endDate }, endDate: { $gt: range.startDate } };
}

async function getAvailability(itemId, requestedRange, options = {}) {
  const item = objectId(itemId);
  const range = normalizeRange(requestedRange);
  const { session, excludeReservationId, excludeAttemptId, excludeHoldId } = options;
  const common = { item, ...overlapFilter(range) };
  const reservations = await Reservation.find({
    ...common, status: { $in: BLOCKING_STATUSES },
    ...(excludeReservationId && { _id: { $ne: objectId(excludeReservationId) } }),
  }).select('startDate endDate -_id').session(session || null).lean();
  const holds = await ReservationHold.find({
    ...common, expiresAt: { $gt: new Date() },
    ...(excludeAttemptId && { attempt: { $ne: objectId(excludeAttemptId) } }),
    ...(excludeHoldId && { _id: { $ne: objectId(excludeHoldId) } }),
  }).select('startDate endDate -_id').session(session || null).lean();
  const booked = [...reservations, ...holds].sort((a, b) => a.startDate - b.startDate);
  return { available: booked.length === 0, booked };
}

async function checkOverlap(itemId, range, excludeReservationId, options = {}) {
  return !(await getAvailability(itemId, range, { ...options, excludeReservationId })).available;
}

module.exports = { BLOCKING_STATUSES, DAY_MS, objectId, normalizeRange, overlapFilter, getAvailability, checkOverlap };
