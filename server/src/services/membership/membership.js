/**
 * MEMBERSHIP SERVICE - Owner: Member 8 (Req 83, 84, 85, 86, 87, 108 + expiry rules)
 *
 * Subscribing, renewing, cancelling, lazy expiry and the admin distribution report.
 * Policy and HTTP contract: docs/sprint2/member8.md
 *
 * - User.membership.* is only ever changed with field-scoped, compare-and-set updates.
 * - Money moves only through Member 2's payment service. While it is not installed every paid
 *   path fails with 503; a payment is never simulated.
 * - Member 9's event outbox is optional: a missing or failing outbox never fails a membership change.
 */
const mongoose = require('mongoose');
const User = require('../../models/User');
const MembershipTier = require('../../models/MembershipTier');
const ApiError = require('../../utils/ApiError');
const { CURRENCY, ROLES, USER_STATUS } = require('../../config/constants');
const { features, requireFeature } = require('../sprint2/bootstrap');
const {
  getEntitlements, getReservationUsage, hasPaidPeriod,
  BASE_TIER_NAME, DEFAULT_MAX_CONCURRENT_RESERVATIONS,
} = require('./entitlements');

const PAYMENT_LABEL = 'Membership payment';
/** Member 2 replays a repeated idempotency key as { replayed: true } and changes nothing. */
const alreadyApplied = (outcome) => Boolean(outcome?.replayed || outcome?.alreadyApplied);
const PAYMENT_METHODS = ['wallet', 'card'];
const CLIENT_RETURN_PATH = '/membership';

function addYear(date) {
  const next = new Date(date);
  next.setUTCFullYear(next.getUTCFullYear() + 1);
  return next;
}

function effectiveLimit(tier) {
  const value = tier.maxConcurrentReservations;
  return Number.isInteger(value) && value >= 0 ? value : DEFAULT_MAX_CONCURRENT_RESERVATIONS;
}

function publicTier(tier) {
  return {
    id: String(tier._id),
    name: tier.name,
    annualFee: tier.annualFee || 0,
    depositDiscountPercent: tier.depositDiscountPercent || 0,
    waitlistPriority: tier.waitlistPriority,
    maxConcurrentReservations: effectiveLimit(tier),
    description: tier.description || '',
  };
}

/** Req 83: tiers that can currently be chosen, cheapest first. */
async function listTiers() {
  const tiers = await MembershipTier.find({ isActive: { $ne: false } })
    .sort({ annualFee: 1, waitlistPriority: -1, name: 1 }).lean();
  return tiers.map(publicTier);
}

/** Expiry is lazy: the stored status catches up the next time the membership is read. */
async function markExpired(userId, now) {
  await User.updateOne(
    { _id: userId, 'membership.status': { $in: ['active', 'cancelled'] }, 'membership.renewsAt': { $lte: now } },
    { $set: { 'membership.status': 'expired' } },
  );
}

/** Req 86: current tier, renewal date, entitlements and reservation usage. */
async function getMyMembership(userId) {
  const now = new Date();
  await markExpired(userId, now);
  const user = await User.findById(userId).select('membership').lean();
  if (!user) throw ApiError.notFound('Account not found.');
  const entitlements = await getEntitlements(userId, now);
  const usage = await getReservationUsage(userId);
  const paid = hasPaidPeriod(user.membership, now);
  return {
    membership: {
      tier: entitlements.tier,
      status: entitlements.status,
      subscribedAt: paid ? user.membership.subscribedAt || null : null,
      renewsAt: paid ? user.membership.renewsAt : null,
      cancelAtPeriodEnd: paid && user.membership.status === 'cancelled',
    },
    entitlements,
    usage,
  };
}

