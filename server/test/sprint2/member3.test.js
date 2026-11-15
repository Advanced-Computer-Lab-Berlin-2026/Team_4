// Member 3 (Sprint 2) tests. From server/:
//   node --test test/sprint2/member3.test.js                                  formula tests only
//   TEST_MONGO_URI=<disposable MongoDB> node --test test/sprint2/member3.test.js   + database tests
// Database tests use their own member3_test_<pid> database and drop it afterwards. Never point this at production data.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';
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
