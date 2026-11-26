// Member 5 (Req 46-48, 53, 54, 56, 59, 60, 74, 75, 106, item tags, archive rule) - main rules, end to end over HTTP.
// Run: TEST_MONGO_URI=<disposable replica set> npm run test:sprint2   (each run uses its own database and drops it)
// Contract: docs/sprint2/member5.md. The full edge-case suites are kept outside the repo by Member 5.
const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'disposable-member5-integration';
const mongoose = require('mongoose');
const app = require('../../src/app');
const { User, Category, Item, Reservation, ReservationHold, BorrowList, DamageReport, MembershipTier } = require('../../src/models');
const { signToken } = require('../../src/utils/tokens');

let server, base, category, lender, borrower, other, admin;
const DAY = 86400000;
const day = (n) => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) + n * DAY);
const ymd = (n) => day(n).toISOString().slice(0, 10);

async function request(method, path, user, input) {
  const response = await fetch(base + path, {
    method,
    headers: { ...(user && { authorization: 'Bearer ' + signToken(user.id) }), ...(input && { 'content-type': 'application/json' }) },
    ...(input && { body: JSON.stringify(input) }),
  });
  return { status: response.status, body: await response.json() };
}

async function user(username, role = 'member', lenderStatus = 'none') {
  return User.create({
    username, role, lenderStatus, name: username, email: username + '@test.invalid',
    phone: '011000000' + String(await User.countDocuments()).padStart(2, '0'),
    address: { street: 'Test St', city: 'Cairo' }, passwordHash: 'fixture-only',
  });
}

const item = (title, fields = {}) => Item.create({ title, category: category.id, owner: lender.id, description: 'Test listing', depositAmount: 0, photos: [{ url: '/uploads/placeholder.svg' }], ...fields });
const booking = (thing, status, s, e, fields = {}) => Reservation.create({
  item: thing.id, borrower: borrower.id, lender: lender.id, status, startDate: day(s), endDate: day(e),
  deposit: { amount: 0, status: 'none' }, ...(status === 'active' && { pickedUpAt: day(s) }), ...fields,
});

