// Member 8 - memberships, entitlements and household benefits (Req 83-88, 108).
// Run: TEST_MONGO_URI='<disposable replica set>' npm run test:sprint2 --prefix server
const assert = require('node:assert/strict');
const { before, after, beforeEach, test } = require('node:test');
const { randomUUID } = require('node:crypto');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'disposable-member8-integration';
const mongoose = require('mongoose');
const app = require('../../src/app');
const { User, MembershipTier, HouseholdLink, Reservation, ReservationHold } = require('../../src/models');
const entitlements = require('../../src/services/membership/entitlements');
const membership = require('../../src/services/membership/membership');
const { features } = require('../../src/services/sprint2/bootstrap');
const ApiError = require('../../src/utils/ApiError');
const { signToken } = require('../../src/utils/tokens');

const DAY = 86400000;
const YEAR = 365 * DAY;
let server, base, basic, plus, premium, admin;
let counter = 0;

async function request(method, path, user, input) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(user && { authorization: 'Bearer ' + signToken(user.id) }),
      ...(input && { 'content-type': 'application/json' }),
    },
    ...(input && { body: JSON.stringify(input) }),
  });
  return { status: response.status, body: await response.json() };
}

async function member(fields = {}) {
  counter += 1;
  const username = 'm8user' + counter;
  return User.create({
    username, name: username, email: username + '@test.invalid',
    phone: '0111' + String(counter).padStart(7, '0'),
    address: { street: 'Test St', city: 'Cairo' }, passwordHash: 'fixture-only', ...fields,
  });
}

const setTier = (user, tier, fields = {}) => User.updateOne({ _id: user.id }, { $set: { membership: {
  tier: tier.id, status: 'active', subscribedAt: new Date(), renewsAt: new Date(Date.now() + 30 * DAY), ...fields,
} } });

const link = (a, b, status = 'accepted') => HouseholdLink.create({
  requester: a.id, recipient: b.id, relation: 'spouse', status,
});

const stored = async (user) => (await User.findById(user.id).lean()).membership || {};
const input = (user, tier, method = 'wallet', operationKey = randomUUID()) => ({
  userId: user.id, tierId: tier.id, method, operationKey,
});

/** Stand-in for Member 2's service: idempotent per key, like the real ledger must be. */
function fakePayment(overrides = {}) {
  const seen = new Set();
  const calls = { charges: 0, records: 0 };
  const once = (name) => async (payment, session) => {
    assert(session.inTransaction(), 'payment must run inside the membership transaction');
    assert.equal(payment.currency, 'EGP');
    assert.equal(payment.purpose, 'membership');
    if (seen.has(payment.idempotencyKey)) return { reference: payment.reference, alreadyApplied: true };
    seen.add(payment.idempotencyKey);
    calls[name] += 1;
    return { reference: payment.reference, alreadyApplied: false };
  };
  return {
    calls,
    payment: { chargeMembership: once('charges'), recordMembershipPayment: once('records'), ...overrides },
  };
}

before(async () => {
  assert(process.env.TEST_MONGO_URI, 'Set TEST_MONGO_URI to a disposable replica set');
  await mongoose.connect(process.env.TEST_MONGO_URI, { dbName: 'member8_test_' + process.pid });
  await Promise.all(Object.values(require('../../src/models')).map((model) => model.init()));
  // Same documents the seed inserts: Basic and Plus have no explicit limit.
  basic = await MembershipTier.create({ name: 'Basic', annualFee: 0, depositDiscountPercent: 0, waitlistPriority: 3 });
  plus = await MembershipTier.create({ name: 'Plus', annualFee: 150, depositDiscountPercent: 10, waitlistPriority: 2 });
  premium = await MembershipTier.create({
    name: 'Premium', annualFee: 300, depositDiscountPercent: 20, waitlistPriority: 1, maxConcurrentReservations: 5,
  });
  admin = await member({ role: 'admin' });
  server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  base = 'http://127.0.0.1:' + server.address().port;
});

