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
const ApiError = require('../../utils/ApiError');
const Item = require('../../models/Item');
const Reservation = require('../../models/Reservation');
const ReservationHold = require('../../models/ReservationHold');
const WaitlistEntry = require('../../models/WaitlistEntry');
const { bookingKeys, transactBooking } = require('../reservations/bookingLock');
const { BLOCKING_STATUSES, blockedIntervals, findPublicItem, isRangeFree, todayStart, toDay } = require('../catalog/availabilityBridge');
const {
  localLock, claimHold, releaseHold, isSkippable, enqueueEvent, getWaitlistPriority,
} = require('./integrations');

const configuredHours = Number(process.env.WAITLIST_OFFER_HOURS);
const OFFER_HOURS = Number.isFinite(configuredHours) && configuredHours > 0 ? configuredHours : 12;
const ACTIVE = ['waiting', 'promoted'];

const toRange = (e) => ({ start: e.startDate, end: e.endDate });

/** Priority first, then join order (FIFO). Pure - unit-tested. */
const sortCandidates = (list) =>
  [...list].sort((a, b) => (a.priority - b.priority) || (new Date(a.createdAt) - new Date(b.createdAt)) ||
    String(a._id).localeCompare(String(b._id)));

const matchBooking = (entry) => ({
  item: entry.item, borrower: entry.user, startDate: entry.startDate, endDate: entry.endDate,
});

const bookedOffer = (entry, session) => Reservation.exists({
  ...matchBooking(entry), createdAt: { $gte: entry.promotedAt },
  $or: [{ checkoutAttempt: { $exists: true } }, { status: { $in: [...BLOCKING_STATUSES, 'completed'] } }],
}).session(session);

const pendingPayment = (entry, session) => ReservationHold.exists({
  ...matchBooking(entry), attempt: { $exists: true }, expiresAt: { $gt: new Date() },
}).session(session);

const closeEntry = (entry, status, session) => WaitlistEntry.updateOne(
  { _id: entry._id, status: 'promoted' },
  { $set: { status }, $unset: { activeKey: 1 } }, { session },
);

async function reconcileOffer(entry) {
  const held = () => ReservationHold.exists({ _id: entry.holdId, expiresAt: { $gt: new Date() } });
  if (entry.holdId && entry.offerExpiresAt > new Date() && await held()) return false;

  return transactBooking(bookingKeys([entry.item], entry.user), async (session) => {
    if (!(await WaitlistEntry.exists({ _id: entry._id, status: 'promoted' }).session(session))) return false;
    // Checkout replaces its offer hold with a payment hold or a reservation for these exact dates.
    if (await bookedOffer(entry, session)) {
      await closeEntry(entry, 'fulfilled', session);
      return false;
    }
    if (await pendingPayment(entry, session)) return false;
    await closeEntry(entry, 'expired', session);
    return true;
  });
}

/** Settle consumed and expired offers, and close waiting entries whose pickup day has passed. */
async function reconcileOffers(scope = {}) {
  const filter = {};
  if (scope.itemId) filter.item = scope.itemId;
  if (scope.userId) filter.user = scope.userId;
  const open = await WaitlistEntry.find({ ...filter, status: 'promoted' }).lean();
  const lapsed = [];
  for (const e of open) {
    if (await reconcileOffer(e)) lapsed.push(e);
  }
  await WaitlistEntry.updateMany(
    { ...filter, status: 'waiting', startDate: { $lt: todayStart() } },
    { $set: { status: 'expired' }, $unset: { activeKey: 1 } },
  );
  return lapsed;
}

/** Try to give one waiting entry the offer. Claim + entry update + notification commit together. */
async function offerTo(entry, item, eventKey) {
  try {
    return await transactBooking(bookingKeys([entry.item], entry.user), async (session) => {
      const fresh = await WaitlistEntry.findOne({ _id: entry._id, status: 'waiting' }).session(session);
      if (!fresh) return null;
      const now = new Date();
      const offerExpiresAt = new Date(Math.min(+now + OFFER_HOURS * 3600 * 1000, +fresh.endDate));

      const holdId = await claimHold({
        borrowerId: fresh.user, itemId: fresh.item, startDate: fresh.startDate, endDate: fresh.endDate,
        expiresAt: offerExpiresAt, session,
      });

      const promoted = await WaitlistEntry.findOneAndUpdate(
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
          title: 'Waitlist offer available',
          message: `${item.title} is available for ${toDay(promoted.startDate)} to ${toDay(promoted.endDate)}. Claim the offer from My waitlists before it expires.`,
          link: '/waitlists',
        },
        `waitlist_promoted:${promoted._id}`, session,
      );
      return promoted;
    });
  } catch (e) {
    if (isSkippable(e)) return null; // M1 says this member cannot take the dates (booked, limit, trust...) - try the next one
    throw e;
  }
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
    const item = await findPublicItem(itemId, 'title category');
    if (!item) return [];
    const waiting = await WaitlistEntry.find(filter).lean();
    if (!waiting.length) return [];
    const bounds = waiting.reduce((window, entry) => ({
      start: entry.startDate < window.start ? entry.startDate : window.start,
      end: entry.endDate > window.end ? entry.endDate : window.end,
    }), toRange(waiting[0]));
    const booked = await blockedIntervals(itemId, bounds);
    // Re-read the current priority before ordering the entire queue.
    const eligible = [];
    for (const entry of waiting) {
      const start = toDay(entry.startDate);
      const end = toDay(entry.endDate);
      if (booked.some((interval) => interval.start < end && interval.end > start)) continue;
      entry.priority = await getWaitlistPriority(entry.user);
      eligible.push(entry);
    }
    const promoted = [];
    for (const entry of sortCandidates(eligible)) {
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
  if (sweeper || process.env.WAITLIST_SWEEPER === 'off') return sweeper;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await reconcileOffers();
      const itemIds = await WaitlistEntry.distinct('item', { status: 'waiting', endDate: { $gt: new Date() } });
      for (const id of itemIds) {
        await promoteNext(id, null, 'sweep').catch((error) => {
          console.error(`[waitlist] promotion failed for ${id}:`, error.message);
        });
      }
    } catch (e) {
      console.error('[waitlist] sweeper failed:', e.message);
    } finally {
      running = false;
    }
  };
  sweeper = setInterval(tick, intervalMs);
  if (sweeper.unref) sweeper.unref();
  tick();
  return sweeper;
}

