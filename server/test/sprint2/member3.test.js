// Member 3 (Sprint 2) tests. From server/:
//   node --test test/sprint2/member3.test.js                                  formula tests only
//   TEST_MONGO_URI=<disposable MongoDB> node --test test/sprint2/member3.test.js   + database tests
// Database tests use their own member3_test_<pid> database and drop it afterwards. Never point this at production data.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'member3-test-secret-not-for-production';
const mongoose = require('mongoose');
const trust = require('../../src/services/reviews/trust');

const { computeTrust, isOnTime } = trust;
const score = (h) => computeTrust(h).trustScore;

describe('trust formula (Req 98)', () => {
  test('new user starts at the default score', () => {
    assert.equal(score({}), 50);
  });

  test('matches the worked examples in docs/sprint2/member3.md §5.1', () => {
    assert.equal(score({ completed: 5, returns: 5, onTimeReturns: 5, ratingSum: 25, ratingCount: 5 }), 75);
    assert.equal(score({ completed: 10, returns: 10, onTimeReturns: 8, upheldDamage: 1, ratingSum: 40, ratingCount: 10 }), 70);
    assert.equal(score({ completed: 4, returns: 4, onTimeReturns: 1, upheldDamage: 2, ratingSum: 8, ratingCount: 4 }), 35);
    assert.equal(score({ completed: 20, returns: 20, onTimeReturns: 20, ratingSum: 100, ratingCount: 20 }), 90);
  });

  test('late returns and upheld damage lower the score', () => {
    const clean = { completed: 10, returns: 10, onTimeReturns: 10, ratingSum: 40, ratingCount: 10 };
    assert.ok(score({ ...clean, onTimeReturns: 6 }) < score(clean));
    assert.ok(score({ ...clean, upheldDamage: 1 }) < score(clean));
    assert.ok(score({ ...clean, upheldDamage: 2 }) < score({ ...clean, upheldDamage: 1 }));
  });

  test('ratings alone cannot carry the score (behaviour weighs 85%)', () => {
    const perfectRatingsBadBehaviour = score({ completed: 10, returns: 10, onTimeReturns: 0, upheldDamage: 5, ratingSum: 50, ratingCount: 10 });
    const poorRatingsGoodBehaviour = score({ completed: 10, returns: 10, onTimeReturns: 10, ratingSum: 10, ratingCount: 10 });
    assert.ok(perfectRatingsBadBehaviour < 30, `got ${perfectRatingsBadBehaviour}`);
    assert.ok(poorRatingsGoodBehaviour > perfectRatingsBadBehaviour);
  });

  test('more good history means more confidence', () => {
    const perfect = (n) => score({ completed: n, returns: n, onTimeReturns: n, ratingSum: 5 * n, ratingCount: n });
    assert.ok(perfect(1) < perfect(5) && perfect(5) < perfect(20) && perfect(20) < perfect(100));
    assert.ok(perfect(1000) <= 100);
  });

  test('a lender who never borrowed is rated on completions and reviews only', () => {
    assert.equal(score({ completed: 5, ratingSum: 25, ratingCount: 5 }), 75);
  });

  test('always an integer between 0 and 100, even for inconsistent input', () => {
    for (const h of [
      { completed: 50, returns: 50, onTimeReturns: 0, upheldDamage: 50, ratingSum: 50, ratingCount: 50 },
      { completed: 3, returns: 2, onTimeReturns: 5, upheldDamage: -1, ratingSum: 99, ratingCount: 1 },
      { completed: 1e6, returns: 1e6, onTimeReturns: 1e6, ratingSum: 5e6, ratingCount: 1e6 },
    ]) {
      const s = score(h);
      assert.ok(Number.isInteger(s) && s >= 0 && s <= 100, `${JSON.stringify(h)} -> ${s}`);
    }
  });

  test('same history always gives the same score', () => {
    const h = { completed: 7, returns: 6, onTimeReturns: 5, upheldDamage: 1, ratingSum: 27, ratingCount: 7 };
    assert.deepEqual(computeTrust(h), computeTrust({ ...h }));
  });
});