/** Best effort: the outbox belongs to Member 9 and may not be installed. */
async function emitChanged(deps, userId, eventKey) {
  try {
    const enqueue = deps.events?.enqueueEvent;
    if (typeof enqueue !== 'function') return;
    const user = await User.findById(userId).select('membership').lean();
    const tier = user?.membership?.tier
      ? await MembershipTier.findById(user.membership.tier).select('name').lean() : null;
    const id = String(userId);
    await enqueue('membership_changed', id, [id], {
      userId: id,
      tierId: tier ? String(tier._id) : null,
      tierName: tier?.name || BASE_TIER_NAME,
      status: user?.membership?.status || 'none',
      renewsAt: user?.membership?.renewsAt || null,
    }, eventKey);
  } catch (error) {
    console.error('membership_changed event was not enqueued:', error.message);
  }
}

async function loadMember(userId, session) {
  const user = await User.findById(userId).select('role status membership').session(session || null).lean();
  if (!user || user.role !== ROLES.MEMBER || user.status !== USER_STATUS.ACTIVE) throw ApiError.forbidden('Only active member accounts can hold a membership.');
  return user;
}

/**
 * Start or extend the paid period. Same tier inside a paid period adds a year to the current
 * renewal date; anything else starts a new year now. The filter makes the write compare-and-set
 * against the state that was read in this transaction.
 */
async function activate(user, tier, now, session) {
  const current = user.membership || {};
  const renewing = hasPaidPeriod(current, now) && String(current.tier) === String(tier._id);
  const result = await User.updateOne(
    {
      _id: user._id,
      'membership.tier': current.tier ?? null,
      'membership.renewsAt': current.renewsAt ?? null,
    },
    { $set: {
      'membership.tier': tier._id,
      'membership.status': 'active',
      'membership.subscribedAt': renewing ? current.subscribedAt || now : now,
      'membership.renewsAt': addYear(renewing ? current.renewsAt : now),
    } },
    { session },
  );
  if (result.matchedCount !== 1) {
    throw ApiError.conflict('Your membership changed while this payment was processed. Please try again.');
  }
}

async function payByWallet(userId, tier, payment, deps) {
  const charge = requireFeature(deps.payment, 'chargeMembership', PAYMENT_LABEL);
  await mongoose.connection.transaction(async (session) => {
    const user = await loadMember(userId, session);
    const { userId: payer, amountMinor, currency, reference, idempotencyKey } = payment;
    const outcome = await charge({ userId: payer, amountMinor, currency, reference, idempotencyKey }, session);
    // The charge and the activation commit together, so a replayed key was already applied:
    // never extend the membership a second time.
    if (alreadyApplied(outcome)) return;
    await activate(user, tier, new Date(), session);
  });
}

/** Confirm Pay→Return and signed webhooks through the same idempotent activation. */
async function finishCardPayment(tierId, payment, deps) {
  const check = requireFeature(deps.payment, 'getCardPayment', PAYMENT_LABEL);
  const record = requireFeature(deps.payment, 'recordMembershipPayment', PAYMENT_LABEL);
  const { userId, amountMinor, currency, reference, idempotencyKey } = payment;
  const provider = await check({ idempotencyKey });
  if (provider?.state === 'pending') {
    return { state: 'pending', ...(provider.redirectUrl && { redirectUrl: provider.redirectUrl }) };
  }
  if (provider?.state !== 'paid') {
    const message = 'The card payment was not completed. You have not been charged.';
    throw new ApiError(409, message, [{ field: 'payment', code: 'card_not_completed', message }]);
  }
  if (provider.amountMinor !== amountMinor || provider.currency !== currency) {
    throw ApiError.conflict('The card payment does not match this membership. Please contact support.');
  }

  await mongoose.connection.transaction(async (session) => {
    // Once Stripe has taken payment, record what was sold even if the account was suspended meanwhile.
    const user = await User.findOne({ _id: userId, role: ROLES.MEMBER }).select('membership').session(session).lean();
    if (!user) throw ApiError.notFound('Member account for this payment was not found.');
    // The provider page and the settlement have distinct idempotency keys.
    const outcome = await record({
      userId, amountMinor, currency, reference,
      paymentReference: provider.reference, idempotencyKey: idempotencyKey + ':record',
    }, session);
    if (!alreadyApplied(outcome)) await activate(user, { _id: tierId }, new Date(), session);
  });
  await emitChanged(deps, userId, idempotencyKey);
  return null;
}

