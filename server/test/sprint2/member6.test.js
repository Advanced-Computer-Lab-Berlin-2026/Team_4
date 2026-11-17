const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const mongoose = require('mongoose');
const { Item, Reservation } = require('../../src/models');
const delivery = require('../../src/services/delivery/delivery');

require('./member6/member6.promo')();

const itemId = '67d1cd0b00670bac29520ec9';
const lenderId = '67d1cd0b00670bac29520eca';
const borrowerId = '67d1cd0b00670bac29520ecb';
const reservationId = '67d1cd0b00670bac29520ecc';
const lender = { _id: lenderId, isVerifiedLender: () => true };
const borrower = { _id: borrowerId, isVerifiedLender: () => false };
const commandsPath = path.join(__dirname, '../../src/services/reservations/reservationCommands.js');

test('delivery settings accept free delivery and reject invalid money before writing', async (t) => {
  const write = t.mock.method(Item, 'findOneAndUpdate', (query, update) => ({
    select: () => ({ lean: async () => {
      assert.deepEqual(query, { _id: itemId, owner: lenderId });
      assert.deepEqual(update, { $set: { 'delivery.offered': true, 'delivery.fee': 0 } });
      return { _id: itemId, delivery: { offered: true, fee: 0 } };
    } }),
  }));
  assert.deepEqual(await delivery.setItemSettings(itemId, lender, { offered: true, fee: 0 }), {
    id: itemId, offered: true, fee: 0,
  });
  for (const fee of [NaN, Infinity, -1, '12.3', 0.001]) {
    await assert.rejects(delivery.setItemSettings(itemId, lender, { offered: true, fee }), { status: 400 });
  }
  await assert.rejects(delivery.setItemSettings(itemId, borrower, { offered: true, fee: 2 }), { status: 403 });
  assert.equal(write.mock.callCount(), 1);
});

test('delivery tracking scopes reads to participants and advances only in order', async (t) => {
  const row = {
    _id: reservationId, lender: lenderId, borrower: borrowerId,
    item: { _id: itemId, title: 'Drill' }, status: 'confirmed',
    fulfilment: { method: 'delivery', deliveryStatus: 'none', deliveryAddress: '4 Example Street' },
  };
  t.mock.method(Reservation, 'findOne', (filter) => ({ populate: async () => {
    assert.equal(filter['fulfilment.method'], 'delivery');
    return filter.$or.some(({ borrower: b, lender: l }) => b === row.borrower || l === row.lender) ? row : null;
  } }));
  let actor = lender;
  if (fs.existsSync(commandsPath)) {
    const commands = require(commandsPath);
    t.mock.method(commands, 'withReservation', async (input, work) => {
      assert.equal(input.reservationId, reservationId);
      return work(row, actor, undefined);
    });
  }
  const update = t.mock.method(Reservation, 'updateOne', async (filter, operation) => {
    assert.equal(filter.lender, lenderId);
    assert.equal(filter.status, 'confirmed');
    row.fulfilment.deliveryStatus = operation.$set['fulfilment.deliveryStatus'];
    return { matchedCount: 1 };
  });

  const view = await delivery.getTracking(reservationId, borrower);
  assert.equal(view.deliveryStatus, 'preparing');
  assert.equal(view.canUpdate, false);
  await assert.rejects(delivery.getTracking(reservationId, { _id: itemId }), { status: 404 });
  await assert.rejects(delivery.setTracking(reservationId, lender, 'delivered'), { status: 409 });
  actor = borrower;
  await assert.rejects(delivery.setTracking(reservationId, borrower, 'out_for_delivery'), { status: 403 });
  actor = lender;
  assert.equal((await delivery.setTracking(reservationId, lender, 'out_for_delivery')).deliveryStatus, 'out_for_delivery');
  await delivery.setTracking(reservationId, lender, 'out_for_delivery');
  assert.equal((await delivery.setTracking(reservationId, lender, 'delivered')).deliveryStatus, 'delivered');
  assert.equal(update.mock.callCount(), 2);
});

