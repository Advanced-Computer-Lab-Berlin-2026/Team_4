// Member 2 - Sprint 2 payment/wallet tests. Needs a MongoDB replica set (Atlas is one) because the services use
// transactions. The test creates and drops its own database, so real data is untouched:
//   TEST_MONGO_URI="<uri>" node --test server/test/sprint2/member2.test.js
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'member2-test-secret';
const mongoose = require('mongoose');
const app = require('../../src/app');
const User = require('../../src/models/User');
const Item = require('../../src/models/Item');
const Reservation = require('../../src/models/Reservation');
const WalletTransaction = require('../../src/models/WalletTransaction');
const AuditLog = require('../../src/models/AuditLog');
const PaymentOperation = require('../../src/models/PaymentOperation');
const payment = require('../../src/services/payments/payment');
const wallet = require('../../src/services/payments/wallet');
const { COOKIE_NAME, signToken } = require('../../src/utils/tokens');
const { Category, CheckoutAttempt, ReservationHold } = require('../../src/models');

let server, base;
const cookieFor = (user) => `${COOKIE_NAME}=${signToken(user._id)}`;
async function send(method, path, user, body) {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: { ...(user && { Cookie: cookieFor(user) }), ...(body && { 'Content-Type': 'application/json' }) },
    ...(body && { body: JSON.stringify(body) }),
  });
  return { status: response.status, data: await response.json() };
}
const get = (path, user) => send('GET', path, user);

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
  server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
beforeEach(async () => {
  await Promise.all([User, Item, Category, Reservation, CheckoutAttempt, ReservationHold, WalletTransaction, AuditLog, PaymentOperation]
    .map((model) => model.deleteMany({})));
});

/** A returned reservation of an item called `title` (test data; real ones come from M1's checkout). */
async function makeReservation(borrower, title = 'Cordless drill') {
  const lender = await makeUser(0);
  const item = await Item.create({ owner: lender._id, title, category: new mongoose.Types.ObjectId(), description: 'Test item', depositAmount: 200 });
  return Reservation.create({
    item: item._id, borrower: borrower._id, lender: lender._id,
    startDate: new Date('2026-11-01'), endDate: new Date('2026-11-05'), returnedAt: new Date('2026-11-07'), status: 'completed',
  });
}