describe('on-time rule', () => {
  const endDate = new Date('2026-12-10T00:00:00Z');
  test('returning any time on the due date counts as on time', () => {
    assert.equal(isOnTime({ endDate, returnedAt: new Date('2026-12-09T10:00:00Z') }), true);
    assert.equal(isOnTime({ endDate, returnedAt: new Date('2026-12-10T23:59:00Z') }), true);
  });
  test('returning after the due date is late', () => {
    assert.equal(isOnTime({ endDate, returnedAt: new Date('2026-12-11T00:00:01Z') }), false);
  });
  test('a reservation without a return date is not on time', () => {
    assert.equal(isOnTime({ endDate }), false);
  });
});

// ---------------------------------------------------------------------------------------------
describe('recalculateTrust against the database', { skip: !process.env.TEST_MONGO_URI && 'set TEST_MONGO_URI to run' }, () => {
  const User = require('../../src/models/User');
  const Item = require('../../src/models/Item');
  const Category = require('../../src/models/Category');
  const Reservation = require('../../src/models/Reservation');
  const DamageReport = require('../../src/models/DamageReport');
  const Review = require('../../src/models/Review');
  let borrower, lender, item;
  const day = (d) => new Date(`2026-12-${String(d).padStart(2, '0')}T00:00:00Z`);

  const mkUser = async (username, extra = {}) => {
    const u = new User({ username, name: username, email: `${username}@example.com`, phone: `+2010${Math.floor(Math.random() * 1e7)}`, address: { street: '1 Test St', city: 'Cairo' }, ...extra });
    await u.setPassword('Testing123!');
    return u.save();
  };
  const reserve = (fields) => Reservation.create({ item: item._id, borrower: borrower._id, lender: lender._id, startDate: day(1), endDate: day(5), ...fields });

  before(async () => {
    await mongoose.connect(process.env.TEST_MONGO_URI, { dbName: `member3_test_${process.pid}` });
    await Promise.all([User.init(), Reservation.init(), DamageReport.init(), Review.init()]);
    borrower = await mkUser('trust_borrower');
    lender = await mkUser('trust_lender', { lenderStatus: 'verified' });
    const category = await Category.create({ name: 'Test tools', slug: 'test-tools' });
    item = await Item.create({ owner: lender._id, title: 'Test drill', category: category._id, description: 'A drill for tests', depositAmount: 400 });
  });

  after(async () => {
    try {
      // The team's Atlas user may not drop databases, so empty and drop each collection instead.
      for (const c of await mongoose.connection.db.collections()) {
        await c.deleteMany({});
        await c.drop().catch(() => {});
      }
    } finally {
      await mongoose.disconnect();
    }
  });

  test('user with no history keeps the default score and zero stats', async () => {
    const r = await trust.recalculateTrust(borrower._id);
    assert.equal(r.trustScore, 50);
    assert.deepEqual(r.stats, { completedReservations: 0, onTimeReturns: 0, lateReturns: 0, damageReports: 0, ratingSum: 0, ratingCount: 0 });
  });

  test('counts completed reservations, on-time and late returns; ignores other statuses', async () => {
    await reserve({ status: 'completed', returnedAt: day(5) }); // on time (due date itself)
    await reserve({ status: 'completed', returnedAt: day(4) }); // early
    await reserve({ status: 'completed', returnedAt: day(7) }); // late
    await reserve({ status: 'active' });
    await reserve({ status: 'cancelled' });
    const r = await trust.recalculateTrust(borrower._id);
    assert.equal(r.stats.completedReservations, 3);
    assert.equal(r.stats.onTimeReturns, 2);
    assert.equal(r.stats.lateReturns, 1);
    assert.equal(r.trustScore, trust.computeTrust({ completed: 3, returns: 3, onTimeReturns: 2 }).trustScore);
    // The lender took part in the same 3 completed reservations but returned nothing.
    const l = await trust.recalculateTrust(lender._id);
    assert.equal(l.stats.completedReservations, 3);
    assert.equal(l.stats.lateReturns, 0);
  });

  test('repeating the same recalculation never inflates the score (idempotent)', async () => {
    const first = await trust.recalculateTrust(borrower._id, { eventKey: 'reservation:x:completed' });
    for (let i = 0; i < 3; i++) await trust.recalculateTrust(borrower._id, { eventKey: 'reservation:x:completed' });
    const concurrent = await Promise.all([1, 2, 3].map(() => trust.recalculateTrust(borrower._id)));
    for (const r of concurrent) assert.deepEqual(r, first);
    const saved = await User.findById(borrower._id).lean();
    assert.equal(saved.trustScore, first.trustScore);
    assert.equal(saved.stats.completedReservations, 3);
  });

  test('only upheld damage counts: open or zero-amount reports do not, a dispute can cancel one', async () => {
    const [r1, r2, r3] = await Reservation.find({ borrower: borrower._id, status: 'completed' }).sort({ createdAt: 1 });
    const base = { item: item._id, reportedBy: lender._id, borrower: borrower._id, description: 'Scratched casing' };
    await DamageReport.create({ ...base, reservation: r1._id, status: 'open' });
    await DamageReport.create({ ...base, reservation: r2._id, status: 'decided', decision: { forfeitAmount: 0 } });
    const disputed = await DamageReport.create({ ...base, reservation: r3._id, status: 'decided', decision: { forfeitAmount: 150 } });
    let r = await trust.recalculateTrust(borrower._id);
    assert.equal(r.stats.damageReports, 1);
    const withDamage = r.trustScore;

    disputed.status = 'resolved';
    disputed.resolution = { finalForfeitAmount: 0 }; // admin overturned the decision
    await disputed.save();
    r = await trust.recalculateTrust(borrower._id);
    assert.equal(r.stats.damageReports, 0);
    assert.ok(r.trustScore > withDamage, `${r.trustScore} should be above ${withDamage}`);
  });

  test('reviews received count; reviews written by the user do not', async () => {
    const [r1, r2] = await Reservation.find({ borrower: borrower._id, status: 'completed' }).sort({ createdAt: 1 });
    await Review.create({ reservation: r1._id, reviewer: lender._id, reviewee: borrower._id, direction: 'lender_to_borrower', rating: 5 });
    await Review.create({ reservation: r2._id, reviewer: lender._id, reviewee: borrower._id, direction: 'lender_to_borrower', rating: 3 });
    await Review.create({ reservation: r1._id, reviewer: borrower._id, reviewee: lender._id, direction: 'borrower_to_lender', rating: 1 });
    const r = await trust.recalculateTrust(borrower._id);
    assert.equal(r.stats.ratingCount, 2);
    assert.equal(r.stats.ratingSum, 8);
  });

  test('writes only trustScore and stats, leaving other user fields untouched', async () => {
    await User.updateOne({ _id: borrower._id }, { $set: { walletBalance: 123, name: 'Kept Name' } });
    await trust.recalculateTrust(borrower._id);
    const saved = await User.findById(borrower._id).lean();
    assert.equal(saved.walletBalance, 123);
    assert.equal(saved.name, 'Kept Name');
  });

  test('unknown user fails with 404', async () => {
    await assert.rejects(trust.recalculateTrust(new mongoose.Types.ObjectId()), (e) => e.status === 404);
  });

  test('getTrustSummary returns public-safe fields only', async () => {
    const s = await trust.getTrustSummary(borrower._id);
    assert.deepEqual(Object.keys(s).sort(), ['stats', 'trustScore', 'user']);
    assert.deepEqual(Object.keys(s.user).sort(), ['_id', 'isVerifiedLender', 'memberSince', 'name', 'username']);
    assert.equal(s.stats.completedReservations, 3);
    assert.equal(s.stats.onTimeRate, 0.67);
    assert.equal(s.stats.ratingAverage, 4);
    assert.equal((await trust.getTrustSummary(lender._id)).user.isVerifiedLender, true);
    await assert.rejects(trust.getTrustSummary('not-an-id'), (e) => e.status === 400);
    await assert.rejects(trust.getTrustSummary(new mongoose.Types.ObjectId()), (e) => e.status === 404);
  });
});