async function payByCard(userId, tier, payment, deps) {
  const start = requireFeature(deps.payment, 'startCardPayment', PAYMENT_LABEL);
  requireFeature(deps.payment, 'getCardPayment', PAYMENT_LABEL);
  requireFeature(deps.payment, 'recordMembershipPayment', PAYMENT_LABEL);
  await loadMember(userId);

  // Provider calls stay outside any database transaction. Starting is idempotent per key.
  const started = await start({ ...payment, purpose: 'membership' });
  if (started?.state === 'pending' && started.redirectUrl) {
    return { state: 'pending', redirectUrl: started.redirectUrl };
  }
  return finishCardPayment(tier._id, payment, deps);
}

async function reconcileCardMembership({ membershipOperationId, stripeSessionId }, deps = features()) {
  const readAttempt = requireFeature(deps.payment, 'getMembershipCardAttempt', PAYMENT_LABEL);
  const payment = await readAttempt({ operationId: membershipOperationId, stripeSessionId });
  if (!payment) return;
  const [kind, userId, tierId, operationKey] = payment.idempotencyKey.split(':');
  if (kind !== 'membership' || userId !== payment.userId || !mongoose.isObjectIdOrHexString(tierId) || !operationKey) return;
  const pending = await finishCardPayment(tierId, payment, deps);
  if (pending) throw new ApiError(503, 'Stripe has not confirmed the membership payment yet.');
}

function availablePaymentMethods(deps = features()) {
  return PAYMENT_METHODS.filter((method) => (method === 'wallet'
    ? typeof deps.payment?.chargeMembership === 'function'
    : ['startCardPayment', 'getCardPayment', 'recordMembershipPayment'].every((op) => typeof deps.payment?.[op] === 'function')));
}

/**
 * Req 84 / 85: subscribe to a paid tier by wallet or card.
 * Retrying with the same operationKey never charges twice.
 * @returns {Promise<{membership, entitlements, usage}|{payment: {state: 'pending', redirectUrl?: string}}>}
 */
async function subscribe({ userId, tierId, method, operationKey }, deps = features()) {
  if (!PAYMENT_METHODS.includes(method)) throw ApiError.badRequest('Choose wallet or card payment.');
  if (typeof operationKey !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(operationKey)) {
    throw ApiError.badRequest('A valid operation key is required.');
  }
  if (!mongoose.isObjectIdOrHexString(tierId)) throw ApiError.badRequest('Choose a membership tier.');
  const id = String(userId);
  const canonicalTierId = String(new mongoose.Types.ObjectId(tierId));
  const key = ['membership', id, canonicalTierId, operationKey].join(':');
  if (method === 'card' && deps.payment?.getMembershipCardAttempt) {
    await loadMember(id);
    const attempt = await deps.payment.getMembershipCardAttempt({ idempotencyKey: key });
    if (attempt) {
      const pending = attempt.started
        ? await finishCardPayment(canonicalTierId, attempt, deps)
        : await payByCard(id, { _id: canonicalTierId }, attempt, deps);
      return pending ? { payment: pending } : getMyMembership(id);
    }
  }
  const tier = await MembershipTier.findOne({ _id: tierId, isActive: { $ne: false } }).lean();
  if (!tier) throw ApiError.notFound('This membership tier is unavailable.');
  const amountMinor = Math.round((tier.annualFee || 0) * 100);
  if (amountMinor <= 0) {
    throw ApiError.badRequest(tier.name + ' is free. Cancel your subscription to return to it.');
  }

  // Member 2 contract (docs/sprint2/member2.md, section 3). The reference names the paying member;
  // the idempotency key identifies this payment attempt for this tier.
  const payment = {
    userId: id,
    amountMinor,
    currency: CURRENCY,
    reference: { type: 'membership', id },
    idempotencyKey: key,
    title: 'ShareShed ' + tier.name + ' membership (1 year)',
    returnPath: CLIENT_RETURN_PATH,
  };

  if (method === 'wallet') {
    await payByWallet(id, tier, payment, deps);
    await emitChanged(deps, id, key);
  } else {
    const pending = await payByCard(id, tier, payment, deps);
    if (pending) return { payment: pending };
  }
  return getMyMembership(id);
}