after(async () => {
  if (server) {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
  try {
    if (mongoose.connection.readyState === 1) {
      try {
        await mongoose.connection.dropDatabase();
      } catch {
        // Some hosted users (Atlas readWrite) may not drop a database: empty it instead.
        const collections = await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray();
        for (const { name } of collections) await mongoose.connection.db.dropCollection(name);
      }
    }
  } finally {
    // Always disconnect, otherwise a failed cleanup keeps the test process alive.
    await mongoose.disconnect();
  }
});

beforeEach(async () => {
  await HouseholdLink.deleteMany({});
});

// ---------------------------------------------------------------- entitlements (step 2)

test('a member without a paid tier is on Basic with the default limit of 3', async () => {
  const user = await member();
  const result = await entitlements.getEntitlements(user.id);
  assert.deepEqual(result.tier, { id: basic.id, name: 'Basic' });
  assert.equal(result.status, 'none');
  assert.equal(result.expiresAt, null);
  assert.equal(result.discountPercent, 0);
  assert.deepEqual(result.discountSource, { type: 'none' });
  assert.equal(result.waitlistPriority, 3);
  assert.equal(result.maxConcurrentReservations, 3);
  assert.deepEqual(result.countedStatuses, ['pending', 'confirmed', 'active']);
});

test('Plus and Premium give their own discount, priority and limit', async () => {
  const [a, b] = [await member(), await member()];
  await setTier(a, plus);
  await setTier(b, premium);
  const plusResult = await entitlements.getEntitlements(a.id);
  assert.equal(plusResult.discountPercent, 10);
  assert.equal(plusResult.waitlistPriority, 2);
  assert.equal(plusResult.maxConcurrentReservations, 3);
  const premiumResult = await entitlements.getEntitlements(b.id, new Date());
  assert.equal(premiumResult.discountPercent, 20);
  assert.deepEqual(premiumResult.discountSource, { type: 'self', tierName: 'Premium' });
  assert.equal(premiumResult.waitlistPriority, 1);
  assert.equal(premiumResult.maxConcurrentReservations, 5);
  assert.equal(premiumResult.status, 'active');
});

test('an expired tier loses every benefit; a cancelled tier keeps them until the period ends', async () => {
  const [expired, cancelled] = [await member(), await member()];
  await setTier(expired, premium, { renewsAt: new Date(Date.now() - 1000) });
  const gone = await entitlements.getEntitlements(expired.id);
  assert.equal(gone.tier.name, 'Basic');
  assert.equal(gone.status, 'expired');
  assert.equal(gone.discountPercent, 0);
  assert.equal(gone.maxConcurrentReservations, 3);
  assert.equal(gone.waitlistPriority, 3);

  const renewsAt = new Date(Date.now() + 10 * DAY);
  await setTier(cancelled, premium, { status: 'cancelled', renewsAt });
  const kept = await entitlements.getEntitlements(cancelled.id);
  assert.equal(kept.tier.name, 'Premium');
  assert.equal(kept.status, 'cancelled');
  assert.equal(kept.discountPercent, 20);
  assert.equal(kept.expiresAt.getTime(), renewsAt.getTime());
  // The `at` argument decides, not the clock.
  const later = await entitlements.getEntitlements(cancelled.id, new Date(renewsAt.getTime() + 1));
  assert.equal(later.tier.name, 'Basic');
  assert.equal(later.discountPercent, 0);
});

test('only accepted household links share a discount; pending, declined and removed links do not', async () => {
  const [a, b] = [await member(), await member()];
  await setTier(b, premium);

  const pending = await link(a, b, 'pending');
  assert.equal((await entitlements.getEntitlements(a.id)).discountPercent, 0);

  pending.status = 'accepted';
  await pending.save();
  const linked = await entitlements.getEntitlements(a.id);
  assert.equal(linked.discountPercent, 20);
  assert.equal(linked.discountSource.type, 'household');
  assert.equal(linked.discountSource.userId, b.id);
  assert.equal(linked.discountSource.tierName, 'Premium');
  // Only the discount is shared.
  assert.equal(linked.tier.name, 'Basic');
  assert.equal(linked.waitlistPriority, 3);
  assert.equal(linked.maxConcurrentReservations, 3);

  await pending.deleteOne();
  assert.equal((await entitlements.getEntitlements(a.id)).discountPercent, 0);

  await link(a, b, 'declined');
  assert.equal((await entitlements.getEntitlements(a.id)).discountPercent, 0);
});

test('household discounts do not stack: the strongest single discount applies', async () => {
  const [a, b, c] = [await member(), await member(), await member()];
  await setTier(a, plus);
  await setTier(b, premium);
  await setTier(c, plus);
  await link(a, b);
  await link(c, a);
  const lower = await entitlements.getEntitlements(a.id);
  assert.equal(lower.discountPercent, 20);
  assert.equal(lower.discountSource.type, 'household');
  const higher = await entitlements.getEntitlements(b.id);
  assert.equal(higher.discountPercent, 20);
  assert.equal(higher.discountSource.type, 'self');
});

test('links are not transitive and an ineligible partner shares nothing', async () => {
  const [a, b, c, suspended, lapsed] = [await member(), await member(), await member(), await member(), await member()];
  await setTier(c, premium);
  await link(a, b);
  await link(b, c);
  assert.equal((await entitlements.getEntitlements(a.id)).discountPercent, 0);
  assert.equal((await entitlements.getEntitlements(b.id)).discountPercent, 20);

  await setTier(suspended, premium);
  await User.updateOne({ _id: suspended.id }, { status: 'suspended' });
  await setTier(lapsed, premium, { renewsAt: new Date(Date.now() - DAY) });
  await link(a, suspended);
  await link(a, lapsed);
  assert.equal((await entitlements.getEntitlements(a.id)).discountPercent, 0);
});

test('usage counts pending, confirmed and active reservations plus unexpired holds', async () => {
  const user = await member();
  await setTier(user, premium);
  const borrower = user._id;
  await Reservation.collection.insertMany(
    ['pending', 'confirmed', 'active', 'completed', 'cancelled', 'rejected'].map((status) => ({ borrower, status })),
  );
  await ReservationHold.collection.insertMany([
    { borrower, expiresAt: new Date(Date.now() + DAY) },
    { borrower, expiresAt: new Date(Date.now() - DAY) },
  ]);
  assert.deepEqual(await entitlements.getReservationUsage(user.id), { counted: 4, limit: 5 });
});

test('entitlement reads work inside a caller transaction', async () => {
  const [a, b] = [await member(), await member()];
  await setTier(b, plus);
  await link(a, b);
  await mongoose.connection.transaction(async (session) => {
    const result = await entitlements.getEntitlements(a.id, new Date(), session);
    assert.equal(result.discountPercent, 10);
  });
});

// ---------------------------------------------------------------- HTTP (step 4)

test('tiers are public, my membership needs a signed-in member', async () => {
  const tiers = await request('GET', '/api/memberships/tiers');
  assert.equal(tiers.status, 200);
  assert.deepEqual(tiers.body.items.map((t) => [t.name, t.annualFee, t.depositDiscountPercent, t.maxConcurrentReservations]),
    [['Basic', 0, 0, 3], ['Plus', 150, 10, 3], ['Premium', 300, 20, 5]]);
  assert.equal(tiers.body.total, 3);

  assert.equal((await request('GET', '/api/memberships/me')).status, 401);
  assert.equal((await request('GET', '/api/memberships/me', admin)).status, 403);
  const user = await member();
  const mine = await request('GET', '/api/memberships/me', user);
  assert.equal(mine.status, 200);
  assert.equal(mine.body.membership.tier.name, 'Basic');
  assert.equal(mine.body.membership.renewsAt, null);
  assert.deepEqual(mine.body.usage, { counted: 0, limit: 3 });
});

test('subscribe validates its input and fails with 503 while the payment service is missing', async () => {
  const user = await member();
  const body = { tierId: plus.id, method: 'wallet', operationKey: randomUUID() };
  assert.equal((await request('POST', '/api/memberships/subscribe', null, body)).status, 401);
  assert.equal((await request('POST', '/api/memberships/subscribe', admin, body)).status, 403);
  assert.equal((await request('POST', '/api/memberships/subscribe', user, { ...body, tierId: 'nope' })).status, 400);
  assert.equal((await request('POST', '/api/memberships/subscribe', user, { ...body, method: 'cash' })).status, 400);
  assert.equal((await request('POST', '/api/memberships/subscribe', user, { ...body, operationKey: 'x' })).status, 400);
  assert.equal((await request('POST', '/api/memberships/subscribe', user, { ...body, tierId: basic.id })).status, 400);
  assert.equal((await request('POST', '/api/memberships/subscribe', user,
    { ...body, tierId: String(new mongoose.Types.ObjectId()) })).status, 404);

  // No payment module: both methods are unavailable and nothing is granted.
  for (const method of ['wallet', 'card']) {
    await assert.rejects(membership.subscribe(input(user, premium, method), {}), (error) => {
      assert.equal(error.status, 503);
      assert.match(error.message, /Membership payment is unavailable/);
      return true;
    });
  }
  if (!features().payment) {
    const response = await request('POST', '/api/memberships/subscribe', user, body);
    assert.equal(response.status, 503);
    assert.match(response.body.message, /unavailable/);
  }
  assert.equal((await stored(user)).tier, undefined);
  assert.equal((await entitlements.getEntitlements(user.id)).tier.name, 'Basic');
});

// ---------------------------------------------------------------- subscribe / cancel (step 3)

test('wallet subscription activates for one year and a retried key is charged once', async () => {
  const user = await member();
  const fake = fakePayment();
  const attempt = input(user, plus);
  const started = Date.now();
  const first = await membership.subscribe(attempt, fake);
  assert.equal(first.membership.tier.name, 'Plus');
  assert.equal(first.membership.status, 'active');
  assert.equal(first.entitlements.discountPercent, 10);
  const renewsAt = new Date(first.membership.renewsAt).getTime();
  assert(renewsAt >= started + YEAR - DAY && renewsAt <= Date.now() + YEAR + 2 * DAY);

  const retry = await membership.subscribe(attempt, fake);
  assert.equal(fake.calls.charges, 1);
  assert.equal(new Date(retry.membership.renewsAt).getTime(), renewsAt);

  // A new payment for the same tier adds a year to the current renewal date.
  const renewed = await membership.subscribe(input(user, plus), fake);
  assert.equal(fake.calls.charges, 2);
  const expected = new Date(renewsAt);
  expected.setUTCFullYear(expected.getUTCFullYear() + 1);
  assert.equal(new Date(renewed.membership.renewsAt).getTime(), expected.getTime());

  // Switching tier starts a new year now.
  const switched = await membership.subscribe(input(user, premium), fake);
  assert.equal(switched.membership.tier.name, 'Premium');
  assert(new Date(switched.membership.renewsAt).getTime() < expected.getTime());
  assert.equal(switched.usage.limit, 5);
});

test('a failed wallet charge leaves the membership unchanged', async () => {
  const user = await member();
  const fake = fakePayment({
    chargeMembership: async () => { throw ApiError.conflict('Insufficient wallet balance'); },
  });
  await assert.rejects(membership.subscribe(input(user, premium), fake), { status: 409 });
  assert.equal((await stored(user)).tier, undefined);
  assert.equal((await entitlements.getEntitlements(user.id)).discountPercent, 0);
});

test('the event outbox is optional and can never fail a subscription', async () => {
  const [quiet, broken, heard] = [await member(), await member(), await member()];
  const absent = await membership.subscribe(input(quiet, plus), fakePayment());
  assert.equal(absent.membership.tier.name, 'Plus');

  const failing = { ...fakePayment(), events: { enqueueEvent: async () => { throw new Error('outbox down'); } } };
  const survived = await membership.subscribe(input(broken, plus), failing);
  assert.equal(survived.membership.status, 'active');

  const events = [];
  const working = { ...fakePayment(), events: { enqueueEvent: async (...args) => { events.push(args); } } };
  await membership.subscribe(input(heard, premium), working);
  await membership.cancel(heard.id, working);
  assert.deepEqual(events.map(([type]) => type), ['membership_changed', 'membership_changed']);
  const [, aggregateId, recipients, payload, eventKey] = events[0];
  assert.equal(aggregateId, heard.id);
  assert.deepEqual(recipients, [heard.id]);
  assert.equal(payload.tierName, 'Premium');
  assert.equal(payload.status, 'active');
  assert.notEqual(eventKey, events[1][4]);
  assert.equal(events[1][3].status, 'cancelled');
});

test('card subscription waits for a verified payment and applies it once', async () => {
  const user = await member();
  let state = 'pending';
  const fake = fakePayment({
    startCardPayment: async (payment) => {
      assert.equal(payment.returnPath, '/membership');
      return state === 'pending' ? { state, redirectUrl: 'https://stripe.test/pay' } : { state };
    },
    getCardPayment: async (payment) => (state === 'paid'
      ? { state, reference: 'pi_test', amountMinor: payment.amountMinor, currency: payment.currency } : { state }),
  });
  const attempt = input(user, premium, 'card');

  assert.deepEqual(await membership.subscribe(attempt, fake), {
    payment: { state: 'pending', redirectUrl: 'https://stripe.test/pay' },
  });
  assert.equal((await stored(user)).tier, undefined);

  state = 'failed';
  await assert.rejects(membership.subscribe(attempt, fake), { status: 409 });
  assert.equal((await stored(user)).tier, undefined);

  state = 'paid';
  const paid = await membership.subscribe(attempt, fake);
  assert.equal(paid.membership.tier.name, 'Premium');
  const again = await membership.subscribe(attempt, fake);
  assert.equal(fake.calls.records, 1);
  assert.equal(again.membership.renewsAt.getTime(), paid.membership.renewsAt.getTime());

  // A provider amount that does not match the tier fee is never accepted.
  const other = await member();
  const wrong = fakePayment({
    startCardPayment: async () => ({ state: 'paid' }),
    getCardPayment: async () => ({ state: 'paid', reference: 'pi_low', amountMinor: 100, currency: 'EGP' }),
  });
  await assert.rejects(membership.subscribe(input(other, premium, 'card'), wrong), { status: 409 });
  assert.equal((await stored(other)).tier, undefined);

  // Card needs every card operation from Member 2.
  const partial = { payment: { startCardPayment: async () => ({ state: 'paid' }) } };
  await assert.rejects(membership.subscribe(input(other, premium, 'card'), partial), { status: 503 });
});

test('cancelling keeps benefits until the renewal date, then the member is on Basic', async () => {
  const user = await member();
  const none = await request('POST', '/api/memberships/cancel', user);
  assert.equal(none.status, 409);

  const renewsAt = new Date(Date.now() + 20 * DAY);
  await setTier(user, premium, { renewsAt });
  const cancelled = await request('POST', '/api/memberships/cancel', user);
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.membership.status, 'cancelled');
  assert.equal(cancelled.body.membership.cancelAtPeriodEnd, true);
  assert.equal(cancelled.body.membership.tier.name, 'Premium');
  assert.equal(new Date(cancelled.body.membership.renewsAt).getTime(), renewsAt.getTime());
  assert.equal(cancelled.body.entitlements.discountPercent, 20);
  assert.equal((await request('POST', '/api/memberships/cancel', user)).status, 409);

  // Period over: reading the membership stores the expiry.
  await User.updateOne({ _id: user.id }, { $set: { 'membership.renewsAt': new Date(Date.now() - 1000) } });
  const mine = await request('GET', '/api/memberships/me', user);
  assert.equal(mine.body.membership.tier.name, 'Basic');
  assert.equal(mine.body.membership.status, 'expired');
  assert.equal(mine.body.membership.renewsAt, null);
  assert.equal((await stored(user)).status, 'expired');
});

