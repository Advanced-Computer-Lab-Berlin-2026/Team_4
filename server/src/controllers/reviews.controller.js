/**
 * REVIEWS CONTROLLER - Owner: Member 3 (Sprint 2: damage evidence, disputes, reviews and trust)
 * Requirements: 89, 90, 91, 97
 * Mounted at /api/reviews (see routes/reviews.routes.js). Contract: docs/sprint2/member3.md §4
 */
const asyncHandler = require('../utils/asyncHandler');
const { parsePagination, paginated } = require('../utils/pagination');
const reviews = require('../services/reviews/reviews');

/**
 * POST /api/reviews - Req 89, 90 - member (participant)
 * Body: { reservationId, rating (1-5), comment? }
 */
exports.createReview = asyncHandler(async (req, res) => {
  const { reservationId, rating, comment } = req.body;
  const review = await reviews.createReview(req.user, { reservationId, rating: Number(rating), comment });
  res.status(201).json({ review });
});

/**
 * GET /api/reviews/mine - Req 97 - member
 * ?type=given|received (default received), ?page, ?limit
 */
exports.listMyReviews = asyncHandler(async (req, res) => {
  const pg = parsePagination(req.query, { defaultLimit: 10 });
  const { items, total } = await reviews.listMyReviews(req.user._id, { type: req.query.type, ...pg });
  res.json(paginated(items, total, pg));
});

/**
 * GET /api/reviews/pending - Req 89, 90 - member
 * Completed reservations the user can still review.
 */
exports.listPendingReviews = asyncHandler(async (req, res) => {
  res.json({ items: await reviews.listPendingReviews(req.user._id) });
});

/**
 * GET /api/reviews/user/:userId - Req 91 - auth
 * Reviews a user has received, newest first.
 */
exports.listUserReviews = asyncHandler(async (req, res) => {
  const pg = parsePagination(req.query, { defaultLimit: 10 });
  const { items, total } = await reviews.listUserReviews(req.params.userId, pg);
  res.json(paginated(items, total, pg));
});
