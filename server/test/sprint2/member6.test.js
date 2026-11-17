const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const mongoose = require('mongoose');
const { BorrowList, Item, Reservation } = require('../../src/models');
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

test('delivery tracking scopes reads to participants and delegates status writes', async (t) => {
  const row = {
    _id: reservationId, lender: lenderId, borrower: borrowerId,
    item: { _id: itemId, title: 'Drill' }, status: 'confirmed',
    fulfilment: { method: 'delivery', deliveryStatus: 'none', deliveryAddress: '4 Example Street' },
  };
  t.mock.method(Reservation, 'findOne', (filter) => ({ populate: async () => {
    assert.equal(filter['fulfilment.method'], 'delivery');
    return filter.$or.some(({ borrower: b, lender: l }) => b === row.borrower || l === row.lender) ? row : null;
  } }));
  const advance = t.mock.method(require(commandsPath), 'advanceDelivery', async (input) => {
    assert.deepEqual(input, { reservationId, actorId: lenderId, deliveryStatus: 'out_for_delivery' });
    row.fulfilment.deliveryStatus = input.deliveryStatus;
  });

  const view = await delivery.getTracking(reservationId, borrower);
  assert.equal(view.deliveryStatus, 'preparing');
  assert.equal(view.canUpdate, false);
  await assert.rejects(delivery.getTracking(reservationId, { _id: itemId }), { status: 404 });
  assert.equal((await delivery.setTracking(reservationId, lender, 'out_for_delivery')).deliveryStatus, 'out_for_delivery');
  assert.equal(advance.mock.callCount(), 1);
});

