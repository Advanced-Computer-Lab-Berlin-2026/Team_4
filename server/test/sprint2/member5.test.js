// Member 5 (Req 46-48, 53, 54, 56, 59, 60, 74, 75, 106, item tags, archive rule) - main rules, end to end over HTTP.
// Run: TEST_MONGO_URI=<disposable replica set> npm run test:sprint2   (each run uses its own database and drops it)
// Contract: docs/sprint2/member5.md. The full edge-case suites are kept outside the repo by Member 5.
const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'disposable-member5-integration';
const mongoose = require('mongoose');
const app = require('../../src/app');
const { User, Category, Item, Reservation, DamageReport } = require('../../src/models');
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

test('my reservations: status and date filters, only my own', async () => {
  const tent = await item('Tent');
  const up = await booking(tent, 'confirmed', 10, 12);
  await booking(tent, 'completed', -20, -18, { completedAt: day(-18), returnedAt: day(-18) });
  const mine = (q) => request('GET', '/api/reservation-lifecycle/mine' + q, borrower);
  assert.ok((await mine('?status=upcoming')).body.items.some((r) => r._id === up.id));
  assert.equal((await mine('?status=confirmed')).status, 400);
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
