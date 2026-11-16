// Member 2 - Sprint 2 payment/wallet tests. Needs a MongoDB replica set (Atlas is one) because the services use
// transactions. The test creates and drops its own database, so real data is untouched:
//   TEST_MONGO_URI="<uri>" node --test server/test/sprint2/member2.test.js
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';
const mongoose = require('mongoose');
const User = require('../../src/models/User');
const WalletTransaction = require('../../src/models/WalletTransaction');
const AuditLog = require('../../src/models/AuditLog');
const PaymentOperation = require('../../src/models/PaymentOperation');
const payment = require('../../src/services/payments/payment');
const wallet = require('../../src/services/payments/wallet');

let n = 0;
async function makeUser(walletBalance = 0) {
  n += 1;
  return User.create({
    username: `m2_user_${n}`, name: 'Wallet Tester', email: `m2_${n}@example.com`, phone: `+2010000${String(n).padStart(5, '0')}`,
    address: { street: '1 Test St', city: 'Cairo' }, passwordHash: 'not-used', walletBalance,
  });
}
const reservationRef = () => ({ type: 'reservation', id: new mongoose.Types.ObjectId() });
const balanceOf = async (user) => wallet.getBalanceMinor(user._id);

before(async () => {
  assert.ok(process.env.TEST_MONGO_URI, 'Set TEST_MONGO_URI to a MongoDB replica set (e.g. your Atlas URI)');
  await mongoose.connect(process.env.TEST_MONGO_URI, { dbName: `member2_test_${process.pid}` });
  await Promise.all([User.init(), WalletTransaction.init(), AuditLog.init(), PaymentOperation.init()]);
});
after(async () => {
  if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
beforeEach(async () => {
  await Promise.all([User.deleteMany({}), WalletTransaction.deleteMany({}), AuditLog.deleteMany({}), PaymentOperation.deleteMany({})]);
});

test('wallet charge: debits the balance, writes one ledger row and an audit row with the reservation id', async () => {
  const user = await makeUser(100);
  const reference = reservationRef();
  const out = await payment.charge({ userId: user._id, amountMinor: 2550, purpose: 'deposit', reference, idempotencyKey: 'deposit:a' });

  assert.equal(out.chargedMinor, 2550);
  assert.equal(out.balanceMinor, 7450);
  assert.equal(out.replayed, false);
  assert.equal(await balanceOf(user), 7450);
  assert.equal((await User.findById(user._id)).walletBalance, 74.5); // EGP boundary

  const ledger = await WalletTransaction.find({ user: user._id });
  assert.equal(ledger.length, 1);
  assert.deepEqual([ledger[0].type, ledger[0].amountMinor, ledger[0].balanceAfterMinor, ledger[0].amount], ['deposit_hold', -2550, 7450, -25.5]);
  assert.equal(String(ledger[0].reservation), String(reference.id));

  const auditRow = await AuditLog.findOne({ action: 'deposit_charged' });
  assert.ok(auditRow.at instanceof Date, 'audit row is timestamped');
  assert.equal(String(auditRow.reservation), String(reference.id));
  assert.deepEqual([auditRow.inputs.method, auditRow.inputs.amountMinor, auditRow.result.balanceAfterMinor], ['wallet', 2550, 7450]);
});

test('retry with the same idempotency key charges exactly once', async () => {
  const user = await makeUser(100);
  const input = { userId: user._id, amountMinor: 3000, purpose: 'deposit', reference: reservationRef(), idempotencyKey: 'deposit:retry' };
  const first = await payment.charge(input);
  const second = await payment.charge(input);

  assert.equal(second.replayed, true);
  assert.equal(String(second.operationId), String(first.operationId));
  assert.equal(await balanceOf(user), 7000);
  assert.equal(await WalletTransaction.countDocuments({ user: user._id }), 1);
  assert.equal(await AuditLog.countDocuments({}), 1);
});

test('parallel requests with the same key still charge exactly once', async () => {
  const user = await makeUser(100);
  const input = { userId: user._id, amountMinor: 1000, purpose: 'deposit', reference: reservationRef(), idempotencyKey: 'deposit:parallel' };
  const results = await Promise.allSettled(Array.from({ length: 6 }, () => payment.charge(input)));

  assert.ok(results.some((r) => r.status === 'fulfilled'));
  assert.equal(await balanceOf(user), 9000);
  assert.equal(await WalletTransaction.countDocuments({ user: user._id }), 1);
});

test('same key reused with a different amount is rejected (409)', async () => {
  const user = await makeUser(100);
  const reference = reservationRef();
  await payment.charge({ userId: user._id, amountMinor: 1000, purpose: 'deposit', reference, idempotencyKey: 'deposit:reuse' });
  await assert.rejects(
    payment.charge({ userId: user._id, amountMinor: 9000, purpose: 'deposit', reference, idempotencyKey: 'deposit:reuse' }),
    (err) => err.status === 409
  );
  assert.equal(await balanceOf(user), 9000);
});

test('insufficient funds are rejected (402) and nothing is written', async () => {
  const user = await makeUser(10);
  await assert.rejects(
    payment.charge({ userId: user._id, amountMinor: 1001, purpose: 'deposit', reference: reservationRef(), idempotencyKey: 'deposit:poor' }),
    (err) => err.status === 402
  );
  assert.equal(await balanceOf(user), 1000);
  assert.equal(await WalletTransaction.countDocuments({}), 0);
  assert.equal(await PaymentOperation.countDocuments({}), 0, 'the failed operation is rolled back too');
  assert.equal(await AuditLog.countDocuments({}), 0);
});

test('parallel debits can never overdraw the wallet', async () => {
  const user = await makeUser(100); // 10000 piastres, 10 debits of 3000 -> only 3 can succeed
  const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => payment.charge({
    userId: user._id, amountMinor: 3000, purpose: 'deposit', reference: reservationRef(), idempotencyKey: `deposit:race:${i}`,
  })));

  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 3);
  assert.equal(await balanceOf(user), 1000);
  assert.equal(await WalletTransaction.countDocuments({ user: user._id }), 3);
  const lowest = await WalletTransaction.findOne({ user: user._id }).sort({ balanceAfterMinor: 1 });
  assert.ok(lowest.balanceAfterMinor >= 0);
});