// ---------------------------------------------------------------------------------------------
describe('reviews API (Req 89, 90, 91, 97)', { skip: !process.env.TEST_MONGO_URI && 'set TEST_MONGO_URI to run' }, () => {
  const app = require('../../src/app');
  const { signToken } = require('../../src/utils/tokens');
  const User = require('../../src/models/User');
  const Item = require('../../src/models/Item');
  const Category = require('../../src/models/Category');
  const Reservation = require('../../src/models/Reservation');
  const Review = require('../../src/models/Review');
  let server, base, admin, borrower, lender, outsider, item, done, active, old;

  const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  const mkUser = async (username, extra = {}) => {
    const u = new User({ username, name: `Name ${username}`, email: `${username}@example.com`, phone: `+2011${Math.floor(Math.random() * 1e7)}`, address: { street: '1 Test St', city: 'Cairo' }, ...extra });
    await u.setPassword('Testing123!');
    return u.save();
  };
  const call = async (path, { user, body, method = 'GET' } = {}) => {
    const res = await fetch(`${base}/api${path}`, {
      method,
      headers: { ...(user ? { Authorization: `Bearer ${signToken(user._id)}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  const review = (user, reservation, rating = 5, comment) => call('/reviews', { user, method: 'POST', body: { reservationId: String(reservation._id), rating, comment } });

  before(async () => {
    await mongoose.connect(process.env.TEST_MONGO_URI, { dbName: `member3_reviews_${process.pid}` });
    await Promise.all(Object.values(require('../../src/models')).map((m) => m.init()));
    server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    base = `http://127.0.0.1:${server.address().port}`;
    admin = await mkUser('rv_admin', { role: 'admin' });
    borrower = await mkUser('rv_borrower');
    lender = await mkUser('rv_lender', { lenderStatus: 'verified' });
    outsider = await mkUser('rv_outsider');
    const category = await Category.create({ name: 'Review tools', slug: 'review-tools' });
    item = await Item.create({ owner: lender._id, title: 'Pressure washer', category: category._id, description: 'For tests', depositAmount: 300 });
    const r = (fields) => Reservation.create({ item: item._id, borrower: borrower._id, lender: lender._id, startDate: daysAgo(10), endDate: daysAgo(3), ...fields });
    done = await r({ status: 'completed', returnedAt: daysAgo(2) });
    active = await r({ status: 'active' });
    old = await r({ status: 'completed', returnedAt: daysAgo(20) });
  });

  after(async () => {
    try {
      if (server) await new Promise((resolve) => server.close(resolve));
      for (const c of await mongoose.connection.db.collections()) {
        await c.deleteMany({});
        await c.drop().catch(() => {});
      }
    } finally {
      await mongoose.disconnect();
    }
  });

  test('requires login; admins cannot write reviews', async () => {
    assert.equal((await call('/reviews/mine')).status, 401);
    assert.equal((await call(`/reviews/user/${lender._id}`)).status, 401);
    assert.equal((await review(admin, done)).status, 403);
  });

  test('validates rating, comment and reservation id', async () => {
    for (const rating of [0, 6, 3.5, 'five']) assert.equal((await review(borrower, done, rating)).status, 400, `rating ${rating}`);
    assert.equal((await review(borrower, done, 4, 'x'.repeat(1501))).status, 400);
    assert.equal((await call('/reviews', { user: borrower, method: 'POST', body: { reservationId: 'nope', rating: 4 } })).status, 400);
    assert.equal((await review(borrower, { _id: new mongoose.Types.ObjectId() })).status, 404);
  });

  test('only participants, only after completion, only within 14 days', async () => {
    assert.equal((await review(outsider, done)).status, 403);
    const notDone = await review(borrower, active);
    assert.equal(notDone.status, 409);
    assert.match(notDone.data.message, /after the reservation is completed/);
    const expired = await review(borrower, old);
    assert.equal(expired.status, 409);
    assert.match(expired.data.message, /review window closed/);
  });

  test('pending list shows only reviewable reservations', async () => {
    const { status, data } = await call('/reviews/pending', { user: borrower });
    assert.equal(status, 200);
    assert.deepEqual(data.items.map((i) => String(i.reservationId)), [String(done._id)]);
    assert.equal(data.items[0].direction, 'borrower_to_lender');
    assert.equal(data.items[0].otherParty.username, 'rv_lender');
    assert.equal(data.items[0].item.title, 'Pressure washer');
    assert.equal((await call('/reviews/pending', { user: outsider })).data.items.length, 0);
  });

  test('borrower reviews lender (Req 89): direction from the server, trust updated', async () => {
    const { status, data } = await review(borrower, done, 4, '  Great washer, easy pickup.  ');
    assert.equal(status, 201);
    assert.equal(data.review.direction, 'borrower_to_lender');
    assert.equal(data.review.reviewer.username, 'rv_borrower');
    assert.equal(data.review.reviewee.username, 'rv_lender');
    assert.equal(data.review.item.title, 'Pressure washer');
    assert.equal(data.review.comment, 'Great washer, easy pickup.');
    assert.equal(data.review.rating, 4);
    const saved = await User.findById(lender._id).lean();
    assert.equal(saved.stats.ratingCount, 1);
    assert.equal(saved.stats.ratingSum, 4);
  });

  test('one review per author per reservation, even with simultaneous requests', async () => {
    const again = await review(borrower, done, 1);
    assert.equal(again.status, 409);
    assert.match(again.data.message, /already reviewed/);
    const both = await Promise.all([review(lender, done, 5, 'Careful borrower'), review(lender, done, 2)]);
    assert.deepEqual(both.map((r) => r.status).sort(), [201, 409]);
    assert.equal(await Review.countDocuments({ reservation: done._id }), 2);
    assert.equal((await User.findById(borrower._id).lean()).stats.ratingCount, 1);
  });

  test('after reviewing, the reservation leaves the pending list', async () => {
    assert.equal((await call('/reviews/pending', { user: borrower })).data.items.length, 0);
    assert.equal((await call('/reviews/pending', { user: lender })).data.items.length, 0);
  });

  test('my reviews given and received (Req 97)', async () => {
    const received = await call('/reviews/mine', { user: lender });
    assert.equal(received.status, 200);
    assert.equal(received.data.total, 1);
    assert.equal(received.data.items[0].reviewer.username, 'rv_borrower');
    assert.deepEqual(Object.keys(received.data).sort(), ['items', 'limit', 'page', 'pages', 'total']);
    const given = await call('/reviews/mine?type=given', { user: lender });
    assert.equal(given.data.total, 1);
    assert.equal(given.data.items[0].reviewee.username, 'rv_borrower');
    assert.equal((await call('/reviews/mine?type=everything', { user: lender })).status, 400);
    assert.equal((await call('/reviews/mine', { user: outsider })).data.total, 0);
  });

  test('received reviews of another user (Req 91), without private details', async () => {
    const { status, data } = await call(`/reviews/user/${lender._id}`, { user: outsider });
    assert.equal(status, 200);
    assert.equal(data.total, 1);
    assert.deepEqual(Object.keys(data.items[0].reviewer).sort(), ['_id', 'name', 'username']);
    assert.equal((await call(`/reviews/user/${new mongoose.Types.ObjectId()}`, { user: outsider })).status, 404);
    assert.equal((await call('/reviews/user/not-an-id', { user: outsider })).status, 400);
  });

  test('reviews cannot be edited or deleted', async () => {
    const [existing] = await Review.find({ reviewer: borrower._id }).lean();
    assert.equal((await call(`/reviews/${existing._id}`, { user: borrower, method: 'DELETE' })).status, 404);
    assert.equal((await call(`/reviews/${existing._id}`, { user: borrower, method: 'PATCH', body: { rating: 1 } })).status, 404);
    assert.equal((await Review.findById(existing._id).lean()).rating, 4);
  });

  // ---- trust profiles (Req 91, 98) - reuses the reservations and reviews created above
  const PROFILE_KEYS = ['stats', 'trustScore', 'user'];
  const USER_KEYS = ['_id', 'isVerifiedLender', 'memberSince', 'name', 'username'];

  test('trust profile is public and contains no private details', async () => {
    const { status, data } = await call(`/trust-profiles/${lender._id}`); // no login: item details shows it to guests
    assert.equal(status, 200);
    assert.deepEqual(Object.keys(data.profile).sort(), PROFILE_KEYS);
    assert.deepEqual(Object.keys(data.profile.user).sort(), USER_KEYS);
    assert.equal(data.profile.user.isVerifiedLender, true);
    assert.equal(data.profile.stats.ratingAverage, 4);
    assert.equal(data.profile.stats.ratingCount, 1);
    assert.ok(!JSON.stringify(data).includes('@example.com'), 'email must not leak');
    assert.equal((await call('/trust-profiles/not-an-id')).status, 400);
    assert.equal((await call(`/trust-profiles/${new mongoose.Types.ObjectId()}`)).status, 404);
  });

  test('own trust profile at /me (members only)', async () => {
    assert.equal((await call('/trust-profiles/me')).status, 401);
    assert.equal((await call('/trust-profiles/me', { user: admin })).status, 403);
    const { status, data } = await call('/trust-profiles/me', { user: borrower });
    assert.equal(status, 200);
    assert.equal(String(data.profile.user._id), String(borrower._id));
    assert.deepEqual(Object.keys(data.profile).sort(), PROFILE_KEYS);
    // Set when the lender's review of the borrower triggered a recalculation above.
    assert.equal(data.profile.stats.completedReservations, 2);
  });

  test('admin recalculation repairs a wrong stored score (Req 98)', async () => {
    await User.updateOne({ _id: borrower._id }, { $set: { trustScore: 99, 'stats.completedReservations': 42 } });
    assert.equal((await call(`/trust-profiles/${borrower._id}/recalculate`, { method: 'POST' })).status, 401);
    assert.equal((await call(`/trust-profiles/${borrower._id}/recalculate`, { user: borrower, method: 'POST' })).status, 403);
    const { status, data } = await call(`/trust-profiles/${borrower._id}/recalculate`, { user: admin, method: 'POST' });
    assert.equal(status, 200);
    // History: 2 completed reservations - `done` returned a day after its due date (late), `old` on time -
    // and one review from the lender (5 or 2 stars, whichever won the simultaneous-request test above).
    const { rating } = await Review.findOne({ reviewee: borrower._id }).lean();
    const expected = trust.computeTrust({ completed: 2, returns: 2, onTimeReturns: 1, ratingSum: rating, ratingCount: 1 }).trustScore;
    assert.equal(data.profile.trustScore, expected);
    assert.equal(data.profile.stats.completedReservations, 2);
    assert.equal((await User.findById(borrower._id).lean()).trustScore, expected);
    assert.equal((await call(`/trust-profiles/${new mongoose.Types.ObjectId()}/recalculate`, { user: admin, method: 'POST' })).status, 404);
  });
});
