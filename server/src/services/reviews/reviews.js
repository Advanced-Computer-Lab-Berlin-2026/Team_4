/**
 * REVIEW SERVICE - Owner: Member 3 - Requirements: 89, 90, 91, 97
 * Contract: docs/sprint2/member3.md §4
 *
 * Rules: only the reservation's borrower or lender may review, only the other party, only once the
 * reservation is completed and within REVIEW_WINDOW_DAYS of completion, once per author per reservation.
 * Reviews can't be edited or deleted. Posting one recalculates the reviewee's trust score in the same transaction.
 */
const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const Review = require('../../models/Review');
const Reservation = require('../../models/Reservation');
const User = require('../../models/User');
const { recalculateTrust } = require('./trust');

const REVIEW_WINDOW_DAYS = 14; // decision D5
const DAY_MS = 24 * 60 * 60 * 1000;
const PERSON = 'username name';

const sameId = (a, b) => String(a?._id ?? a) === String(b?._id ?? b);

// Older completed reservations recorded the return without a separate completion timestamp.
const completedAtOf = (r) => r.completedAt || r.returnedAt;
const reviewDeadline = (r) => new Date(new Date(completedAtOf(r)).getTime() + REVIEW_WINDOW_DAYS * DAY_MS);

/** The caller's side of a reservation, or null if they didn't take part. */
function sideOf(reservation, userId) {
  if (sameId(reservation.borrower, userId)) return { direction: 'borrower_to_lender', reviewee: reservation.lender };
  if (sameId(reservation.lender, userId)) return { direction: 'lender_to_borrower', reviewee: reservation.borrower };
  return null;
}

/** API shape (contract §4): flattens reservation.item into `item`. Expects reservation, reviewer and reviewee populated. */
function toReviewDto(review) {
  const r = review.toObject ? review.toObject() : review;
  const reservation = r.reservation || {};
  const item = reservation.item && reservation.item.title !== undefined ? { _id: reservation.item._id, title: reservation.item.title } : null;
  return {
    _id: r._id,
    reservation: reservation._id ?? reservation,
    item,
    direction: r.direction,
    reviewer: r.reviewer,
    reviewee: r.reviewee,
    rating: r.rating,
    comment: r.comment || '',
    createdAt: r.createdAt,
  };
}

const populateReview = (query) =>
  query
    .populate({ path: 'reservation', select: 'item', populate: { path: 'item', select: 'title' } })
    .populate('reviewer', PERSON)
    .populate('reviewee', PERSON);

/** Req 89, 90 - create a review and refresh the reviewee's trust score atomically. */
async function createReview(actor, { reservationId, rating, comment }) {
  const reservation = await Reservation.findById(reservationId).select('borrower lender status returnedAt completedAt').lean();
  if (!reservation) throw ApiError.notFound('Reservation not found');
  const side = sideOf(reservation, actor._id);
  if (!side) throw ApiError.forbidden('Only the borrower or lender of this reservation can review it');
  if (sameId(side.reviewee, actor._id)) throw ApiError.badRequest('You cannot review yourself');
  if (reservation.status !== 'completed') throw ApiError.conflict('You can review only after the reservation is completed');
  if (!(Date.now() <= reviewDeadline(reservation).getTime())) {
    throw ApiError.conflict(`The review window closed ${REVIEW_WINDOW_DAYS} days after completion`);
  }

  let reviewId;
  try {
    await mongoose.connection.transaction(async (session) => {
      const [review] = await Review.create(
        [{ reservation: reservation._id, reviewer: actor._id, reviewee: side.reviewee, direction: side.direction, rating, comment: comment || undefined }],
        { session }
      );
      reviewId = review._id;
      await recalculateTrust(side.reviewee, { session, eventKey: `review:${review._id}:created` });
    });
  } catch (err) {
    if (err.code === 11000) throw ApiError.conflict('You have already reviewed this reservation');
    throw err;
  }
  // TODO(M9): enqueueEvent('review.created', reviewId, [reviewee], …, `review:${reviewId}:created`) once the outbox exists.
  return toReviewDto(await populateReview(Review.findById(reviewId)).lean());
}

/** Req 97 - reviews I have given or received, newest first. */
async function listMyReviews(userId, { type = 'received', skip, limit }) {
  const filter = type === 'given' ? { reviewer: userId } : { reviewee: userId };
  const [items, total] = await Promise.all([
    populateReview(Review.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)).lean(),
    Review.countDocuments(filter),
  ]);
  return { items: items.map(toReviewDto), total };
}

/** Req 91 - reviews a user has received. */
async function listUserReviews(userId, { skip, limit }) {
  if (!(await User.exists({ _id: userId }))) throw ApiError.notFound('User not found');
  return listMyReviews(userId, { type: 'received', skip, limit });
}

/** Completed reservations the user can still review (inside the window, not reviewed yet). */
async function listPendingReviews(userId) {
  const cutoff = new Date(Date.now() - REVIEW_WINDOW_DAYS * DAY_MS);
  const recent = [{ completedAt: { $gte: cutoff } }, { completedAt: null, returnedAt: { $gte: cutoff } }];
  const candidates = await Reservation.find({
    status: 'completed',
    $and: [{ $or: [{ borrower: userId }, { lender: userId }] }, { $or: recent }],
  })
    .select('item borrower lender returnedAt completedAt')
    .populate('item', 'title')
    .populate('borrower', PERSON)
    .populate('lender', PERSON)
    .sort({ returnedAt: -1 })
    .lean();
  if (!candidates.length) return [];

  const reviewed = new Set(
    (await Review.find({ reviewer: userId, reservation: { $in: candidates.map((r) => r._id) } }).select('reservation').lean())
      .map((r) => String(r.reservation))
  );
  return candidates
    .filter((r) => !reviewed.has(String(r._id)) && Date.now() <= reviewDeadline(r).getTime())
    .map((r) => {
      const side = sideOf(r, userId);
      return {
        reservationId: r._id,
        item: r.item ? { _id: r.item._id, title: r.item.title } : null,
        otherParty: side.direction === 'borrower_to_lender' ? r.lender : r.borrower,
        direction: side.direction,
        reviewBy: reviewDeadline(r),
      };
    });
}

module.exports = { REVIEW_WINDOW_DAYS, createReview, listMyReviews, listUserReviews, listPendingReviews, toReviewDto };