/** Stand-in for a late fee as step 6 (applyLateFee) will store it. */
const insertLateFee = (user, reservation, { lateFeeMinor, chargedMinor, daysLate }) => PaymentOperation.create({
  idempotencyKey: `late-fee:${reservation._id}`, kind: 'late_fee', purpose: 'late_fee', user: user._id,
  reference: { type: 'reservation', id: reservation._id }, amountMinor: lateFeeMinor, requestHash: 'test',
  status: 'succeeded', result: { lateFeeMinor, chargedMinor, daysLate }, outstandingMinor: lateFeeMinor - chargedMinor, completedAt: new Date(),
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

test('insufficient funds are rejected (409) and nothing is written', async () => {
  const user = await makeUser(10);
  await assert.rejects(
    payment.charge({ userId: user._id, amountMinor: 1001, purpose: 'deposit', reference: reservationRef(), idempotencyKey: 'deposit:poor' }),
    (err) => err.status === 409 && /Insufficient/.test(err.message)
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

// ---------------------------------------------------------------- Step 2: ledger + late fees (Req 36/78)

test('GET /api/wallet-ledger: own rows only, newest first, paginated, filterable by type', async () => {
  const me = await makeUser(0);
  const someoneElse = await makeUser(0);
  for (let i = 1; i <= 3; i += 1) {
    await payment.creditReferral({ userId: me._id, amountMinor: 1000 * i, referralId: new mongoose.Types.ObjectId(), idempotencyKey: `ledger:${i}` });
  }
  await payment.charge({ userId: me._id, amountMinor: 500, purpose: 'deposit', reference: reservationRef(), idempotencyKey: 'ledger:charge' });
  await payment.creditReferral({ userId: someoneElse._id, amountMinor: 9999, referralId: new mongoose.Types.ObjectId(), idempotencyKey: 'ledger:other' });

  const page1 = await get('/wallet-ledger?limit=3', me);
  assert.equal(page1.status, 200);
  assert.deepEqual([page1.data.total, page1.data.page, page1.data.pages, page1.data.items.length], [4, 1, 2, 3]);
  assert.deepEqual(page1.data.items.map((t) => t.amountMinor), [-500, 3000, 2000]); // newest first
  assert.equal(page1.data.items[0].balanceAfterMinor, 5500);
  assert.ok(page1.data.items.every((t) => t.amountMinor !== 9999), "another user's rows never appear");

  const deposits = await get('/wallet-ledger?type=deposit_hold', me);
  assert.deepEqual(deposits.data.items.map((t) => t.type), ['deposit_hold']);
  assert.equal((await get('/wallet-ledger?type=bogus', me)).status, 400);
});

test('GET /api/payments/late-fees: own late fees with item, days late and what is still owed', async () => {
  const me = await makeUser(0);
  const someoneElse = await makeUser(0);
  await insertLateFee(me, await makeReservation(me, 'Cordless drill'), { lateFeeMinor: 4000, chargedMinor: 4000, daysLate: 2 });
  await insertLateFee(me, await makeReservation(me, 'Ladder'), { lateFeeMinor: 6000, chargedMinor: 2500, daysLate: 3 });
  await insertLateFee(someoneElse, await makeReservation(someoneElse, 'Tent'), { lateFeeMinor: 1000, chargedMinor: 0, daysLate: 1 });

  const { status, data } = await get('/payments/late-fees', me);
  assert.equal(status, 200);
  assert.equal(data.total, 2);
  assert.deepEqual(data.items.map((f) => f.itemTitle).sort(), ['Cordless drill', 'Ladder']);
  const ladder = data.items.find((f) => f.itemTitle === 'Ladder');
  assert.deepEqual([ladder.daysLate, ladder.lateFeeMinor, ladder.chargedMinor, ladder.outstandingMinor], [3, 6000, 2500, 3500]);
  assert.equal(data.outstandingTotalMinor, 3500);
});

test('GET /api/account/wallet: balance in EGP and piastres plus late fees still owed', async () => {
  const me = await makeUser(12.5);
  await insertLateFee(me, await makeReservation(me), { lateFeeMinor: 3000, chargedMinor: 1250, daysLate: 2 });
  const { status, data } = await get('/account/wallet', me);
  assert.equal(status, 200);
  assert.deepEqual(data, { balance: 12.5, balanceMinor: 1250, currency: 'EGP', outstandingLateFeesMinor: 1750 });
});

test('wallet, ledger and late-fee endpoints: guests get 401, admins get 403', async () => {
  const admin = await User.create({ username: 'm2_admin', name: 'Admin', role: 'admin', passwordHash: 'not-used' });
  for (const path of ['/wallet-ledger', '/payments/late-fees', '/account/wallet']) {
    assert.equal((await get(path)).status, 401, `${path} guest`);
    assert.equal((await get(path, admin)).status, 403, `${path} admin`);
  }
});

// ---------------------------------------------------------------- Step 3: wallet checkout (Req 50) + policy

const cartLines = (amounts) => amounts.map((amountMinor, i) => ({
  reservationId: new mongoose.Types.ObjectId(), itemId: new mongoose.Types.ObjectId(), title: `Item ${i + 1}`,
  amountMinor, deposit: { base: amountMinor / 100, categoryMultiplier: 1, tierDiscountPercent: 0, amount: amountMinor / 100 },
  fulfilment: { method: 'pickup', deliveryFee: 0 },
}));

test('chargeWalletCheckout: one idempotent debit for the cart, one ledger + audit row per reservation', async () => {
  const borrower = await makeUser(500);
  const attemptId = new mongoose.Types.ObjectId();
  const lines = cartLines([15000, 7550]);
  const input = { attemptId, borrowerId: borrower._id, idempotencyKey: `checkout:${attemptId}`, amountMinor: 22550, currency: 'EGP', lines };

  const first = await payment.chargeWalletCheckout(input);
  const retry = await payment.chargeWalletCheckout(input);
  assert.equal(first.chargedMinor, 22550);
  assert.equal(retry.replayed, true);
  assert.equal(await balanceOf(borrower), 50000 - 22550);

  const ledger = await WalletTransaction.find({ user: borrower._id }).sort({ createdAt: 1 });
  assert.deepEqual(ledger.map((t) => [String(t.reservation), t.amountMinor, t.type]),
    lines.map((l) => [String(l.reservationId), -l.amountMinor, 'deposit_hold']));
  const audits = await AuditLog.find({ action: 'deposit_charged' });
  assert.equal(audits.length, 2);
  assert.ok(audits.every((a) => a.inputs.method === 'wallet' && String(a.inputs.checkoutAttemptId) === String(attemptId)));
});

test('chargeWalletCheckout refuses a total that does not match its lines', async () => {
  const borrower = await makeUser(500);
  const attemptId = new mongoose.Types.ObjectId();
  await assert.rejects(payment.chargeWalletCheckout({
    attemptId, borrowerId: borrower._id, idempotencyKey: `checkout:${attemptId}`, amountMinor: 100, currency: 'EGP', lines: cartLines([15000]),
  }), (err) => err.status === 400);
  assert.equal(await balanceOf(borrower), 50000);
});

// End-to-end with Member 1's REAL checkout (it loads this payment module automatically).
async function bookableItem(depositAmount) {
  const lender = await User.create({
    username: `m2_lender_${Date.now()}`, name: 'Lender', email: `lender${Date.now()}@example.com`, phone: `+2011${Date.now() % 1e8}`,
    address: { street: '2 Test St', city: 'Cairo' }, passwordHash: 'not-used', lenderStatus: 'verified',
  });
  const category = await Category.create({ name: `Tools ${Date.now()}`, slug: `tools-${Date.now()}`, depositMultiplier: 1.5 });
  return Item.create({ owner: lender._id, title: 'Pressure washer', category: category._id, description: 'Test', depositAmount });
}
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

test('Req 50: checkout with method "wallet" debits the wallet once and creates the reservation', async () => {
  const borrower = await makeUser(200); // EGP 200
  const item = await bookableItem(100); // deposit 100 x multiplier 1.5 = EGP 150
  const selection = { source: 'single', itemId: String(item._id), startDate: day(3), endDate: day(5) };

  const quote = await send('POST', '/checkout/quote', borrower, selection);
  assert.equal(quote.status, 200, JSON.stringify(quote.data));
  assert.equal(quote.data.quote.amountMinor, 15000);
  assert.ok(quote.data.quote.paymentMethods.includes('wallet'), 'wallet is offered now that Member 2 is present');

  const body = { ...selection, method: 'wallet', operationKey: 'm2-wallet-checkout-0001', quoteHash: quote.data.quote.quoteHash };
  const first = await send('POST', '/checkout', borrower, body);
  const retry = await send('POST', '/checkout', borrower, body); // e.g. the user double-clicked
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.deepEqual(retry.data.checkout.reservationIds, first.data.checkout.reservationIds);

  const [reservationId] = first.data.checkout.reservationIds;
  const reservation = await Reservation.findById(reservationId);
  assert.deepEqual([reservation.payment.method, reservation.deposit.status, reservation.deposit.amount], ['wallet', 'held', 150]);
  assert.equal(await balanceOf(borrower), 5000); // 200 - 150, charged exactly once
  const ledger = await WalletTransaction.find({ user: borrower._id });
  assert.equal(ledger.length, 1);
  assert.equal(String(ledger[0].reservation), reservationId);
  assert.equal(String((await AuditLog.findOne({ action: 'deposit_charged' })).reservation), reservationId);
});

test('Req 50: wallet checkout with too little balance is refused and books nothing', async () => {
  const borrower = await makeUser(100); // EGP 100 < EGP 150
  const item = await bookableItem(100);
  const selection = { source: 'single', itemId: String(item._id), startDate: day(3), endDate: day(5) };
  const quote = await send('POST', '/checkout/quote', borrower, selection);
  const result = await send('POST', '/checkout', borrower, {
    ...selection, method: 'wallet', operationKey: 'm2-wallet-checkout-0002', quoteHash: quote.data.quote.quoteHash,
  });
  assert.equal(result.status, 409);
  assert.match(result.data.message, /Insufficient wallet balance/);
  assert.equal(await Reservation.countDocuments({ item: item._id }), 0);
  assert.equal(await balanceOf(borrower), 10000);
  assert.equal(await PaymentOperation.countDocuments({}), 0);
});

test('GET /api/payments/policy is public and shows the refund and late-fee rules', async () => {
  const { status, data } = await get('/payments/policy');
  assert.equal(status, 200);
  assert.equal(data.policy.currency, 'EGP');
  assert.equal(data.policy.cancellation.freeCancellationHours, 48);
  assert.equal(data.policy.cancellation.partialRefundPercent, 50);
  assert.deepEqual(data.policy.lateFee, { graceMinutes: 60, percentOfDepositPerDay: 10, capPercentOfDeposit: 100 });
});

// ---------------------------------------------------------------- Step 4 (plan step C): refunds (Req 52, 81)
const { cancel } = require('../../src/services/reservations/cancellation');
const commands = require('../../src/services/reservations/reservationCommands');
const { quoteCancellationRefund } = require('../../src/services/payments/refund');

/** A paid reservation as M1's checkout leaves it (deposit held). Dates are UTC midnights like M1 stores them. */
async function paidReservation({ borrower, status = 'confirmed', startIn = 5, days = 2, deposit = 150, deliveryFee = 0, method = 'wallet' }) {
  const item = await bookableItem(100);
  return Reservation.create({
    item: item._id, borrower: borrower._id, lender: item.owner, status,
    startDate: new Date(day(startIn)), endDate: new Date(day(startIn + days)),
    deposit: { amount: deposit, status: 'held' },
    fulfilment: { method: deliveryFee ? 'delivery' : 'pickup', deliveryFee, ...(deliveryFee && { deliveryAddress: '1 Test St' }) },
    payment: { method },
  });
}

test('Req 81: the refund rate depends on how long before pickup the borrower cancels', () => {
  const pickupDate = new Date('2026-12-10T00:00:00Z');
  const at = (hoursBefore) => new Date(pickupDate - hoursBefore * 3600000);
  assert.deepEqual(quoteCancellationRefund({ amountMinor: 15000, cancelledAt: at(72), pickupDate }).refundMinor, 15000);
  assert.deepEqual(quoteCancellationRefund({ amountMinor: 15000, cancelledAt: at(48), pickupDate }).refundMinor, 15000); // exactly 48 h = free
  const late = quoteCancellationRefund({ amountMinor: 15001, cancelledAt: at(47.9), pickupDate });
  assert.deepEqual([late.rule, late.ratePercent, late.refundMinor, late.forfeitedMinor], ['late_cancellation', 50, 7501, 7500]);
  assert.equal(quoteCancellationRefund({ amountMinor: 15000, cancelledAt: at(0), pickupDate }).refundMinor, 0);
});

test('Req 52: cancelling a CARD-paid reservation early credits the full deposit to the wallet, once', async () => {
  const borrower = await makeUser(0);
  const reservation = await paidReservation({ borrower, method: 'card', startIn: 5 });

  await cancel({ actorId: borrower._id, reservationId: reservation._id }); // Member 1's real cancel command
  await cancel({ actorId: borrower._id, reservationId: reservation._id }); // retry: must not pay twice

  assert.equal(await balanceOf(borrower), 15000);
  const saved = await Reservation.findById(reservation._id);
  assert.deepEqual([saved.status, saved.deposit.status, saved.cancellation.refundAmount], ['cancelled', 'refunded', 150]);
  const ledger = await WalletTransaction.find({ user: borrower._id });
  assert.deepEqual(ledger.map((t) => [t.type, t.amountMinor]), [['refund', 15000]]);
  const auditRow = await AuditLog.findOne({ action: 'cancellation_refunded' });
  assert.equal(String(auditRow.reservation), String(reservation._id));
  assert.deepEqual([auditRow.inputs.heldMinor, auditRow.inputs.freeCancellationHours, auditRow.result.rule], [15000, 48, 'free_cancellation']);
});

test('Req 81: a late cancellation refunds 50 % to the borrower and pays the rest to the lender', async () => {
  const borrower = await makeUser(0);
  const reservation = await paidReservation({ borrower, startIn: 1 }); // pickup tomorrow -> less than 48 h away
  await cancel({ actorId: borrower._id, reservationId: reservation._id });

  assert.equal(await balanceOf(borrower), 7500);
  assert.equal(await balanceOf({ _id: reservation.lender }), 7500);
  const saved = await Reservation.findById(reservation._id);
  assert.deepEqual([saved.deposit.status, saved.deposit.forfeited, saved.cancellation.refundAmount], ['partially_forfeited', 75, 75]);
  const lenderRow = await WalletTransaction.findOne({ user: reservation.lender });
  assert.deepEqual([lenderRow.type, lenderRow.amountMinor], ['lender_payout', 7500]);
});

test('wallet checkout then cancellation gives the money back (full round trip over HTTP)', async () => {
  const borrower = await makeUser(200);
  const item = await bookableItem(100);
  const selection = { source: 'single', itemId: String(item._id), startDate: day(5), endDate: day(7) };
  const quote = await send('POST', '/checkout/quote', borrower, selection);
  const paid = await send('POST', '/checkout', borrower, { ...selection, method: 'wallet', operationKey: 'm2-roundtrip-checkout-1', quoteHash: quote.data.quote.quoteHash });
  assert.equal(await balanceOf(borrower), 5000);

  const cancelled = await send('POST', `/reservations/${paid.data.checkout.reservationIds[0]}/cancel`, borrower, { reason: 'Plans changed' });
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.data));
  assert.equal(await balanceOf(borrower), 20000);
});

test('lender rejection refunds the deposit AND the delivery fee in full', async () => {
  const borrower = await makeUser(0);
  const reservation = await paidReservation({ borrower, status: 'pending', deposit: 150, deliveryFee: 30 });
  await commands.transition({ actorId: reservation.lender, reservationId: reservation._id, action: 'reject', reason: 'Not available' });

  assert.equal(await balanceOf(borrower), 18000);
  const saved = await Reservation.findById(reservation._id);
  assert.deepEqual([saved.status, saved.deposit.status], ['rejected', 'refunded']);
  const auditRow = await AuditLog.findOne({ action: 'rejection_refunded' });
  assert.deepEqual([auditRow.inputs.depositMinor, auditRow.inputs.deliveryMinor], [15000, 3000]);
});

test('good-condition return releases the deposit to the wallet exactly once', async () => {
  const borrower = await makeUser(0);
  const reservation = await paidReservation({ borrower, status: 'active', startIn: -1, days: 4 }); // due in 3 days -> not late
  await commands.transition({ actorId: reservation.lender, reservationId: reservation._id, action: 'return' });
  await commands.transition({ actorId: reservation.lender, reservationId: reservation._id, action: 'return' }); // retry

  assert.equal(await balanceOf(borrower), 15000);
  assert.equal((await Reservation.findById(reservation._id)).deposit.status, 'released');
  assert.equal(await WalletTransaction.countDocuments({ user: borrower._id, type: 'deposit_release' }), 1);
  assert.equal(await AuditLog.countDocuments({ action: 'deposit_released' }), 1);
});

test('refund functions reject inconsistent input before moving money', async () => {
  const borrower = await makeUser(0);
  const reservationId = new mongoose.Types.ObjectId();
  await assert.rejects(payment.refundToWallet({ reservationId, userId: borrower._id, currency: 'EGP', idempotencyKey: 'bad:1', amountMinor: 100, depositMinor: 60, deliveryMinor: 30 }), (e) => e.status === 400);
  await assert.rejects(payment.settleCancellation({ reservationId, borrowerId: borrower._id, amountMinor: 100, currency: 'EGP', cancelledAt: 'nope', pickupDate: new Date(), idempotencyKey: 'bad:2' }), (e) => e.status === 400);
  assert.equal(await balanceOf(borrower), 0);
});

// ---------------------------------------------------------------- Step 5 (plan step D): late fees (Req 77)
const { calculateLateFee } = require('../../src/services/payments/lateFee');

test('Req 77: late fee = 10 % of the deposit per started day late, after a 1-hour grace, capped at the deposit', () => {
  const endDate = new Date('2026-12-10T00:00:00Z');
  const back = (minutes) => new Date(+endDate + minutes * 60000);
  const fee = (minutes, depositMinor = 15000) => calculateLateFee({ depositMinor, endDate, returnedAt: back(minutes) });
  assert.deepEqual([fee(0).feeMinor, fee(60).feeMinor], [0, 0]); // on time / inside the grace period
  assert.deepEqual([fee(61).daysLate, fee(61).feeMinor], [1, 1500]); // 1 started day
  assert.deepEqual([fee(24 * 60 + 1).daysLate, fee(24 * 60 + 1).feeMinor], [2, 3000]); // just over 1 day -> 2 days
  const veryLate = fee(15 * 24 * 60); // 15 days = 150 % -> capped at 100 %
  assert.deepEqual([veryLate.feeMinor, veryLate.capped], [15000, true]);
  assert.equal(fee(5 * 24 * 60, 0).feeMinor, 0); // no deposit -> no fee
});

test('Req 77: a late return through the real return command releases the deposit, then charges the late fee once', async () => {
  const borrower = await makeUser(0);
  // Due 2 days ago (UTC midnight) -> returned now = 2 or 3 started days late depending on the time of day.
  const reservation = await paidReservation({ borrower, status: 'active', startIn: -4, days: 2 });
  await commands.transition({ actorId: reservation.lender, reservationId: reservation._id, action: 'return' });
  await commands.transition({ actorId: reservation.lender, reservationId: reservation._id, action: 'return' }); // retry

  const saved = await Reservation.findById(reservation._id);
  const expected = calculateLateFee({ depositMinor: 15000, endDate: saved.endDate, returnedAt: saved.returnedAt });
  assert.ok(expected.feeMinor > 0);
  assert.equal(Math.round(saved.lateFee * 100), expected.feeMinor); // M1 stored our fee on the reservation
  assert.equal(await balanceOf(borrower), 15000 - expected.feeMinor); // deposit back, minus the fee
  assert.equal(await balanceOf({ _id: reservation.lender }), expected.feeMinor); // fee paid to the lender
  assert.equal(await WalletTransaction.countDocuments({ user: borrower._id, type: 'late_fee' }), 1);

  const auditRow = await AuditLog.findOne({ action: 'late_fee_applied' });
  assert.equal(String(auditRow.reservation), String(reservation._id));
  assert.deepEqual([auditRow.inputs.depositMinor, auditRow.inputs.percentOfDepositPerDay, auditRow.result.daysLate], [15000, 10, expected.daysLate]);
});

test('Req 77: a low wallet is never skipped - the rest stays owed and is collected from the next credit', async () => {
  const borrower = await makeUser(20); // only EGP 20 available
  const reservation = await paidReservation({ borrower, status: 'completed', startIn: -10, days: 3 });
  const endDate = reservation.endDate;
  const returnedAt = new Date(+endDate + 3 * 86400000); // exactly 3 days late -> 30 % of EGP 150 = EGP 45
  const input = { reservationId: reservation._id, userId: borrower._id, currency: 'EGP', idempotencyKey: `reservation:${reservation._id}:late-fee`, endDate, returnedAt };

  const result = await payment.applyLateFee(input);
  assert.deepEqual([result.feeMinor, result.chargedMinor, result.outstandingMinor], [4500, 2000, 2500]);
  assert.equal(await balanceOf(borrower), 0); // never negative
  assert.equal((await payment.applyLateFee(input)).replayed, true); // retry: no second charge
  assert.equal((await get('/account/wallet', borrower)).data.outstandingLateFeesMinor, 2500);

  // Next money in: EGP 100 refund/reward -> EGP 25 owed is taken automatically.
  await payment.creditReferral({ userId: borrower._id, amountMinor: 10000, referralId: new mongoose.Types.ObjectId(), idempotencyKey: 'ref:after-late-fee' });
  assert.equal(await balanceOf(borrower), 7500);
  assert.equal(await balanceOf({ _id: reservation.lender }), 4500); // lender received the whole fee in two parts

  const fees = await get('/payments/late-fees', borrower);
  assert.equal(fees.data.outstandingTotalMinor, 0);
  assert.deepEqual([fees.data.items[0].lateFeeMinor, fees.data.items[0].chargedMinor, fees.data.items[0].outstandingMinor], [4500, 4500, 0]);
  assert.equal(await AuditLog.countDocuments({ action: 'late_fee_collected' }), 1);
});

test('Req 77: returning within the grace period costs nothing but is still audited', async () => {
  const borrower = await makeUser(50);
  const reservation = await paidReservation({ borrower, status: 'completed', startIn: -10, days: 3 });
  const result = await payment.applyLateFee({
    reservationId: reservation._id, userId: borrower._id, currency: 'EGP', idempotencyKey: 'grace',
    endDate: reservation.endDate, returnedAt: new Date(+reservation.endDate + 30 * 60000),
  });
  assert.equal(result.feeMinor, 0);
  assert.equal(await balanceOf(borrower), 5000);
  assert.equal((await AuditLog.findOne({ action: 'late_fee_applied' })).result.feeMinor, 0);
  assert.equal((await get('/payments/late-fees', borrower)).data.total, 0); // zero fees are not listed
});