test('HTTP delivery and promo checkout with the shared booking engine', {
  skip: !process.env.TEST_MONGO_URI || !fs.existsSync(commandsPath),
}, async (t) => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'disposable-member6-integration';
  const { User, Category, PromoRedemption } = require('../../src/models');
  const { signToken } = require('../../src/utils/tokens');
  const { transition } = require(commandsPath);
  const app = require('../../src/app');
  await mongoose.connect(process.env.TEST_MONGO_URI, { dbName: 'member6_test_' + randomUUID().replaceAll('-', '') });
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  await Promise.all(Object.values(require('../../src/models')).map((model) => model.init()));
  server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;

  async function request(method, url, actor, body) {
    const response = await fetch(base + url, {
      method,
      headers: {
        ...(actor && { authorization: `Bearer ${signToken(actor.id)}` }),
        ...(body && { 'content-type': 'application/json' }),
      },
      ...(body && { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  }

  function account(username, n, extra) {
    return User.create({
      username, name: username, email: username + '@test.invalid', phone: '0100000000' + n,
      address: { street: 'Test St', city: 'Cairo' }, passwordHash: 'fixture-only', ...extra,
    });
  }

  const admin = await account('m6admin', 1, { role: 'admin' });
  const owner = await account('m6lender', 2, { lenderStatus: 'verified' });
  const member = await account('m6borrower', 3);
  const outsider = await account('m6outsider', 4, { lenderStatus: 'verified' });
  const category = await Category.create({ name: 'M6 tools', slug: 'm6-tools', depositMultiplier: 1.5 });
  const item = await Item.create({
    owner: owner.id, title: 'Drill', category: category.id, depositAmount: 40, description: 'Test listing',
  });
  const promo = { code: 'FREE60', discountType: 'fixed', discountValue: 60, maxRedemptions: 1 };
  assert.equal((await request('POST', '/promo-codes', member, promo)).status, 403);
  const promotion = await request('POST', '/promo-codes', admin, promo);
  assert.equal(promotion.status, 201);
  const settingsUrl = `/delivery/items/${item.id}`;
  assert.equal((await request('PATCH', settingsUrl, outsider, { offered: true, fee: 0 })).status, 404);
  assert.equal((await request('PATCH', settingsUrl, owner, { offered: true, fee: 0 })).status, 200);

  const futureDate = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  const selection = {
    source: 'single', itemId: item.id, startDate: futureDate(2), endDate: futureDate(4),
    fulfilment: { method: 'delivery', deliveryAddress: '32 Test Street, Cairo' }, promoCode: ' free60 ',
  };
  const bad = await request('POST', '/checkout/quote', member, {
    ...selection, fulfilment: { method: 'delivery', deliveryAddress: ' ' },
  });
  assert.equal(bad.status, 400);
  const quoteResponse = await request('POST', '/checkout/quote', member, selection);
  assert.equal(quoteResponse.status, 200, JSON.stringify(quoteResponse.body));
  const quote = quoteResponse.body.quote;
  assert.equal(quote.amountMinor, 0);
  assert.equal(quote.lines[0].deposit.promoDiscount, 60);
  const submission = { ...selection, quoteHash: quote.quoteHash, operationKey: randomUUID(), method: 'wallet' };
  const checkout = await request('POST', '/checkout', member, submission);
  assert.equal(checkout.status, 200, JSON.stringify(checkout.body));
  assert.equal((await request('POST', '/checkout', member, submission)).status, 200);
  assert.equal(await PromoRedemption.countDocuments(), 1);

  const id = checkout.body.checkout.reservationIds[0];
  const reservationUrl = `/delivery/reservations/${id}`;
  assert.equal((await request('GET', reservationUrl, outsider)).status, 404);
  assert.equal((await request('GET', reservationUrl, member)).body.reservation.deliveryStatus, 'preparing');
  await transition({ actorId: owner.id, reservationId: id, action: 'confirm' });
  assert.equal((await request('PATCH', reservationUrl, owner, { deliveryStatus: 'out_for_delivery' })).status, 200);
  assert.equal((await request('PATCH', reservationUrl, owner, { deliveryStatus: 'delivered' })).status, 200);
  const tracked = (await request('GET', reservationUrl, member)).body.reservation;
  assert.equal(tracked.deliveryStatus, 'delivered');
  assert.equal(tracked.deliveryAddress, selection.fulfilment.deliveryAddress);

  const usage = await request('GET', '/promo-codes/usage', admin);
  assert.equal(usage.status, 200);
  assert.equal(usage.body.items[0].discountApplied, 60);
  assert.equal(usage.body.items[0].reservationId, id);
});
