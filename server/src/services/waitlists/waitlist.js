/**
 * WAITLIST SERVICE - Owner: Member 7 (Req 65, 66, 67)
 * Date-specific waitlists. Promotion = priority (M8 tier, 1 = top), then FIFO, and produces an EXPIRING OFFER:
 *   - M1's holdForWaitlist() claims the dates atomically for the offeree (so nobody else can book them),
 *   - the entry becomes 'promoted' with holdId + offerExpiresAt,
 *   - the offeree books via /checkout?source=single&...&holdId=<holdId> (M1's checkout consumes the hold).
 * Public API of this file (for other members / startup):
 *   promoteNext(itemId, range, eventKey)  - offer freed dates to the next eligible member(s)
 *   startWaitlistSweeper()                - background expiry + promotion (call once at server startup)
 *   sweepExpiredOffers(scope)             - one-off expiry pass
 */
const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const Item = require('../../models/Item');
const Reservation = require('../../models/Reservation');
const WaitlistEntry = require('../../models/WaitlistEntry');
const { BLOCKING_STATUSES, isRangeFree, rangesOverlap, todayStart, toDay } = require('../catalog/availabilityBridge');
const {
  localLock, claimHold, releaseHold, isSkippable, enqueueEvent, getWaitlistPriority,
} = require('./integrations');

const OFFER_HOURS = Number(process.env.WAITLIST_OFFER_HOURS) || 12; // claim window (policy owned by M7)
const CANDIDATE_CAP = 200;
const ACTIVE = ['waiting', 'promoted'];

const toRange = (e) => ({ start: e.startDate, end: e.endDate });

/** Priority first, then join order (FIFO). Pure - unit-tested. */
const sortCandidates = (list) =>
  [...list].sort((a, b) => (a.priority - b.priority) || (new Date(a.createdAt) - new Date(b.createdAt)));

const closeEntry = (id, status, from) => WaitlistEntry.updateOne(
  { _id: id, status: from },
  { $set: { status }, $unset: { activeKey: 1 } },
);

/**
 * Settle open offers: a booking by the offeree -> 'fulfilled'; a lapsed offer -> 'expired' (hold released);
 * waiting entries whose dates have started -> 'expired'. Returns the offers that just lapsed.
 */
async function reconcileOffers(scope = {}) {
  const filter = {};
  if (scope.itemId) filter.item = scope.itemId;
  if (scope.userId) filter.user = scope.userId;
  const now = new Date();

  const open = await WaitlistEntry.find({ ...filter, status: 'promoted' }).lean();
  const lapsed = [];
  for (const e of open) {
    const reserved = await Reservation.exists({
      item: e.item, borrower: e.user, status: { $in: BLOCKING_STATUSES },
      startDate: { $lt: e.endDate }, endDate: { $gt: e.startDate },
    });
    if (reserved) { await closeEntry(e._id, 'fulfilled', 'promoted'); continue; }
    if (e.offerExpiresAt && new Date(e.offerExpiresAt) <= now) {
      await closeEntry(e._id, 'expired', 'promoted');
      if (e.holdId) await releaseHold({ holdId: e.holdId, itemId: e.item, borrowerId: e.user });
      lapsed.push(e);
    }
  }
  await WaitlistEntry.updateMany(
    { ...filter, status: 'waiting', startDate: { $lt: todayStart() } },
    { $set: { status: 'expired' }, $unset: { activeKey: 1 } },
  );
  return lapsed;
}

/** Try to give one waiting entry the offer. Claim + entry update + notification commit together. */
async function offerTo(entry, item, eventKey) {
  const now = new Date();
  const offerExpiresAt = new Date(now.getTime() + OFFER_HOURS * 3600 * 1000);
  const session = await mongoose.startSession();
  let promoted = null;
  try {
    await session.withTransaction(async () => {
      promoted = null;
      const fresh = await WaitlistEntry.findOne({ _id: entry._id, status: 'waiting' }).session(session);
      if (!fresh) return; // someone else got there first

      const holdId = await claimHold({
        borrowerId: fresh.user, itemId: fresh.item, startDate: fresh.startDate, endDate: fresh.endDate,
        expiresAt: offerExpiresAt, session,
      });

      promoted = await WaitlistEntry.findOneAndUpdate(
        { _id: fresh._id, status: 'waiting' },
        { $set: { status: 'promoted', promotedAt: now, offerExpiresAt, holdId, priority: entry.priority } },
        { new: true, session },
      );
      await enqueueEvent(
        'waitlist_promoted', promoted._id, [promoted.user],
        {
          itemId: String(promoted.item), itemTitle: item?.title, status: 'offered',
          startDate: toDay(promoted.startDate), endDate: toDay(promoted.endDate),
          holdId: String(promoted.holdId), offerExpiresAt: offerExpiresAt.toISOString(), trigger: eventKey,
        },
        `waitlist_promoted:${promoted._id}`, session,
      );
    });
  } catch (e) {
    if (isSkippable(e)) return null; // M1 says this member cannot take the dates (booked, limit, trust...) - try the next one
    throw e;
  } finally {
    await session.endSession();
  }
  return promoted;
}

