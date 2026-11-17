/**
 * MEMBERSHIP ENTITLEMENTS - Owner: Member 8 (Req 88 + expiry rules + reservation-limit policy)
 *
 * The single source of truth for what a member is entitled to at a given moment.
 * Consumed by M1 (checkout / booking rules), M6 (deposit quote) and M7 (waitlist priority).
 * Loaded automatically by services/sprint2/bootstrap.js. Policy: docs/sprint2/member8.md
 *
 * Read-only: this module never writes, and it imports models only (no dependency on checkout).
 */
const User = require('../../models/User');
const MembershipTier = require('../../models/MembershipTier');
const HouseholdLink = require('../../models/HouseholdLink');
const Reservation = require('../../models/Reservation');
const ReservationHold = require('../../models/ReservationHold');
const { ROLES, USER_STATUS } = require('../../config/constants');

/** Tier every member is on when they have no paid period. */
const BASE_TIER_NAME = 'Basic';
/** Limit for a tier that does not define its own (Basic and Plus). */
const DEFAULT_MAX_CONCURRENT_RESERVATIONS = 3;
/** Priority used only when no tier document can be resolved (1 = top). */
const DEFAULT_WAITLIST_PRIORITY = 3;
/** Reservation statuses that count toward the concurrent limit. Unexpired holds count too. */
const COUNTED_RESERVATION_STATUSES = ['pending', 'confirmed', 'active'];
/** Stored statuses that still carry benefits while the paid period has not ended. */
const PAID_STATUSES = ['active', 'cancelled'];

/** A paid period is running: cancelled subscriptions keep benefits until renewsAt. */
function hasPaidPeriod(membership, at) {
  return Boolean(
    membership?.tier &&
    PAID_STATUSES.includes(membership.status) &&
    membership.renewsAt instanceof Date &&
    membership.renewsAt > at
  );
}

/** Membership status as it is at `at`, regardless of what is stored. */
function effectiveStatus(membership, at) {
  if (hasPaidPeriod(membership, at)) return membership.status;
  if (membership?.tier && PAID_STATUSES.includes(membership.status)) return 'expired';
  return membership?.status === 'expired' ? 'expired' : 'none';
}

function discountOf(tier) {
  const value = Number(tier?.depositDiscountPercent);
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}

/** Own limit of a resolved tier; invalid tier data falls back to the platform default. */
function limitOf(tier) {
  if (!tier) return undefined; // no tier catalogue at all => uncapped
  const value = tier.maxConcurrentReservations;
  return Number.isInteger(value) && value >= 0 ? value : DEFAULT_MAX_CONCURRENT_RESERVATIONS;
}

/** The member's own tier at `at`: the paid tier during its period, otherwise Basic. */
async function resolveOwnTier(membership, at, session) {
  if (hasPaidPeriod(membership, at)) {
    const paid = await MembershipTier.findById(membership.tier).session(session || null).lean();
    if (paid) return paid;
  }
  return MembershipTier.findOne({ name: BASE_TIER_NAME }).session(session || null).lean();
}

/**
 * Strongest deposit discount offered by a directly linked, accepted household member.
 * Pending, declined and removed links never match. Links are not followed transitively.
 */
async function bestHouseholdDiscount(userId, at, session) {
  const links = await HouseholdLink.find({
    status: 'accepted', $or: [{ requester: userId }, { recipient: userId }],
  }).select('requester recipient').session(session || null).lean();
  if (!links.length) return null;

  const partnerIds = links.map((link) => (
    String(link.requester) === String(userId) ? link.recipient : link.requester
  ));
  const partners = await User.find({
    _id: { $in: partnerIds },
    role: ROLES.MEMBER,
    status: USER_STATUS.ACTIVE,
    'membership.tier': { $ne: null },
    'membership.status': { $in: PAID_STATUSES },
    'membership.renewsAt': { $gt: at },
  }).select('name membership').session(session || null).lean();
  if (!partners.length) return null;

  const tiers = await MembershipTier.find({ _id: { $in: partners.map((p) => p.membership.tier) } })
    .session(session || null).lean();
  const tierById = new Map(tiers.map((tier) => [String(tier._id), tier]));

  let best = null;
  for (const partner of partners) {
    const tier = tierById.get(String(partner.membership.tier));
    const discountPercent = discountOf(tier);
    if (discountPercent > 0 && (!best || discountPercent > best.discountPercent)) {
      best = { discountPercent, userId: String(partner._id), name: partner.name, tierName: tier.name };
    }
  }
  return best;
}

/**
 * What `userId` is entitled to at `at`.
 *
 * @param {string|ObjectId} userId
 * @param {Date} [at=new Date()]
 * @param {ClientSession} [session] used for every read when supplied
 * @returns {Promise<{
 *   tier: {id: string, name: string}|null, status: string, expiresAt: Date|null,
 *   discountPercent: number, discountSource: {type: 'none'|'self'|'household', userId?: string, name?: string, tierName?: string},
 *   waitlistPriority: number, maxConcurrentReservations: number|undefined, countedStatuses: string[]
 * }>}
 */
async function getEntitlements(userId, at, session) {
  const when = at instanceof Date && Number.isFinite(at.getTime()) ? at : new Date();
  const user = await User.findById(userId).select('membership').session(session || null).lean();
  const membership = user?.membership;
  const paid = hasPaidPeriod(membership, when);

  const tier = await resolveOwnTier(membership, when, session);
  const ownDiscount = discountOf(tier);
  const household = user ? await bestHouseholdDiscount(user._id, when, session) : null;

  // Strongest single discount applies; discounts never stack. A tie stays with the member's own tier.
  let discountPercent = ownDiscount;
  let discountSource = ownDiscount > 0 ? { type: 'self', tierName: tier.name } : { type: 'none' };
  if (household && household.discountPercent > ownDiscount) {
    discountPercent = household.discountPercent;
    discountSource = {
      type: 'household', userId: household.userId, name: household.name, tierName: household.tierName,
    };
  }

  return {
    tier: tier ? { id: String(tier._id), name: tier.name } : null,
    status: effectiveStatus(membership, when),
    expiresAt: paid ? membership.renewsAt : null,
    discountPercent,
    discountSource,
    // Priority and limit always come from the member's own tier; they are never inherited.
    waitlistPriority: Number.isFinite(tier?.waitlistPriority) ? tier.waitlistPriority : DEFAULT_WAITLIST_PRIORITY,
    maxConcurrentReservations: limitOf(tier),
    countedStatuses: [...COUNTED_RESERVATION_STATUSES],
  };
}

/**
 * Advisory count for display ("2 of 3 reservations used"). M1 enforces the limit atomically
 * inside the borrower lock; this uses the same counting rule.
 */
async function getReservationUsage(userId, session) {
  const now = new Date();
  const { maxConcurrentReservations } = await getEntitlements(userId, now, session);
  const reservations = await Reservation.countDocuments({
    borrower: userId, status: { $in: COUNTED_RESERVATION_STATUSES },
  }).session(session || null);
  const holds = await ReservationHold.countDocuments({
    borrower: userId, expiresAt: { $gt: now },
  }).session(session || null);
  return { counted: reservations + holds, limit: maxConcurrentReservations };
}

module.exports = {
  getEntitlements,
  getReservationUsage,
  hasPaidPeriod,
  effectiveStatus,
  BASE_TIER_NAME,
  COUNTED_RESERVATION_STATUSES,
  DEFAULT_MAX_CONCURRENT_RESERVATIONS,
  DEFAULT_WAITLIST_PRIORITY,
};