test('money math is exact in piastres (no floating-point drift)', async () => {
  const user = await makeUser(0);
  await payment.creditReferral({ userId: user._id, amountMinor: 10, referralId: new mongoose.Types.ObjectId(), idempotencyKey: 'ref:1' });
  await payment.creditReferral({ userId: user._id, amountMinor: 20, referralId: new mongoose.Types.ObjectId(), idempotencyKey: 'ref:2' });
  assert.equal((await User.findById(user._id)).walletBalance, 0.3); // 0.1 + 0.2 in floats would be 0.30000000000000004
  assert.equal(await AuditLog.countDocuments({ action: 'referral_credited' }), 2);
});

test('deposit and membership payments stay distinct', async () => {
  const user = await makeUser(100);
  await payment.charge({ userId: user._id, amountMinor: 1000, purpose: 'deposit', reference: reservationRef(), idempotencyKey: 'k:deposit' });
  await payment.charge({ userId: user._id, amountMinor: 1500, purpose: 'membership', reference: { type: 'membership', id: new mongoose.Types.ObjectId() }, idempotencyKey: 'k:membership' });
  const types = (await WalletTransaction.find({ user: user._id }).sort({ createdAt: 1 })).map((t) => t.type);
  assert.deepEqual(types, ['deposit_hold', 'membership']);
  assert.deepEqual((await AuditLog.find().sort({ at: 1 })).map((a) => a.action), ['deposit_charged', 'membership_charged']);
});

test("a caller's transaction rollback also undoes the wallet change (atomic with checkout)", async () => {
  const user = await makeUser(100);
  const session = await mongoose.startSession();
  await assert.rejects(session.withTransaction(async () => {
    await payment.charge({ userId: user._id, amountMinor: 4000, purpose: 'deposit', reference: reservationRef(), idempotencyKey: 'deposit:rollback' }, { session });
    throw new Error('checkout failed after the charge'); // e.g. M1 could not create the reservation
  }), /checkout failed/);
  await session.endSession();

  assert.equal(await balanceOf(user), 10000);
  assert.equal(await WalletTransaction.countDocuments({}), 0);
  assert.equal(await PaymentOperation.countDocuments({}), 0);
});

test('bad inputs are rejected before anything happens', async () => {
  const user = await makeUser(100);
  const base = { userId: user._id, purpose: 'deposit', reference: reservationRef(), idempotencyKey: 'deposit:bad' };
  for (const amountMinor of [0, -100, 12.5, '1000']) {
    await assert.rejects(payment.charge({ ...base, amountMinor }), (err) => err.status === 400);
  }
  await assert.rejects(payment.charge({ ...base, amountMinor: 100, currency: 'USD' }), (err) => err.status === 400);
  await assert.rejects(payment.charge({ ...base, amountMinor: 100, purpose: 'gift' }), (err) => err.status === 400);
  await assert.rejects(payment.charge({ ...base, amountMinor: 100, idempotencyKey: '' }), (err) => err.status === 400);
  assert.equal(await balanceOf(user), 10000);
});