/**
 * Offer freed dates to the best eligible waiting member(s).
 * @returns {Promise<Array>} entries that received an offer (empty array = no candidate)
 */
function promoteNext(itemId, range, eventKey = 'manual') {
  return localLock(String(itemId), async () => {
    await reconcileOffers({ itemId });
    const now = new Date();

    const filter = { item: itemId, status: 'waiting', endDate: { $gt: now } };
    if (range) {
      filter.startDate = { $lt: range.end };
      filter.endDate = { $gt: range.start > now ? range.start : now };
    }
    const waiting = await WaitlistEntry.find(filter).limit(CANDIDATE_CAP);
    for (const entry of waiting) entry.priority = await getWaitlistPriority(entry.user); // tier may have changed

    const item = await Item.findById(itemId).select('title').lean();
    const promoted = [];
    for (const entry of sortCandidates(waiting)) {
      const result = await offerTo(entry, item, eventKey);
      if (result) promoted.push(result);
    }
    return promoted;
  });
}

/** Settle offers, then pass every freed range to the next member. */
async function sweepExpiredOffers(scope = {}) {
  const lapsed = await reconcileOffers(scope);
  for (const e of lapsed) await promoteNext(e.item, toRange(e), `expired:${e._id}`);
  return lapsed.length;
}

let sweeper = null;
/**
 * Background safety net: every minute settle offers and offer any date that has become free to the queue.
 * Needed because availability changes are announced as events but nobody calls promoteNext directly.
 * Call once at server startup (M1's bootstrap). Safe to call twice; safe across instances (holds are atomic).
 */
function startWaitlistSweeper({ intervalMs = 60000 } = {}) {
  if (sweeper) return sweeper;
  const tick = async () => {
    try {
      await sweepExpiredOffers();
      const itemIds = await WaitlistEntry.distinct('item', { status: 'waiting', endDate: { $gt: new Date() } });
      for (const id of itemIds) await promoteNext(id, null, 'sweep');
    } catch (e) {
      console.error('[waitlist] sweeper failed:', e.message);
    }
  };
  sweeper = setInterval(tick, intervalMs);
  if (sweeper.unref) sweeper.unref();
  tick();
  return sweeper;
}

/** Req 65 */
async function joinWaitlist(user, itemId, range) {
  const item = await Item.findOne(Item.publicFilter({ _id: itemId })).select('owner').lean();
  if (!item) throw ApiError.notFound('Item not found');
  if (String(item.owner) === String(user._id)) throw ApiError.badRequest('You cannot join the waitlist for your own item');

  await reconcileOffers({ itemId, userId: user._id });
  const mine = await WaitlistEntry.find({ item: itemId, user: user._id, status: { $in: ACTIVE } }).lean();
  if (mine.some((e) => rangesOverlap(toRange(e), range))) {
    throw ApiError.conflict('You are already on the waitlist for overlapping dates');
  }
  if (await isRangeFree(itemId, range)) {
    throw ApiError.conflict('These dates are available. You can reserve them now instead of joining the waitlist.');
  }

  try {
    return await WaitlistEntry.create({
      item: itemId, user: user._id, startDate: range.start, endDate: range.end,
      priority: await getWaitlistPriority(user._id),
    });
  } catch (e) {
    if (e.code === 11000) throw ApiError.conflict('You are already on the waitlist for these dates');
    throw e;
  }
}

/** Req 66. Leaving an open offer releases the hold and passes the dates to the next member. */
async function leaveWaitlist(user, entryId) {
  const session = await mongoose.startSession();
  let old = null;
  try {
    await session.withTransaction(async () => {
      old = await WaitlistEntry.findOneAndUpdate(
        { _id: entryId, user: user._id, status: { $in: ACTIVE } },
        { $set: { status: 'left', leftAt: new Date() }, $unset: { activeKey: 1 } },
        { session }, // returns the document as it was BEFORE the update
      );
      if (!old) throw ApiError.notFound('Waitlist entry not found');
      if (old.status === 'promoted' && old.holdId) {
        await releaseHold({ holdId: old.holdId, itemId: old.item, borrowerId: old.user, session });
      }
    });
  } finally {
    await session.endSession();
  }
  if (old.status === 'promoted') await promoteNext(old.item, toRange(old), `left:${old._id}`);
  return { ...old.toObject(), status: 'left' };
}

async function listMine(userId, { itemId } = {}) {
  await sweepExpiredOffers({ userId });
  const filter = { user: userId, ...(itemId ? { item: itemId } : {}) };
  return WaitlistEntry.find(filter)
    .sort('-createdAt').limit(100)
    .populate({ path: 'item', select: 'title photos' })
    .lean();
}

module.exports = {
  joinWaitlist, leaveWaitlist, listMine, promoteNext, sweepExpiredOffers, startWaitlistSweeper,
  sortCandidates, OFFER_HOURS,
};
