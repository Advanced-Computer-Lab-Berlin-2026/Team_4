const { User, Item, MembershipTier, Reservation, ReservationHold } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { DAY_MS, BLOCKING_STATUSES, checkOverlap } = require('./availability');

async function loadActor(userId, session) {
  const actor = await User.findById(userId).session(session || null);
  if (!actor || actor.status !== 'active' || actor.role !== 'member') throw ApiError.forbidden();
  return actor;
}

async function getEntitlements(actor, now, session, deps) {
  if (deps.membership?.getEntitlements) {
    return deps.membership.getEntitlements(String(actor._id), now, session);
  }
  const membership = actor.membership;
  const hasTier = membership?.status === 'active' && membership?.renewsAt > now && membership?.tier;
  const tier = await (hasTier ? MembershipTier.findById(membership.tier) : MembershipTier.findOne({ name: 'Basic' }))
    .session(session || null);
  return {
    maxConcurrentReservations: tier?.maxConcurrentReservations,
    discountPercent: tier?.depositDiscountPercent || 0,
    tier: tier ? { id: String(tier._id), name: tier.name } : null,
  };
}

async function assertCapacity(actor, adding, entitlements, session, excludeAttemptId, excludeHoldId) {
  const limit = entitlements.maxConcurrentReservations;
  if (limit == null) return;
  if (!Number.isInteger(limit) || limit < 0) throw new Error('Invalid membership reservation limit');
  const used = await Reservation.countDocuments({
    borrower: actor._id, status: { $in: BLOCKING_STATUSES },
  }).session(session || null);
  const held = await ReservationHold.countDocuments({
    borrower: actor._id, expiresAt: { $gt: new Date() },
    ...(excludeAttemptId && { attempt: { $ne: excludeAttemptId } }),
    ...(excludeHoldId && { _id: { $ne: excludeHoldId } }),
  }).session(session || null);
  if (used + held + adding > limit) throw ApiError.conflict('Your membership reservation limit would be exceeded');
}

async function loadBookableItem(itemId, actor, range, entitlements, deps, options = {}) {
  const { session, excludeReservationId } = options;
  const item = await Item.findOne(Item.publicFilter({ _id: itemId }))
    .populate('category').session(session || null);
  if (!item) throw ApiError.notFound('This listing is unavailable');
  if (item.owner.equals(actor._id)) throw ApiError.badRequest('You cannot reserve your own listing');
  const lender = await User.findOne({
    _id: item.owner, lenderStatus: 'verified', role: 'member', status: 'active',
  }).session(session || null);
  if (!lender) throw ApiError.conflict('The lender is unavailable');
  if (item.rules?.maxBorrowDays && (range.endDate - range.startDate) / DAY_MS > item.rules.maxBorrowDays) {
    throw ApiError.badRequest('The date range exceeds this item’s maximum borrowing duration');
  }
  if (actor.trustScore < (item.rules?.minTrustScore || 0)) {
    throw ApiError.forbidden('Your trust score does not meet this item’s borrowing rules');
  }
  if (deps.policy?.validateBooking) await deps.policy.validateBooking(actor, item, range, entitlements, { session });
  if (await checkOverlap(itemId, range, excludeReservationId, options)) {
    throw ApiError.conflict('This item is already booked for part of the selected range');
  }
  return item;
}

module.exports = { loadActor, getEntitlements, assertCapacity, loadBookableItem };