/** Req 65 */
async function joinWaitlist(user, itemId, range) {
  await reconcileOffers({ itemId, userId: user._id });
  const priority = await getWaitlistPriority(user._id);
  return transactBooking(bookingKeys([itemId], user._id), async (session) => {
    const item = await findPublicItem(itemId, 'owner category', session);
    if (!item) throw ApiError.notFound('Item not found');
    if (String(item.owner) === String(user._id)) throw ApiError.badRequest('You cannot join the waitlist for your own item');
    if (await WaitlistEntry.exists({
      item: itemId, user: user._id, status: { $in: ACTIVE }, startDate: { $lt: range.end }, endDate: { $gt: range.start },
    }).session(session)) throw ApiError.conflict('You are already on the waitlist for overlapping dates');
    if (await isRangeFree(itemId, range, session)) {
      throw ApiError.conflict('These dates are available. You can reserve them now instead of joining the waitlist.');
    }
    const [entry] = await WaitlistEntry.create([{
      item: itemId, user: user._id, startDate: range.start, endDate: range.end, priority,
    }], { session });
    return entry;
  });
}

/** Req 66. Leaving an open offer releases the hold and passes the dates to the next member. */
async function leaveWaitlist(user, entryId) {
  const entry = await WaitlistEntry.findOne({ _id: entryId, user: user._id, status: { $in: ACTIVE } }).select('item');
  if (!entry) throw ApiError.notFound('Waitlist entry not found');
  await reconcileOffers({ itemId: entry.item, userId: user._id });
  const old = await transactBooking(bookingKeys([entry.item], user._id), async (session) => {
    const prior = await WaitlistEntry.findOneAndUpdate(
      { _id: entryId, user: user._id, status: { $in: ACTIVE } },
      { $set: { status: 'left', leftAt: new Date() }, $unset: { activeKey: 1 } },
      { session },
    );
    if (!prior) throw ApiError.notFound('Waitlist entry not found');
    if (prior.status === 'promoted' && prior.holdId) {
      if (await bookedOffer(prior, session)) throw ApiError.conflict('This offer has already been reserved');
      if (await pendingPayment(prior, session)) {
        throw ApiError.conflict('Finish the active checkout before giving up the offer');
      }
      await releaseHold({ holdId: prior.holdId, itemId: prior.item, borrowerId: prior.user, session });
    }
    return prior;
  });
  if (old.status === 'promoted') {
    await promoteNext(old.item, toRange(old), `left:${old._id}`).catch((error) => {
      console.error('[waitlist] promotion after leave will retry:', error.message);
    });
  }
  return { ...old.toObject(), status: 'left' };
}

async function listMine(userId, { itemId } = {}) {
  await sweepExpiredOffers({ userId });
  const filter = { user: userId, ...(itemId ? { item: itemId } : {}) };
  const entries = await WaitlistEntry.find(filter).sort('-createdAt -_id')
    .populate({ path: 'item', select: 'title', match: Item.publicFilter() }).lean();
  const active = entries.filter((entry) => entry.item && entry.status === 'promoted');
  if (!active.length) return entries;
  const holds = await ReservationHold.find({
    borrower: userId, attempt: { $exists: true }, expiresAt: { $gt: new Date() },
    $or: active.map(({ item, startDate, endDate }) => ({ item: item._id, startDate, endDate })),
  }).select('item startDate endDate attempt').lean();
  for (const entry of active) {
    entry.checkoutAttemptId = holds.find((hold) => hold.item.equals(entry.item._id) &&
      +hold.startDate === +entry.startDate && +hold.endDate === +entry.endDate)?.attempt;
  }
  return entries;
}

module.exports = {
  joinWaitlist, leaveWaitlist, listMine, promoteNext, sweepExpiredOffers, startWaitlistSweeper,
  sortCandidates, OFFER_HOURS,
};