before(async () => {
  assert(process.env.TEST_MONGO_URI, 'Set TEST_MONGO_URI to a disposable replica set');
  mongoose.set('strictQuery', true);
  await mongoose.connect(process.env.TEST_MONGO_URI, { dbName: 'member5_test_' + process.pid });
  await Promise.all(Object.values(require('../../src/models')).map((model) => model.init()));
  lender = await user('lender5', 'member', 'verified');
  borrower = await user('borrower5');
  other = await user('other5');
  admin = await user('admin5', 'admin');
  category = await Category.create({ name: 'Tools', slug: 'tools' });
  server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = 'http://127.0.0.1:' + server.address().port;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('item tags: optional, cleaned, at most 10', async () => {
  const drill = await item('Tagged drill');
  const ok = await request('PUT', '/api/items/' + drill.id, lender, { tags: ['  Cordless ', 'cordless', '18V'] });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.deepEqual(ok.body.item.tags, ['cordless', '18v']);
  assert.equal((await request('PUT', '/api/items/' + drill.id, lender, { tags: Array.from({ length: 11 }, (_, i) => 't' + i) })).status, 400);
  assert.equal((await request('PUT', '/api/items/' + drill.id, lender, { tags: ['drill!'] })).status, 400);
});

test('archiving is blocked while an item has open bookings', async () => {
  const saw = await item('Busy saw');
  await booking(saw, 'pending', 3, 5);
  const res = await request('PATCH', '/api/items/' + saw.id + '/archive', lender);
  assert.equal(res.status, 409);
  assert.match(res.body.message, /1 open booking/);
});

test('borrow list: the end date is the return day; limits and refusals', async () => {
  const ladder = await item('Ladder', { rules: { maxBorrowDays: 3, minTrustScore: 0 } });
  const add = (body, who = borrower) => request('POST', '/api/borrow-lists/mine/entries', who, body);
  const ok = await add({ itemId: ladder.id, startDate: ymd(1), endDate: ymd(3) });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.borrowList.entries[0].days, 2); // 1 -> 3 = 2 days, the return day isn't counted
  assert.equal((await add({ itemId: ladder.id, startDate: ymd(1), endDate: ymd(2) })).status, 409); // once per item
  const own = await add({ itemId: ladder.id, startDate: ymd(1), endDate: ymd(2) }, lender);
  assert.equal(own.status, 403);
  const other1 = await item('Other ladder', { rules: { maxBorrowDays: 3, minTrustScore: 0 } });
  for (const [s, e] of [[2, 2], [-1, 1], [1, 5], [366, 367]]) assert.equal((await add({ itemId: other1.id, startDate: ymd(s), endDate: ymd(e) })).status, 400, `${s}->${e}`);
  assert.equal((await add({ itemId: other1.id, startDate: ymd(1), endDate: ymd(2) }, admin)).status, 403);
  const extra = await Item.insertMany(Array.from({ length: 10 }, (_, i) => ({ title: 'Bulk ' + i, category: category.id, owner: lender.id, description: 'x', depositAmount: 0 })));
  const codes = [];
  for (const it of extra) codes.push((await add({ itemId: String(it._id), startDate: ymd(1), endDate: ymd(2) })).status);
  assert.equal(codes.filter((c) => c === 201).length, 9); // 1 + 9 = the limit of 10
  assert.equal(codes.at(-1), 409);
  await Item.updateOne({ _id: ladder.id }, { isArchived: true });
  const list = await request('GET', '/api/borrow-lists/mine', borrower);
  assert.equal(list.body.borrowList.entries.find((e) => e.item._id === ladder.id).problem, 'unavailable');
});

test('borrow-list estimates use the same category and membership pricing as pickup checkout', async () => {
  const plus = await MembershipTier.create({ name: 'Plus', annualFee: 150, depositDiscountPercent: 10, waitlistPriority: 2 });
  const member = await user('checkout_estimate');
  await User.updateOne({ _id: member.id }, {
    $set: { membership: { tier: plus.id, status: 'active', renewsAt: day(30) } },
  });
  const ladders = await Category.create({ name: 'Pricing ladders', slug: 'pricing-ladders', depositMultiplier: 10 });
  const ladder = await item('Pricing ladder', { category: ladders.id, depositAmount: 300 });
  const added = await request('POST', '/api/borrow-lists/mine/entries', member, {
    itemId: ladder.id, startDate: ymd(1), endDate: ymd(3),
  });
  assert.equal(added.status, 201, JSON.stringify(added.body));
  const price = await request('POST', '/api/checkout/quote', member, { source: 'borrowList' });
  assert.equal(price.status, 200, JSON.stringify(price.body));
  assert.equal(price.body.quote.amountMinor, 270000);
  assert.equal(added.body.borrowList.entries[0].estimatedDepositMinor, price.body.quote.amountMinor);
  assert.deepEqual(price.body.quote.membershipDiscount, { tierName: 'Plus', source: 'self' });
});

test('my reservations: status and date filters, only my own', async () => {
  const tent = await item('Tent');
  const up = await booking(tent, 'confirmed', 10, 12);
  await booking(tent, 'completed', -20, -18, { completedAt: day(-18), returnedAt: day(-18) });
  const mine = (q) => request('GET', '/api/reservation-lifecycle/mine' + q, borrower);
  assert.ok((await mine('?status=upcoming')).body.items.some((r) => r._id === up.id));
  assert.equal((await mine('?status=confirmed')).status, 400);
  assert.equal((await mine('?status=constructor')).status, 400);
  assert.equal((await mine('?from=2026-02-30')).status, 400);
  assert.ok((await mine(`?from=${ymd(11)}&to=${ymd(11)}`)).body.items.some((r) => r._id === up.id));
  assert.ok(!(await mine(`?from=${ymd(12)}&to=${ymd(12)}`)).body.items.some((r) => r._id === up.id)); // its return day
  assert.equal((await request('GET', '/api/reservation-lifecycle/' + up.id, other)).status, 404);
  assert.equal((await request('GET', '/api/reservation-lifecycle/' + up.id, lender)).body.reservation.role, 'lender');
});

test('lender: approve, decline with a reason, pickup, good return (Member 1 commands)', async () => {
  const kayak = await item('Kayak');
  const req1 = await booking(kayak, 'pending', 20, 22);
  const req2 = await booking(kayak, 'pending', 30, 32);
  assert.equal((await request('PATCH', `/api/reservation-lifecycle/${req1.id}/approve`, borrower)).status, 403);
  const ap = await request('PATCH', `/api/reservation-lifecycle/${req1.id}/approve`, lender);
  assert.equal(ap.status, 200, JSON.stringify(ap.body));
  assert.equal(ap.body.reservation.status, 'confirmed');
  const rj = await request('PATCH', `/api/reservation-lifecycle/${req2.id}/reject`, lender, { reason: '  Repairs  ' });
  assert.equal(rj.body.reservation.status, 'rejected');
  assert.equal(rj.body.reservation.rejectionReason, 'Repairs');
  assert.equal((await request('PATCH', `/api/reservation-lifecycle/${req1.id}/pickup`, lender)).status, 409); // not started yet
  const now = await booking(kayak, 'confirmed', -1, 3);
  assert.equal((await request('PATCH', `/api/reservation-lifecycle/${now.id}/pickup`, lender)).body.reservation.status, 'active');
  const back = await request('PATCH', `/api/reservation-lifecycle/${now.id}/return`, lender);
  assert.equal(back.body.reservation.status, 'completed');
  assert.equal(back.body.reservation.returnCondition, 'good');
});

test('extensions: request, too long refused, approve moves the return date', async () => {
  const bike = await item('Bike', { rules: { maxBorrowDays: 6, minTrustScore: 0 } });
  const out = await booking(bike, 'active', -1, 3);
  assert.equal((await request('POST', `/api/reservation-lifecycle/${out.id}/extension`, borrower, { requestedEndDate: ymd(9) })).status, 400); // 10 days > 6
  const asked = await request('POST', `/api/reservation-lifecycle/${out.id}/extension`, borrower, { requestedEndDate: ymd(5) });
  assert.equal(asked.status, 201, JSON.stringify(asked.body));
  const { requestId } = asked.body.reservation.extension;
  const ok = await request('PATCH', `/api/reservation-lifecycle/${out.id}/extension/approve`, lender, { requestId });
  assert.equal(ok.body.reservation.endDate, ymd(5));
  assert.equal(ok.body.reservation.extension.status, 'approved');
});

test('lending dashboard: loans, deposits and damage rate', async () => {
  const pump = await item('Pump');
  const done1 = await booking(pump, 'completed', -10, -8, { completedAt: day(-8), deposit: { amount: 100, status: 'released' } });
  await booking(pump, 'completed', -6, -4, { completedAt: day(-4), deposit: { amount: 50, status: 'held' } });
  await booking(pump, 'cancelled', 40, 42, { deposit: { amount: 70, status: 'refunded' } });
  await DamageReport.create({ reservation: done1.id, item: pump.id, reportedBy: lender.id, borrower: borrower.id, description: 'Scratched', status: 'decided', decision: { forfeitAmount: 20, decidedAt: day(-7) } });
  const d = await request('GET', '/api/lending-dashboard', lender);
  assert.equal(d.status, 200);
  const row = d.body.items.find((i) => i.item && i.item.title === 'Pump');
  assert.deepEqual([row.timesLent, row.depositsCollected, row.damageUpheld], [2, 150, 1]); // cancelled not counted
  assert.ok(d.body.damage.rate > 0 && d.body.damage.rate <= 1);
  assert.equal((await request('GET', '/api/lending-dashboard?period=7d', lender)).status, 400);
  assert.equal((await request('GET', '/api/lending-dashboard', borrower)).status, 403);
});

test('edits and removes only the borrower’s entries and can repair a legacy draft', async () => {
  const [drill, saw] = await Promise.all([item('Draft drill'), item('Draft saw')]);
  const root = '/api/borrow-lists/mine';
  const create = async (tool) => request('POST', root + '/entries', other, {
    itemId: tool.id, startDate: ymd(4), endDate: ymd(6),
  });
  assert.equal((await create(drill)).status, 201);
  const added = await create(saw);
  assert.equal(added.status, 201);
  assert.equal(added.body.borrowList.count, 2);
  const entry = added.body.borrowList.entries.find((line) => line.item._id === saw.id);
  const path = root + '/entries/' + entry._id;
  const dates = { startDate: ymd(7), endDate: ymd(10) };
  assert.equal((await request('PATCH', path, borrower, dates)).status, 404);
  assert.equal((await request('DELETE', path, borrower)).status, 404);
  const edited = await request('PATCH', path, other, dates);
  assert.equal(edited.status, 200);
  assert.equal(edited.body.borrowList.entries.find((line) => line._id === entry._id).days, 3);
  assert.equal((await request('DELETE', path, other)).body.borrowList.count, 1);

  const draft = await BorrowList.findOne({ user: other.id });
  await BorrowList.collection.updateOne({ _id: draft._id }, { $unset: { 'entries.0.endDate': 1 } });
  const old = await request('GET', root, other);
  assert.equal(old.status, 200);
  const [legacy] = old.body.borrowList.entries;
  assert.equal(legacy.problem, 'invalid_dates');
  assert.equal(legacy.endDate, null);
  const repaired = await request('PATCH', root + '/entries/' + legacy._id, other, dates);
  assert.equal(repaired.status, 200);
  assert.equal(repaired.body.borrowList.entries[0].problem, null);
});

test('archiving respects active holds and is serialized against checkout', async () => {
  const held = await item('Hold fixture');
  const path = '/api/items/' + held.id + '/archive';
  const hold = await ReservationHold.create({
    item: held.id, borrower: other.id, startDate: day(5), endDate: day(6), expiresAt: new Date(Date.now() + 60000),
  });
  assert.equal((await request('PATCH', path, lender)).status, 409);
  await ReservationHold.updateOne({ _id: hold.id }, { $set: { expiresAt: new Date(0) } });
  assert.equal((await request('PATCH', path, lender)).status, 200);

  const raced = await item('Archive race fixture');
  const selection = { source: 'single', itemId: raced.id, startDate: ymd(8), endDate: ymd(10) };
  const preview = await request('POST', '/api/checkout/quote', other, selection);
  assert.equal(preview.status, 200);
  const [archived, booked] = await Promise.all([
    request('PATCH', '/api/items/' + raced.id.toUpperCase() + '/archive', lender),
    request('POST', '/api/checkout', other, {
      ...selection, method: 'wallet', operationKey: 'member5-archive-race-fixture', quoteHash: preview.body.quote.quoteHash,
    }),
  ]);
  assert.equal([archived, booked].filter((outcome) => outcome.status === 200).length, 1);
  assert.equal((await Item.findById(raced.id)).isArchived, archived.status === 200);
  assert.equal(await Reservation.countDocuments({ item: raced.id }), booked.status === 200 ? 1 : 0);
});

test('delivery details become returnable after delivery handover', async () => {
  const van = await item('Delivery fixture');
  const loan = await booking(van, 'confirmed', 0, 3, { fulfilment: {
    method: 'delivery', deliveryStatus: 'preparing', deliveryFee: 12.5, deliveryAddress: 'Participant address',
  } });
  const path = '/api/reservation-lifecycle/' + loan.id;
  const initial = (await request('GET', path, lender)).body.reservation;
  assert.equal(initial.actions.pickup, false);
  assert.equal(initial.fulfilment.deliveryFee, 12.5);
  assert.equal(initial.fulfilment.deliveryAddress, undefined);
  assert.equal((await request('PATCH', path + '/pickup', lender)).status, 409);
  const deliveryPath = '/api/delivery/reservations/' + loan.id;
  assert.equal((await request('PATCH', deliveryPath, lender, { deliveryStatus: 'out_for_delivery' })).status, 200);
  assert.equal((await request('PATCH', deliveryPath, lender, { deliveryStatus: 'delivered' })).status, 200);
  const active = (await request('GET', path, lender)).body.reservation;
  assert.equal(active.status, 'active');
  assert.equal(active.actions.returnGood, true);
});

test('extensions reject overlapping dates and stale decisions after withdrawal', async () => {
  const desk = await item('Extension overlap fixture');
  const out = await booking(desk, 'active', 0, 2);
  const path = '/api/reservation-lifecycle/' + out.id + '/extension';
  await booking(desk, 'confirmed', 4, 6, { borrower: other.id });
  const ask = (end) => request('POST', path, borrower, { requestedEndDate: ymd(end) });
  assert.equal((await ask(5)).status, 409);
  const first = (await ask(3)).body.reservation.extension.requestId;
  assert.equal((await request('DELETE', path, borrower, { requestId: first })).body.reservation.extension.status, 'cancelled');
  const current = (await ask(4)).body.reservation.extension.requestId;
  assert.equal((await request('PATCH', path + '/approve', lender, { requestId: first })).status, 409);
  const result = await request('PATCH', path + '/reject', lender, { requestId: current });
  assert.equal(result.body.reservation.extension.status, 'rejected');
  assert.equal(result.body.reservation.endDate, ymd(2));
});

test('an existing damage case prevents a good return and preserves the reservation', async () => {
  const wrench = await item('Damage guard fixture');
  const loan = await booking(wrench, 'active', 0, 2);
  await DamageReport.create({
    reservation: loan.id, item: wrench.id, reportedBy: lender.id, borrower: borrower.id, description: 'Open case fixture',
  });
  const path = '/api/reservation-lifecycle/' + loan.id;
  assert.equal((await request('GET', path, lender)).body.reservation.actions.returnGood, false);
  assert.equal((await request('PATCH', path + '/return', lender)).status, 409);
  assert.equal((await Reservation.findById(loan.id)).status, 'active');
});
