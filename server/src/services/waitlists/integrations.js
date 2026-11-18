/**
 * INTEGRATIONS - Owner: Member 7 (helper inside services/waitlists)
 * Calls into other members' services, resolved lazily at call time. M1 is pinned to the real module
 * (services/reservations/reservationCommands.js); M8 and M9 are optional until their services merge, exactly like
 * M1's own sprint2/bootstrap.features() treats them.
 */
const User = require('../../models/User');

const DEFAULT_PRIORITY = 3; // Basic tier (1 = top)
const warned = new Set();
const warnOnce = (key, msg) => { if (!warned.has(key)) { warned.add(key); console.warn(`[waitlist] ${msg}`); } };

function tryRequire(path) {
  try { return require(path); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; return null; }
}

// ---- local serialization (ordering only; the atomic inventory claim is M1's holdForWaitlist) ----
const chains = new Map();
function localLock(key, fn) {
  const prev = chains.get(key) || Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  const tail = run.catch(() => {});
  chains.set(key, tail);
  tail.then(() => { if (chains.get(key) === tail) chains.delete(key); });
  return run;
}

// ---- M1 waitlist holds (reservationCommands.js) ---------------------------------------------------
/** Atomically claims the dates for one borrower; resolves to the ReservationHold id. Throws an ApiError (4xx) when not allowed. */
async function claimHold(input) {
  const { holdForWaitlist } = require('../reservations/reservationCommands');
  const hold = await holdForWaitlist(input);
  return hold._id;
}

/** Releasing a hold that was already consumed or removed is a safe no-op. */
function releaseHold(input) {
  const { releaseWaitlistHold } = require('../reservations/reservationCommands');
  return releaseWaitlistHold(input);
}

/**
 * M1 refuses a claim with a 4xx ApiError when this member cannot take the dates (booked, membership limit reached,
 * trust score too low, own listing...). That only disqualifies this candidate; the next one is tried.
 */
const isSkippable = (e) => !!e && e.status >= 400 && e.status < 500;

// ---- M9 notification outbox -------------------------------------------------------------------
async function enqueueEvent(type, aggregateId, recipients, payload, eventKey, session) {
  const m9 = tryRequire('../notifications/eventOutbox');
  if (m9 && typeof m9.enqueueEvent === 'function') return m9.enqueueEvent(type, aggregateId, recipients, payload, eventKey, session);
  warnOnce('outbox', `M9 eventOutbox not found - "${type}" notifications are NOT delivered yet.`);
  return null;
}

// ---- M8 entitlements (waitlist priority; 1 = top) --------------------------------------------------
async function getWaitlistPriority(userId) {
  const m8 = tryRequire('../membership/entitlements');
  if (m8 && typeof m8.getEntitlements === 'function') {
    const ent = await m8.getEntitlements(String(userId), new Date());
    if (ent && Number.isFinite(ent.waitlistPriority)) return ent.waitlistPriority;
  }
  // Fallback: read the tier directly (read-only). Expired / inactive tiers get no benefit.
  const u = await User.findById(userId).select('membership').populate('membership.tier', 'waitlistPriority').lean();
  const m = u?.membership;
  if (m && m.status === 'active' && m.tier && (!m.renewsAt || new Date(m.renewsAt) > new Date())) {
    return m.tier.waitlistPriority;
  }
  return DEFAULT_PRIORITY;
}

module.exports = { localLock, claimHold, releaseHold, isSkippable, enqueueEvent, getWaitlistPriority, warnOnce, DEFAULT_PRIORITY };