test('HTTP delivery and promo checkout with the shared booking engine', {
  skip: !process.env.TEST_MONGO_URI || !fs.existsSync(commandsPath),
}, async (t) => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'disposable-member6-integration';
  const { User, Category, PromoCode, PromoRedemption, ReservationHold } = require('../../src/models');
  const { signToken } = require('../../src/utils/tokens');
  const { transition } = require(commandsPath);
  const app = require('../../src/app');
  mongoose.set('strictQuery', true);
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
    source: 'single', itemId: item.id, startDate: futureDate(0), endDate: futureDate(2),
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
  const updateStatus = (actor, deliveryStatus) => request('PATCH', reservationUrl, actor, { deliveryStatus });
  assert.equal((await updateStatus(owner, 'out_for_delivery')).status, 409);
  assert.equal((await updateStatus(outsider, 'out_for_delivery')).status, 404);
  await transition({ actorId: owner.id, reservationId: id, action: 'confirm' });
  await assert.rejects(transition({ actorId: owner.id, reservationId: id, action: 'pickup' }), { status: 409 });
  assert.equal((await updateStatus(owner, 'delivered')).status, 409);
  assert.equal((await updateStatus(owner, 'out_for_delivery')).status, 200);
  assert.equal((await updateStatus(owner, 'out_for_delivery')).status, 200);
  assert.equal((await updateStatus(owner, 'delivered')).status, 200);
  assert.equal((await updateStatus(owner, 'delivered')).status, 200);
  const activated = await Reservation.findById(id);
  assert.equal(activated.status, 'active');
  assert(activated.pickedUpAt);
  assert.equal((await transition({ actorId: owner.id, reservationId: id, action: 'return' })).status, 'completed');
  const reservationView = (await request('GET', '/reservations/' + id, member)).body.reservation;
  assert.equal(reservationView.deliveryStatus, 'delivered');
  assert.equal(reservationView.deliveryFee, 0);
  assert.equal(reservationView.deliveryAddress, undefined);
  const deliveries = (await request('GET', '/delivery/reservations', member)).body.items;
  assert.equal(deliveries[0].deliveryAddress, undefined);
  const tracked = (await request('GET', reservationUrl, member)).body.reservation;
  assert.equal(tracked.deliveryStatus, 'delivered');
  assert.equal(tracked.deliveryAddress, selection.fulfilment.deliveryAddress);

  const usage = await request('GET', '/promo-codes/usage', admin);
  assert.equal(usage.status, 200);
  assert.equal(usage.body.items[0].discountApplied, 60);
  assert.equal(usage.body.items[0].reservationId, id);

  const pickup = await Item.create({
    owner: owner.id, title: 'Pickup ladder', category: category.id, depositAmount: 40, description: 'Pickup only',
  });
  const cart = await BorrowList.create({ user: member.id, entries: [item, pickup].map((line) => ({
    item: line.id, startDate: futureDate(6), endDate: futureDate(8),
  })) });
  const mixed = { source: 'borrowList', fulfilmentByEntry: {
    [cart.entries[0].id]: { method: 'delivery', deliveryAddress: '  55 New Street  ' },
  } };
  const quoteCart = (body) => request('POST', '/checkout/quote', member, body);
  assert.equal((await quoteCart({ ...mixed, fulfilmentByEntry: { [item.id]: { method: 'pickup' } } })).status, 409);
  assert.equal((await quoteCart({ ...mixed, fulfilmentByEntry: {
    [cart.entries[1].id]: { method: 'delivery', deliveryAddress: '55 New Street' },
  } })).status, 400);
  assert.equal((await request('PATCH', settingsUrl, owner, { offered: true, fee: 12.25 })).status, 200);
  const paidQuote = (await quoteCart(mixed)).body.quote;
  assert.equal(paidQuote.amountMinor, 13225);
  assert.deepEqual(paidQuote.lines.map((line) => line.entryId), cart.entries.map((line) => line.id));
  assert.equal(paidQuote.lines[0].fulfilment.deliveryFee, 12.25);

  const createPromo = (body) => request('POST', '/promo-codes', admin, { ...promo, ...body });
  assert.equal((await createPromo({ code: 'ONCE', maxRedemptions: 10, onePerMember: true })).status, 201);
  assert.equal((await quoteCart({ ...mixed, promoCode: 'ONCE' })).status, 409);
  assert.equal((await createPromo({ code: 'TWO', maxRedemptions: 2 })).status, 201);
  assert.equal((await request('PATCH', settingsUrl, owner, { offered: true, fee: 0 })).status, 200);
  const options = { ...mixed, promoCode: 'TWO' };
  const mixedQuote = (await quoteCart(options)).body.quote;
  assert.equal(mixedQuote.amountMinor, 0);
  const mixedSubmit = { ...options, quoteHash: mixedQuote.quoteHash, operationKey: randomUUID(), method: 'wallet' };
  const reserved = await request('POST', '/checkout', member, mixedSubmit);
  assert.equal(reserved.status, 200, JSON.stringify(reserved.body));
  assert.deepEqual((await request('POST', '/checkout', member, mixedSubmit)).body, reserved.body);
  const lines = await Promise.all(reserved.body.checkout.reservationIds.map((rid) => Reservation.findById(rid)));
  assert.deepEqual(lines.map((line) => line.fulfilment.method), ['delivery', 'pickup']);
  assert.equal(lines[0].fulfilment.deliveryAddress, '55 New Street');
  assert.equal(lines[0].fulfilment.deliveryStatus, 'preparing');
  assert.equal(lines[1].fulfilment.deliveryAddress, undefined);
  await transition({ actorId: owner.id, reservationId: lines[0].id, action: 'confirm' });
  const futureDelivery = '/delivery/reservations/' + lines[0].id;
  assert.equal((await request('PATCH', futureDelivery, owner, { deliveryStatus: 'out_for_delivery' })).status, 200);
  assert.equal((await request('PATCH', futureDelivery, owner, { deliveryStatus: 'delivered' })).status, 409);
  assert.equal((await BorrowList.findById(cart.id)).entries.length, 0);

  const race = await createPromo({ code: 'LAST', maxRedemptions: 1 });
  const expired = await createPromo({ code: 'EXPIRED', validUntil: futureDate(-1) });
  assert.equal(expired.status, 201);
  const single = (entry, promoCode) => ({
    source: 'single', itemId: entry.id, startDate: futureDate(10), endDate: futureDate(12), promoCode,
  });
  assert.equal((await quoteCart(single(item, 'EXPIRED'))).status, 400);
  const purchases = await Promise.all([[item, member], [pickup, outsider]].map(async ([entry, actor]) => {
    const input = single(entry, 'LAST');
    const preview = await request('POST', '/checkout/quote', actor, input);
    assert.equal(preview.status, 200);
    return [actor, { ...input, method: 'wallet', operationKey: randomUUID(), quoteHash: preview.body.quote.quoteHash }];
  }));
  const results = await Promise.all(purchases.map(([actor, input]) => request('POST', '/checkout', actor, input)));
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  assert.equal(await PromoRedemption.countDocuments({ promoCode: race.body.promoCode._id }), 1);

  const cardPromo = await createPromo({ code: 'CARD20', discountValue: 20 });
  const checkoutService = require('../../src/services/reservations/checkout');
  const { features } = require('../../src/services/sprint2/bootstrap');
  let compensations = 0;
  const cardDeps = { ...features(), payment: {
    startCardPayment: async () => ({ state: 'pending', redirectUrl: 'https://checkout.stripe.com/test' }),
    getCardPayment: async () => ({ state: 'paid', reference: 'pi_member6', amountMinor: 4000, currency: 'EGP' }),
    recordCardCheckout: async (_data, session) => assert(session.inTransaction()),
    refundFailedCheckout: async (input) => {
      assert.equal(input.paymentReference, 'pi_member6');
      compensations++;
    },
  } };
  const cardInput = { ...single(item, 'CARD20'), startDate: futureDate(14), endDate: futureDate(16) };
  const cardQuote = await checkoutService.preview(member.id, cardInput, cardDeps);
  const cardAttempt = await checkoutService.begin(member.id, {
    ...cardInput, method: 'card', quoteHash: cardQuote.quoteHash, operationKey: randomUUID(),
  }, cardDeps);
  assert.equal(cardAttempt.status, 'awaiting_payment');
  await PromoCode.updateOne({ _id: cardPromo.body.promoCode._id }, { $set: { validUntil: new Date(0) } });
  for (let retry = 0; retry < 2; retry++) {
    const settled = await checkoutService.status(member.id, cardAttempt.id, cardDeps);
    assert.equal(settled.status, 'failed');
    assert.deepEqual(settled.reservationIds, []);
  }
  assert.equal(compensations, 1);
  assert.equal(await ReservationHold.countDocuments({ attempt: cardAttempt.id }), 0);
  assert.equal(await PromoRedemption.countDocuments({ promoCode: cardPromo.body.promoCode._id }), 0);
});
