/**
 * Member 7 tests (Node's built-in runner; run from /server with `npm run test:sprint2`):
 *   - unit tests: always run, no database needed
 *   - integration tests (availability, date filter, alternatives, waitlist promotion with M1's real holds):
 *       need TEST_MONGO_URI = a disposable replica set (same convention as member1.test.js); skipped otherwise
 *   - NFR 2 performance proof (5,000 items, < 2 s): opt-in with RUN_PERF=1 (+ TEST_MONGO_URI, or MONGO_URI from .env).
 *       Uses its OWN throw-away database and drops it afterwards - never the team's data.
 */
process.env.WAITLIST_SWEEPER = 'off'; // never start the background sweeper from tests
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDay, parseRange, rangesOverlap } = require('../../src/services/catalog/availabilityBridge');
const { rankAlternatives } = require('../../src/services/catalog/alternatives');
const { sortCandidates } = require('../../src/services/waitlists/waitlist');

const day = (s) => new Date(`${s}T00:00:00.000Z`);

test('parseDay accepts real dates only', () => {
  assert.ok(parseDay('2027-03-01'));
  assert.equal(parseDay('2027-02-31'), null);
  assert.equal(parseDay('01/03/2027'), null);
  assert.equal(parseDay(undefined), null);
});

test('parseRange validates order, past dates and length', () => {
  assert.ok(parseRange('2030-01-01', '2030-01-05').range);
  assert.match(parseRange('2030-01-05', '2030-01-05').error, /after/);
  assert.match(parseRange('2020-01-01', '2020-01-05').error, /past/);
  assert.ok(parseRange('2020-01-01', '2020-01-05', { allowPast: true }).range);
  assert.match(parseRange('2030-01-01', '2031-06-01').error, /longer than/);
});

test('ranges are half-open: back-to-back bookings do not overlap', () => {
  const a = { start: day('2030-01-01'), end: day('2030-01-05') };
  assert.equal(rangesOverlap(a, { start: day('2030-01-05'), end: day('2030-01-08') }), false);
  assert.equal(rangesOverlap(a, { start: day('2030-01-04'), end: day('2030-01-08') }), true);
  assert.equal(rangesOverlap(a, { start: day('2029-12-30'), end: day('2030-01-02') }), true);
});

test('alternatives rank shared tags first, then closer deposit, then newest', () => {
  const source = { tags: ['cordless', 'drill'], depositAmount: 400 };
  const mk = (id, tags, depositAmount, createdAt) => ({ _id: id, tags, depositAmount, createdAt });
  const out = rankAlternatives(source, [
    mk('far', [], 400, '2026-01-01'),
    mk('both', ['cordless', 'drill'], 900, '2026-01-01'),
    mk('one', ['drill'], 400, '2026-01-01'),
  ]);
  assert.deepEqual(out.map((x) => x._id), ['both', 'one', 'far']);
});

test('waitlist order: higher tier first, FIFO inside a tier', () => {
  const list = [
    { id: 'basic-early', priority: 3, createdAt: '2026-01-01' },
    { id: 'premium-late', priority: 1, createdAt: '2026-01-03' },
    { id: 'plus', priority: 2, createdAt: '2026-01-02' },
    { id: 'basic-late', priority: 3, createdAt: '2026-01-04' },
  ];
  assert.deepEqual(sortCandidates(list).map((x) => x.id), ['premium-late', 'plus', 'basic-early', 'basic-late']);
});

