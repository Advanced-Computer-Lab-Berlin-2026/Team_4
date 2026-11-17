/**
 * TRUST SERVICE - Owner: Member 3 - Requirements: 91, 98
 * Contract: docs/sprint2/member3.md §5 and §6.1
 *
 * The score is always recalculated from the full history (completed reservations, on-time returns,
 * upheld damage reports, reviews received), never adjusted step by step. Calling recalculateTrust()
 * twice for the same event therefore gives the same result, so retried or duplicated events can't
 * inflate anyone's score.
 */
const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const User = require('../../models/User');
const Reservation = require('../../models/Reservation');
const DamageReport = require('../../models/DamageReport');
const Review = require('../../models/Review');
const { TRUST_SCORE_DEFAULT, LENDER_STATUS, ROLES } = require('../../config/constants');
const { isLateReturn } = require('../reservations/returnTiming');

/** Proposed weights - decision D1 in the contract. Change here only. */
const TRUST_CONFIG = Object.freeze({
  prior: TRUST_SCORE_DEFAULT, // score with no history
  confidenceK: 5, // k = C / (C + confidenceK): how fast history outweighs the prior
  weights: Object.freeze({ onTime: 0.5, damageFree: 0.35, rating: 0.15 }),
  damagePenalty: 2, // each upheld damage report costs twice its share of returns
  unratedPrior: 0.75, // rating component for users with no reviews (0..1)
});

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/**
 * Pure formula (no database). Counts:
 *   completed     C - completed reservations as borrower or lender
 *   returns       R - completed reservations as borrower
 *   onTimeReturns T - of R, returned on or before the due date
 *   upheldDamage  D - damage reports against the user (as borrower) with a final amount > 0
 *   ratingSum / ratingCount - reviews received
 */
function computeTrust({ completed = 0, returns = 0, onTimeReturns = 0, upheldDamage = 0, ratingSum = 0, ratingCount = 0 } = {}, config = TRUST_CONFIG) {
  const { weights } = config;
  const onTime = returns > 0 ? clamp(onTimeReturns / returns, 0, 1) : 1;
  const damageFree = returns > 0 ? clamp(1 - (config.damagePenalty * upheldDamage) / returns, 0, 1) : 1;
  const rating = ratingCount > 0 ? clamp((ratingSum / ratingCount - 1) / 4, 0, 1) : config.unratedPrior;
  const performance = weights.onTime * onTime + weights.damageFree * damageFree + weights.rating * rating;
  const confidence = completed > 0 ? completed / (completed + config.confidenceK) : 0;
  const trustScore = Math.round(clamp(config.prior * (1 - confidence) + 100 * performance * confidence, 0, 100));
  return { trustScore, components: { onTime, damageFree, rating, performance, confidence } };
}

/**
 * On time = returned at or before the deadline, endDate at 00:00 UTC (docs/SPRINT2_CONTRACT.md).
 * Uses Member 1's shared rule so trust and late fees always agree.
 */
function isOnTime({ returnedAt, endDate }) {
  if (!returnedAt || !endDate) return false;
  return !isLateReturn(returnedAt, endDate);
}

/** Final forfeit amount of a decided/resolved damage report (the resolution replaces the decision). */
const finalForfeit = (report) => {
  if (report.status === 'resolved' && report.resolution?.finalForfeitAmount != null) return report.resolution.finalForfeitAmount;
  return report.decision?.forfeitAmount ?? 0;
};

/** Read everything the formula needs for one user. */
async function gatherHistory(userId, session = null) {
  const id = new mongoose.Types.ObjectId(String(userId));
  const [completed, borrowed, damage, ratings] = await Promise.all([
    Reservation.countDocuments({ status: 'completed', $or: [{ borrower: id }, { lender: id }] }).session(session),
    Reservation.find({ status: 'completed', borrower: id }).select('endDate returnedAt').lean().session(session),
    DamageReport.find({ borrower: id, status: { $in: ['decided', 'disputed', 'resolved'] } })
      .select('status decision.forfeitAmount resolution.finalForfeitAmount').lean().session(session),
    Review.aggregate([{ $match: { reviewee: id } }, { $group: { _id: null, sum: { $sum: '$rating' }, count: { $sum: 1 } } }]).session(session),
  ]);
  const onTimeReturns = borrowed.filter(isOnTime).length;
  return {
    completed,
    returns: borrowed.length,
    onTimeReturns,
    lateReturns: borrowed.length - onTimeReturns,
    upheldDamage: damage.filter((r) => finalForfeit(r) > 0).length,
    ratingSum: ratings[0]?.sum ?? 0,
    ratingCount: ratings[0]?.count ?? 0,
  };
}

/**
 * Req 98. Recalculate and save a user's trust score and stats. Safe to call any number of times.
 * Only User.trustScore and User.stats.* are written (field-level update, never a whole-document save).
 * `eventKey` identifies the triggering event for callers' logs; the result doesn't depend on it.
 */
async function recalculateTrust(userId, { session = null } = {}) {
  const history = await gatherHistory(userId, session);
  const { trustScore } = computeTrust(history);
  const stats = {
    completedReservations: history.completed,
    onTimeReturns: history.onTimeReturns,
    lateReturns: history.lateReturns,
    damageReports: history.upheldDamage,
    ratingSum: history.ratingSum,
    ratingCount: history.ratingCount,
  };
  const $set = { trustScore };
  for (const [key, value] of Object.entries(stats)) $set[`stats.${key}`] = value;
  const result = await User.updateOne({ _id: userId }, { $set }, { session });
  if (result.matchedCount !== 1) throw ApiError.notFound('User not found');
  return { trustScore, stats };
}

/** Public-safe profile (contract §5.3). Reads the stored score; no email, phone or address. */
function toTrustSummary(user) {
  const s = user.stats || {};
  const returns = (s.onTimeReturns || 0) + (s.lateReturns || 0);
  return {
    user: {
      _id: user._id,
      username: user.username,
      name: user.name,
      isVerifiedLender: user.role === ROLES.MEMBER && user.lenderStatus === LENDER_STATUS.VERIFIED,
      memberSince: user.createdAt,
    },
    trustScore: user.trustScore ?? TRUST_SCORE_DEFAULT,
    stats: {
      completedReservations: s.completedReservations || 0,
      onTimeRate: returns > 0 ? Math.round(((s.onTimeReturns || 0) / returns) * 100) / 100 : null,
      upheldDamageReports: s.damageReports || 0,
      ratingAverage: s.ratingCount ? Math.round((s.ratingSum / s.ratingCount) * 10) / 10 : null,
      ratingCount: s.ratingCount || 0,
    },
  };
}

async function getTrustSummary(userId) {
  if (!mongoose.isValidObjectId(userId)) throw ApiError.badRequest('Invalid user id');
  const user = await User.findById(userId).select('username name role lenderStatus trustScore stats createdAt').lean();
  if (!user) throw ApiError.notFound('User not found');
  return toTrustSummary(user);
}

module.exports = { TRUST_CONFIG, computeTrust, isOnTime, finalForfeit, gatherHistory, recalculateTrust, toTrustSummary, getTrustSummary };