/** Req 87: stop the subscription. Benefits stay until the paid period ends; nothing is refunded. */
async function cancel(userId, deps = features()) {
  const now = new Date();
  const user = await User.findOneAndUpdate(
    {
      _id: userId,
      'membership.tier': { $ne: null },
      'membership.status': 'active',
      'membership.renewsAt': { $gt: now },
    },
    { $set: { 'membership.status': 'cancelled' } },
    { new: true, projection: 'membership' },
  ).lean();
  if (!user) throw ApiError.conflict('You have no active paid subscription to cancel.');
  await emitChanged(deps, userId, ['membership', String(userId), 'cancel', user.membership.renewsAt.toISOString()].join(':'));
  return getMyMembership(userId);
}

/** Req 108: active member accounts by effective own tier, right now. */
async function distributionReport() {
  const now = new Date();
  const memberFilter = { role: ROLES.MEMBER, status: USER_STATUS.ACTIVE };
  const paidPeriod = { $and: [
    { $ne: [{ $ifNull: ['$membership.tier', null] }, null] },
    { $in: ['$membership.status', ['active', 'cancelled']] },
    { $gt: ['$membership.renewsAt', now] },
  ] };
  const [tiers, groups] = await Promise.all([
    MembershipTier.find().sort({ annualFee: 1, waitlistPriority: -1, name: 1 }).lean(),
    User.aggregate([
      { $match: memberFilter },
      { $group: {
        _id: { $cond: [paidPeriod, '$membership.tier', null] },
        members: { $sum: 1 },
        cancelled: { $sum: { $cond: [{ $eq: ['$membership.status', 'cancelled'] }, 1, 0] } },
      } },
    ]),
  ]);

  const total = groups.reduce((sum, group) => sum + group.members, 0);
  const baseTier = tiers.find((tier) => tier.name === BASE_TIER_NAME);
  const known = new Map(tiers.map((tier) => [String(tier._id), tier]));
  const counts = new Map();
  const byStatus = { active: 0, cancelled: 0 };
  let paidMembers = 0;
  for (const group of groups) {
    const tierId = String(group._id);
    // A paid period on the base tier or on a deleted tier is treated as Basic, as entitlements do.
    if (!known.has(tierId) || (baseTier && tierId === String(baseTier._id))) continue;
    counts.set(tierId, group.members);
    paidMembers += group.members;
    byStatus.cancelled += group.cancelled;
    byStatus.active += group.members - group.cancelled;
  }

  const percent = (members) => (total ? Math.round((members / total) * 1000) / 10 : 0);
  const row = (tierId, name, members) => ({ tierId, name, members, percent: percent(members) });
  const items = [row(baseTier ? String(baseTier._id) : null, BASE_TIER_NAME, total - paidMembers)];
  for (const tier of tiers) {
    if (tier === baseTier) continue;
    const members = counts.get(String(tier._id)) || 0;
    if (tier.isActive === false && !members) continue;
    items.push(row(String(tier._id), tier.name, members));
  }
  return { items, total, byStatus, generatedAt: now };
}

module.exports = {
  listTiers, getMyMembership, subscribe, cancel, distributionReport,
  availablePaymentMethods, reconcileCardMembership, PAYMENT_METHODS,
};