// ---------------------------------------------------------------- household + report (steps 4 and 6)

test('the household list reports the discount in effect and its source', async () => {
  const [a, b] = [await member(), await member()];
  await setTier(b, plus);
  assert.deepEqual((await request('GET', '/api/household', a)).body.benefit,
    { discountPercent: 0, source: { type: 'none' } });
  await link(a, b);
  const response = await request('GET', '/api/household', a);
  assert.equal(response.status, 200);
  assert.equal(response.body.links.length, 1);
  assert.equal(response.body.benefit.discountPercent, 10);
  assert.equal(response.body.benefit.source.type, 'household');
  assert.equal(response.body.benefit.source.tierName, 'Plus');
});

// ---------------------------------------------------------------- end to end through Member 1's checkout

test('checkout enforces the counted-reservation cap and applies the household discount', async () => {
  const { Category, Item } = require('../../src/models');
  const day = (offset) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
  const lender = await member({ lenderStatus: 'verified' });
  const category = await Category.create({ name: 'M8 Tools', slug: 'm8-tools', depositMultiplier: 1 });
  const tool = await Item.create({
    title: 'M8 drill', category: category.id, owner: lender.id, description: 'Test listing', depositAmount: 100,
  });
  const quote = (account) => request('POST', '/api/checkout/quote', account, {
    source: 'single', itemId: tool.id, startDate: day(3), endDate: day(5),
  });
  const counted = (account, statuses) => Reservation.collection.insertMany(
    statuses.map((status) => ({ borrower: account._id, status })),
  );

  // Premium: four counted reservations leave room for one more; five reach the cap.
  const premiumUser = await member();
  await setTier(premiumUser, premium);
  await counted(premiumUser, ['pending', 'confirmed', 'active', 'pending', 'completed', 'cancelled', 'rejected']);
  const underCap = await quote(premiumUser);
  assert.equal(underCap.status, 200, JSON.stringify(underCap.body));
  assert.equal(underCap.body.quote.lines[0].deposit.tierDiscountPercent, 20);
  await counted(premiumUser, ['confirmed']);
  const atCap = await quote(premiumUser);
  assert.equal(atCap.status, 409);
  assert.match(atCap.body.message, /reservation limit/);

  // Basic uses the default limit of 3.
  const basicUser = await member();
  await counted(basicUser, ['pending', 'confirmed']);
  assert.equal((await quote(basicUser)).status, 200);
  await counted(basicUser, ['active']);
  assert.equal((await quote(basicUser)).status, 409);

  // Household: only an accepted link changes the deposit, and only by the strongest single discount.
  const [shopper, partner] = [await member(), await member()];
  await setTier(shopper, plus);
  await setTier(partner, premium);
  const pending = await link(shopper, partner, 'pending');
  assert.equal((await quote(shopper)).body.quote.amountMinor, 9000);
  pending.status = 'accepted';
  await pending.save();
  const linked = await quote(shopper);
  assert.equal(linked.body.quote.amountMinor, 8000);
  assert.equal(linked.body.quote.lines[0].deposit.tierDiscountPercent, 20);
  await pending.deleteOne();
  assert.equal((await quote(shopper)).body.quote.amountMinor, 9000);
});

test('the admin report counts active members by effective tier', async () => {
  await User.deleteMany({ role: 'member' });
  const users = [];
  for (let index = 0; index < 8; index += 1) users.push(await member());
  await setTier(users[0], plus);
  await setTier(users[1], premium);
  await setTier(users[2], premium, { status: 'cancelled' });
  await setTier(users[3], premium, { renewsAt: new Date(Date.now() - DAY) }); // expired -> Basic
  await setTier(users[4], premium);
  await User.updateOne({ _id: users[4].id }, { status: 'suspended' }); // not counted

  assert.equal((await request('GET', '/api/memberships/report')).status, 401);
  assert.equal((await request('GET', '/api/memberships/report', users[5])).status, 403);
  const report = await request('GET', '/api/memberships/report', admin);
  assert.equal(report.status, 200);
  assert.equal(report.body.total, 7);
  assert.deepEqual(report.body.items.map((row) => [row.name, row.members]),
    [['Basic', 4], ['Plus', 1], ['Premium', 2]]);
  assert.equal(report.body.items[1].percent, 14.3);
  assert.deepEqual(report.body.byStatus, { active: 2, cancelled: 1 });
  assert.equal(report.body.items.reduce((sum, row) => sum + row.members, 0), report.body.total);
});