test('NFR 2: catalog search/filter under 2 s on 5,000 items', { skip: process.env.RUN_PERF !== '1', timeout: 300000 }, async (t) => {
  const mongoose = require('mongoose');
  const env = require('../../src/config/env');
  const DB = 'shareshed_perf_m7';
  await mongoose.connect(process.env.TEST_MONGO_URI || env.MONGO_URI, { dbName: DB });
  const { Item, Category, Reservation } = require('../../src/models');
  const app = require('../../src/app');
  const server = app.listen(0);
  t.after(async () => {
    server.close();
    if (mongoose.connection.name === DB) await mongoose.connection.dropDatabase(); // only ever the throw-away DB
    await mongoose.disconnect();
  });
  if (mongoose.connection.name !== DB) throw new Error('Refusing to run: not connected to the perf database');

  await Promise.all([Item.init(), Reservation.init()]);
  const cats = await Category.insertMany(Array.from({ length: 12 }, (_, i) => ({ name: `Cat ${i}`, slug: `cat-${i}` })));
  const owner = new mongoose.Types.ObjectId();
  const words = ['drill', 'saw', 'ladder', 'tent', 'washer', 'trimmer', 'wrench', 'sander'];
  const items = await Item.insertMany(Array.from({ length: 5000 }, (_, i) => ({
    owner, title: `${words[i % words.length]} model ${i}`, description: 'perf item',
    category: cats[i % cats.length]._id, depositAmount: 50 + (i % 500), photos: [{ url: '/uploads/placeholder.svg' }],
    tags: [words[i % words.length], `grade-${i % 5}`],
  })));
  const base = Date.now();
  const reservations = Array.from({ length: 3000 }, (_, i) => {
    const start = new Date(base + (i % 100) * 86400000);
    return {
      item: items[(i * 7) % items.length]._id, borrower: owner, lender: owner,
      startDate: start, endDate: new Date(start.getTime() + (1 + (i % 7)) * 86400000), status: ['pending', 'confirmed', 'active'][i % 3],
    };
  });
  await Reservation.insertMany(reservations);

  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const from = iso(base + 5 * 86400000);
  const to = iso(base + 12 * 86400000);
  const url = `http://127.0.0.1:${server.address().port}/api/catalog`;
  const cases = {
    list: '', search: '?q=drill', category: `?category=${cats[0]._id}`,
    dates: `?availableFrom=${from}&availableTo=${to}`,
    combined: `?q=saw&category=${cats[1]._id}&availableFrom=${from}&availableTo=${to}&sort=deposit-asc`,
  };
  const results = {};
  for (const [name, qs] of Object.entries(cases)) {
    const t0 = Date.now();
    const res = await fetch(url + qs);
    const body = await res.json();
    results[name] = Date.now() - t0;
    assert.equal(res.status, 200, `${name}: ${JSON.stringify(body)}`);
    assert.ok(results[name] < 2000, `${name} took ${results[name]} ms`);
  }
  console.table(results);
});


// ------------------------------------------------------------------------------------------------------------
// Integration tests (real MongoDB replica set + Member 1's real availability / holds)
// ------------------------------------------------------------------------------------------------------------
const { describe, before, after } = test;

describe('M7 integration (availability, filter, alternatives, waitlist)', { skip: !process.env.TEST_MONGO_URI }, () => {
  const mongoose = require('mongoose');
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'disposable-member7-integration';
  const { User, Category, Item, Reservation, ReservationHold, WaitlistEntry } = require('../../src/models');
  const app = require('../../src/app');
  const { signToken } = require('../../src/utils/tokens');
  const waitlist = require('../../src/services/waitlists/waitlist');

  let server; let base; let cat; let otherCat; let lender; let b1; let b2; let b3;
  const iso = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const R = { start: iso(10), end: iso(12) };

  async function http(method, path, account, input) {
    const res = await fetch(base + path, {
      method,
      headers: { ...(account && { authorization: 'Bearer ' + signToken(account.id) }), ...(input && { 'content-type': 'application/json' }) },
      ...(input && { body: JSON.stringify(input) }),
    });
    return { status: res.status, body: await res.json() };
  }
  const member = async (username, extra = {}) => User.create({
    username, name: username, email: username + '@test.invalid', phone: '011000000' + String(await User.countDocuments()).padStart(2, '0'),
    address: { street: 'Test St', city: 'Cairo' }, passwordHash: 'fixture-only', role: 'member', ...extra,
  });
  const newItem = (title, extra = {}) => Item.create({
    title, category: cat.id, owner: lender.id, description: 'Test listing', depositAmount: 100, ...extra,
  });
  const book = (item, who, s, e, status = 'confirmed') => Reservation.create({
    item: item.id, borrower: who.id, lender: lender.id, startDate: new Date(s + 'T00:00:00.000Z'), endDate: new Date(e + 'T00:00:00.000Z'), status,
  });

  before(async () => {
    await mongoose.connect(process.env.TEST_MONGO_URI, { dbName: 'member7_test_' + process.pid });
    await Promise.all(Object.values(require('../../src/models')).map((m) => m.init()));
    lender = await member('lender7', { lenderStatus: 'verified' });
    [b1, b2, b3] = [await member('b1'), await member('b2'), await member('b3')];
    cat = await Category.create({ name: 'Tools', slug: 'tools' });
    otherCat = await Category.create({ name: 'Garden', slug: 'garden' });
    server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    base = 'http://127.0.0.1:' + server.address().port;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  test('calendar, date filter and alternatives share one overlap rule', async () => {
    const a = await newItem('Drill A', { tags: ['drill', 'cordless'] });
    const b = await newItem('Drill B', { tags: ['drill'] });
    const c = await newItem('Rake', { category: otherCat.id, tags: ['drill'] });
    await book(a, b1, iso(3), iso(5));

    const cal = await http('GET', `/api/catalog/${a.id}/availability?from=${iso(0)}&to=${iso(30)}`);
    assert.equal(cal.status, 200);
    assert.deepEqual(cal.body.booked, [{ start: iso(3), end: iso(5), type: 'booked' }]);

    const names = async (qs) => (await http('GET', '/api/catalog?' + qs)).body.items.map((i) => i.title).sort();
    assert.deepEqual(await names(`availableFrom=${iso(3)}&availableTo=${iso(5)}`), ['Drill B', 'Rake']);
    assert.ok((await names(`availableFrom=${iso(5)}&availableTo=${iso(7)}`)).includes('Drill A'), 'half-open: free again on the end day');
    assert.equal((await http('GET', '/api/catalog?availableFrom=2020-01-01&availableTo=2020-01-02')).status, 400);

    const alts = await http('GET', `/api/catalog/${a.id}/alternatives?start=${iso(3)}&end=${iso(5)}`);
    assert.deepEqual(alts.body.items.map((i) => i.title), ['Drill B']); // same category only, never the item itself
    await book(b, b2, iso(3), iso(5));
    assert.deepEqual((await http('GET', `/api/catalog/${a.id}/alternatives?start=${iso(3)}&end=${iso(5)}`)).body.items, []);
  });

  test('waitlist: join rules, one winner per range, priority/FIFO, leave passes the offer on, booking fulfils', async () => {
    const w = await newItem('Ladder W');
    const taken = await book(w, b1, R.start, R.end);
    const range = { start: new Date(R.start + 'T00:00:00.000Z'), end: new Date(R.end + 'T00:00:00.000Z') };

    const free = await newItem('Free tool');
    assert.equal((await http('POST', '/api/waitlists', b2, { itemId: free.id, startDate: R.start, endDate: R.end })).status, 409, 'free dates cannot be waitlisted');

    const j2 = await http('POST', '/api/waitlists', b2, { itemId: w.id, startDate: R.start, endDate: R.end });
    const j3 = await http('POST', '/api/waitlists', b3, { itemId: w.id, startDate: R.start, endDate: R.end });
    assert.equal(j2.status, 201); assert.equal(j3.status, 201);
    assert.equal((await http('POST', '/api/waitlists', b2, { itemId: w.id, startDate: R.start, endDate: R.end })).status, 409, 'duplicate');

    await Reservation.updateOne({ _id: taken.id }, { status: 'cancelled' }); // dates freed
    const results = await Promise.all([waitlist.promoteNext(w.id, range, 'a'), waitlist.promoteNext(w.id, range, 'b')]);
    assert.equal(results.flat().length, 1, 'exactly one winner');
    const first = await WaitlistEntry.findById(j2.body.entry._id);
    assert.equal(first.status, 'promoted'); // FIFO inside the same tier
    assert.ok(first.holdId && first.offerExpiresAt > new Date());
    assert.equal((await WaitlistEntry.findById(j3.body.entry._id)).status, 'waiting');

    const guest = await http('GET', `/api/catalog/${w.id}/availability?from=${R.start}&to=${R.end}`);
    assert.equal(guest.body.booked[0].type, 'held');
    assert.deepEqual((await http('GET', `/api/catalog/${w.id}/availability?from=${R.start}&to=${R.end}`, b2)).body.booked, [], 'the offeree sees their own hold as free');

    const left = await http('DELETE', `/api/waitlists/${first.id}`, b2);
    assert.equal(left.status, 200);
    assert.equal(await ReservationHold.countDocuments({ _id: first.holdId }), 0, 'hold released');
    const second = await WaitlistEntry.findById(j3.body.entry._id);
    assert.equal(second.status, 'promoted', 'leaving passes the offer to the next member');
    assert.equal((await http('DELETE', `/api/waitlists/${first.id}`, b2)).status, 404);

    await book(w, b3, R.start, R.end, 'pending'); // the offeree books through checkout
    const mine = await http('GET', `/api/waitlists/mine?item=${w.id}`, b3);
    assert.equal(mine.body.items[0].status, 'fulfilled');
  });
});
