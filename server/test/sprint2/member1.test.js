const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { randomUUID } = require('node:crypto');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'disposable-member1-integration';
const mongoose = require('mongoose');
const app = require('../../src/app');
const { User, Category, Item, Reservation, ReservationHold, CheckoutAttempt, BorrowList, MembershipTier, DamageReport } = require('../../src/models');
const checkout = require('../../src/services/reservations/checkout');
const { cancel } = require('../../src/services/reservations/cancellation');
const { features } = require('../../src/services/sprint2/bootstrap');
const commands = require('../../src/services/reservations/reservationCommands');
const { normalizeRange } = require('../../src/services/reservations/availability');
const { signToken } = require('../../src/utils/tokens');

let server, base, category, lender, borrower, other, admin;
const range = {
  startDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
  endDate: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
};

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

async function user(username, role = 'member', lenderStatus = 'none') {
  return User.create({
    username, role, lenderStatus, name: username, email: username + '@test.invalid',
    phone: '010000000' + String(await User.countDocuments()).padStart(2, '0'),
    address: { street: 'Test St', city: 'Cairo' }, passwordHash: 'fixture-only',
  });
}

const item = (title, fields = {}) => Item.create({
  title, category: category.id, owner: lender.id, description: 'Test listing', depositAmount: 0, ...fields,
});
const single = (record, dates = range) => ({ source: 'single', itemId: record.id, ...dates });
const payload = (selection, quote, method = 'wallet') => ({
  ...selection, operationKey: randomUUID(), quoteHash: quote.quoteHash, method,
});

async function httpQuote(selection, account = borrower) {
  const q = await request('POST', '/api/checkout/quote', account, selection);
  assert.equal(q.status, 200, JSON.stringify(q.body));
  return q.body.quote;
}

before(async () => {
  assert(process.env.TEST_MONGO_URI, 'Set TEST_MONGO_URI to a disposable replica set');
  await mongoose.connect(process.env.TEST_MONGO_URI, { dbName: 'member1_test_' + process.pid });
  await Promise.all(Object.values(require('../../src/models')).map((model) => model.init()));
  lender = await user('lender', 'member', 'verified');
  borrower = await user('borrower');
  other = await user('other');
  admin = await user('admin', 'admin');
  category = await Category.create({ name: 'Tools', slug: 'tools', depositMultiplier: 1.5 });
  server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  base = 'http://127.0.0.1:' + server.address().port;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('validates dates and rejects anonymous, admin and self-checkout', async () => {
  assert.throws(() => normalizeRange({ startDate: '2027-02-29', endDate: '2027-03-04' }), { status: 400 });
  const tool = await item('Drill');
  const selection = single(tool);
  assert.equal((await request('POST', '/api/checkout/quote', null, selection)).status, 401);
  assert.equal((await request('POST', '/api/checkout/quote', admin, selection)).status, 403);
  assert.equal((await request('POST', '/api/checkout/quote', lender, selection)).status, 400);
  assert.equal((await request('POST', '/api/checkout/quote', borrower,
    { ...selection, endDate: range.startDate })).status, 400);
  const blocked = await item('Trust rule', { rules: { minTrustScore: 99 } });
  assert.equal((await request('POST', '/api/checkout/quote', borrower, single(blocked))).status, 403);
});

test('overlapping requests from independent clients admit one winner; adjoining dates remain available', async () => {
  const tool = await item('Concurrency drill');
  const selection = single(tool);
  const [a, b] = await Promise.all([httpQuote(selection), httpQuote(selection, other)]);
  const responses = await Promise.all([
    request('POST', '/api/checkout', borrower, payload(selection, a)),
    request('POST', '/api/checkout', other, payload(selection, b)),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  assert.equal(await Reservation.countDocuments({ item: tool.id }), 1);
  const nextDate = new Date(Date.parse(range.endDate) + 86400000).toISOString().slice(0, 10);
  await httpQuote(single(tool, { startDate: range.endDate, endDate: nextDate }));
});

test('cart commits all lines, clears them and returns the same reservations on simultaneous retries', async () => {
  const a = await item('Cart drill');
  const b = await item('Cart driver');
  const draft = await BorrowList.create({
    user: borrower.id, entries: [a, b].map((tool) => ({ item: tool.id, ...range })),
  });
  const selection = { source: 'borrowList' };
  const quote = await httpQuote(selection);
  const input = payload(selection, quote);
  const responses = await Promise.all([
    request('POST', '/api/checkout', borrower, input),
    request('POST', '/api/checkout', borrower, input),
  ]);
  for (const response of responses) assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.deepEqual(responses[0].body, responses[1].body);
  assert.equal(responses[0].body.checkout.reservationIds.length, 2);
  assert.equal((await BorrowList.findById(draft.id)).entries.length, 0);
  assert.equal(await Reservation.countDocuments({ item: { $in: [a.id, b.id] } }), 2);
  assert.equal((await request('POST', '/api/checkout', borrower, { ...input, method: 'card' })).status, 409);
});

test('cart cannot partially check out after another member books one line', async () => {
  const a = await item('Free cart line');
  const b = await item('Lost cart line');
  await BorrowList.updateOne({ user: borrower.id }, { entries: [a, b].map((tool) => ({ item: tool.id, ...range })) });
  const cart = { source: 'borrowList' };
  const quote = await httpQuote(cart);
  const selected = single(b);
  const competing = await httpQuote(selected, other);
  assert.equal((await request('POST', '/api/checkout', other, payload(selected, competing))).status, 200);
  assert.equal((await request('POST', '/api/checkout', borrower, payload(cart, quote))).status, 409);
  assert.equal(await Reservation.countDocuments({ item: a.id }), 0);
  assert.equal((await BorrowList.findOne({ user: borrower.id })).entries.length, 2);
});

test('participants can chat and only borrower can cancel; cancellation frees dates and closes chat', async () => {
  const tool = await item('Chat drill');
  const selection = single(tool);
  const quote = await httpQuote(selection);
  const booking = await request('POST', '/api/checkout', borrower, payload(selection, quote));
  assert.equal(booking.status, 200, JSON.stringify(booking.body));
  const [id] = booking.body.checkout.reservationIds;
  const messages = '/api/reservation-chat/' + id + '/messages';
  const cancelPath = '/api/reservations/' + id + '/cancel';
  assert.equal((await request('GET', messages, other)).status, 404);
  assert.equal((await request('POST', messages, other, { text: 'outsider' })).status, 404);
  assert.equal((await request('POST', messages, borrower, { text: ' ' })).status, 400);
  assert.equal((await request('POST', messages, borrower, { text: 'Pickup at noon?' })).status, 201);
  assert.equal((await request('POST', messages, lender, { text: 'That works' })).status, 201);
  assert.deepEqual((await request('GET', messages, lender)).body.items.map((m) => m.text),
    ['Pickup at noon?', 'That works']);
  assert.equal((await request('POST', cancelPath, lender)).status, 403);
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await request('POST', cancelPath, borrower);
    assert.equal(response.body.reservation.status, 'cancelled');
  }
  assert.equal((await request('GET', messages, lender)).status, 409);
  await httpQuote(selection, other);
});

test('approval of an overlapping extension fails and late cancellation is rejected', async () => {
  const tool = await item('Extension drill');
  const active = await Reservation.create({ item: tool.id, borrower: borrower.id, lender: lender.id, ...range, status: 'active' });
  const adjacentEnd = new Date(Date.parse(range.endDate) + 86400000).toISOString().slice(0, 10);
  await Reservation.create({ item: tool.id, borrower: other.id, lender: lender.id,
    startDate: range.endDate, endDate: adjacentEnd, status: 'confirmed' });
  const requested = await commands.extend({
    actorId: borrower.id, reservationId: active.id, action: 'request', endDate: adjacentEnd,
  });
  await assert.rejects(commands.extend({
    actorId: lender.id, reservationId: active.id, action: 'approve', requestId: requested.extension.requestId,
  }), { status: 409 });
  assert.equal(+(await Reservation.findById(active.id)).endDate, Date.parse(range.endDate));
  const past = await item('Past pickup');
  const pastReservation = await Reservation.create({ item: past.id, borrower: borrower.id, lender: lender.id,
    startDate: new Date(Date.now() - 86400000), endDate: range.endDate });
  assert.equal((await request('POST', '/api/reservations/' + pastReservation.id + '/cancel', borrower)).status, 409);
});

test('only the waitlist offer owner can claim the dates and promotion is atomic', async () => {
  const tool = await item('Waitlist drill');
  const offers = await Promise.allSettled([borrower, other].map((account) => commands.holdForWaitlist({
    borrowerId: account.id, itemId: tool.id, ...range, expiresAt: new Date(Date.now() + 60000),
  })));
  assert.equal(offers.filter((entry) => entry.status === 'fulfilled').length, 1);
  const hold = offers.find((entry) => entry.status === 'fulfilled').value;
  const account = hold.borrower.equals(borrower._id) ? borrower : other;
  const outsider = account === borrower ? other : borrower;
  const selection = { ...single(tool), holdId: hold.id };
  assert.equal((await request('POST', '/api/checkout/quote', outsider, selection)).status, 409);
  const quote = await httpQuote(selection, account);
  assert.equal((await request('POST', '/api/checkout', account, payload(selection, quote))).status, 200);
  assert.equal(await ReservationHold.exists({ _id: hold.id }), null);
});

test('borrower lock enforces a membership cap across different listings', async () => {
  const capped = await user('capped');
  const tier = await MembershipTier.create({ name: 'Test Tier', waitlistPriority: 1, maxConcurrentReservations: 1 });
  await User.updateOne({ _id: capped.id }, { membership: {
    tier: tier.id, status: 'active', renewsAt: new Date(Date.now() + 86400000),
  } });
  const tools = await Promise.all([item('Cap one'), item('Cap two')]);
  const inputs = await Promise.all(tools.map(async (tool) => {
    const selection = single(tool);
    return payload(selection, await httpQuote(selection, capped));
  }));
  const both = await Promise.all(inputs.map((input) => request('POST', '/api/checkout', capped, input)));
  assert.deepEqual(both.map((r) => r.status).sort(), [200, 409]);
});

test('paid wallet checkout fails safely without Member 2 service; integration receives transaction and settlement is once', async () => {
  const tool = await item('Paid drill', { depositAmount: 100 });
  const selection = single(tool);
  const withoutPayment = { ...features(), payment: undefined };
  const quote = await checkout.preview(borrower.id, selection, withoutPayment);
  assert.equal(quote.amountMinor, 15000);
  assert.deepEqual(quote.paymentMethods, []);
  await assert.rejects(checkout.begin(borrower.id, payload(selection, quote), withoutPayment), { status: 503 });
  assert.equal(await Reservation.countDocuments({ item: tool.id }), 0);

  let charges = 0;
  let settlements = 0;
  let notifications = 0;
  const deps = {
    ...withoutPayment,
    payment: {
      chargeWalletCheckout: async (input, session) => {
        assert(session.inTransaction());
        assert.equal(input.amountMinor, 15000);
        charges += 1;
      },
      settleCancellation: async (input, session) => {
        assert(session.inTransaction());
        assert.equal(input.amountMinor, 15000);
        assert.equal(input.freeCancellationHours, 48);
        settlements += 1;
        return { refundMinor: 13000 };
      },
    },
    events: {
      enqueueEvent: async (type, id, recipients, data, key, session) => {
        assert(session.inTransaction());
        assert.equal(recipients.length, 2);
        assert.equal(data.reservationId, id);
        if (type === 'reservation_cancelled') notifications += 1;
      },
    },
  };
  const attempt = payload(selection, quote);
  const result = await checkout.begin(borrower.id, attempt, deps);
  await checkout.begin(borrower.id, attempt, deps);
  assert.equal(charges, 1);
  const cancellation = { actorId: borrower.id, reservationId: result.reservationIds[0] };
  const cancelled = await cancel(cancellation, deps);
  await cancel(cancellation, deps);
  assert.equal(cancelled.cancellation.refundAmount, 130);
  assert.equal(cancelled.deposit.status, 'partially_forfeited');
  assert.equal(settlements, 1);
  assert.equal(notifications, 1);
});

test('card failure removes a hold and confirmed success finalizes once', async () => {
  let provider = { state: 'pending', redirectUrl: 'https://checkout.stripe.com/example' };
  const deps = { payment: {
    startCardPayment: async () => provider,
    getCardPayment: async () => provider,
    refundFailedCheckout: async () => assert.fail('Unexpected card refund'),
    recordCardCheckout: async (input, session) => {
      assert(session.inTransaction());
      assert.equal(input.paymentReference, 'pi_fixture');
    },
  } };
  const tool = await item('Card drill', { depositAmount: 10 });
  const selection = single(tool);
  const quote = await checkout.preview(borrower.id, selection, deps);
  const waiting = await checkout.begin(borrower.id, payload(selection, quote, 'card'), deps);
  assert.equal(waiting.status, 'awaiting_payment');
  assert.equal((await request('GET', '/api/checkout/' + waiting.id, other)).status, 404);
  await assert.rejects(checkout.preview(other.id, selection, deps), { status: 409 });
  provider = { state: 'failed' };
  assert.equal((await checkout.reconcileCard(waiting.id, deps)).status, 'failed');
  assert.equal(await ReservationHold.countDocuments({ attempt: waiting.id }), 0);
  provider = { state: 'pending', redirectUrl: 'https://checkout.stripe.com/example' };
  const second = await checkout.begin(borrower.id, payload(selection, quote, 'card'), deps);
  provider = { state: 'paid', reference: 'pi_fixture', amountMinor: quote.amountMinor, currency: 'egp' };
  const finalized = await Promise.all([checkout.reconcileCard(second.id, deps), checkout.reconcileCard(second.id, deps)]);
  assert.deepEqual(finalized[0], finalized[1]);
  assert.equal(finalized[0].status, 'completed');
  assert.equal(await Reservation.countDocuments({ item: tool.id }), 1);
});

test('late paid card result compensates a booking it can no longer fulfill', async () => {
  const tool = await item('Late card drill', { depositAmount: 10 });
  let refunds = 0;
  const deps = { payment: {
    startCardPayment: async () => ({ state: 'pending', redirectUrl: 'https://checkout.stripe.com/example' }),
    getCardPayment: async () => ({ state: 'paid', reference: 'pi_late', amountMinor: 1500, currency: 'EGP' }),
    refundFailedCheckout: async (input) => {
      assert.equal(input.paymentReference, 'pi_late');
      refunds += 1;
    },
    chargeWalletCheckout: async () => {},
    recordCardCheckout: async () => assert.fail('Cannot audit an unfulfilled checkout as completed'),
  } };
  const selection = single(tool);
  const quote = await checkout.preview(borrower.id, selection, deps);
  const first = await checkout.begin(borrower.id, payload(selection, quote, 'card'), deps);
  await CheckoutAttempt.updateOne({ _id: first.id }, { expiresAt: new Date(0) });
  await ReservationHold.updateMany({ attempt: first.id }, { expiresAt: new Date(0) });
  await checkout.begin(other.id, payload(selection, quote), deps);
  assert.equal((await checkout.reconcileCard(first.id, deps)).status, 'failed');
  assert.equal((await checkout.reconcileCard(first.id, deps)).status, 'failed');
  assert.equal(refunds, 1);
  assert.equal(await Reservation.countDocuments({ item: tool.id }), 1);
});

async function lifecycleFixture(status, fields = {}) {
  const tool = await item('Lifecycle drill');
  return Reservation.create({
    item: tool._id, lender: lender._id, borrower: borrower._id, status, ...range, ...fields,
  });
}

function lenderAction(record, action, fields = {}, deps = {}) {
  return commands.transition({ actorId: lender._id, reservationId: record._id, action, ...fields }, deps);
}

test('good return releases the held deposit, recalculates both users and emits completion once', async () => {
  const record = await lifecycleFixture('active', { deposit: { amount: 100, status: 'held' } });
  const recalculated = [];
  const emitted = [];
  let settlements = 0;
  const deps = {
    payment: {
      async releaseDeposit(input, session) {
        assert(session.inTransaction());
        assert.equal(input.amountMinor, 10000);
        assert.equal(input.idempotencyKey, 'reservation:' + record.id + ':release');
        settlements++;
      },
    },
    trust: {
      async recalculateTrust(userId, { session }) {
        assert.equal((await Reservation.findById(record._id).session(session)).status, 'completed');
        recalculated.push(userId);
      },
    },
    events: { async enqueueEvent(type) { emitted.push(type); } },
  };
  const updated = await lenderAction(record, 'return', { expectedStatus: 'active' }, deps);
  await lenderAction(record, 'return', { expectedStatus: 'active' }, deps);
  assert.equal(updated.returnCondition, 'good');
  assert.equal(updated.deposit.status, 'released');
  assert.equal(+updated.completedAt, +updated.returnedAt);
  assert.equal(settlements, 1);
  assert.deepEqual(recalculated, [borrower.id, lender.id]);
  assert.deepEqual(emitted, ['reservation_completed', 'availability_changed']);
});

test('paid rejection rolls back when settlement is unavailable and refunds in full on retry', async () => {
  const record = await lifecycleFixture('pending', {
    deposit: { amount: 50, status: 'held' }, fulfilment: { method: 'delivery', deliveryFee: 20 },
  });
  await assert.rejects(lenderAction(record, 'reject'), { status: 503 });
  assert.equal((await Reservation.findById(record._id)).status, 'pending');
  let refunds = 0;
  const deps = { payment: { async refundToWallet(input, session) {
    assert(session.inTransaction());
    assert.equal(input.userId, borrower.id);
    assert.equal(input.amountMinor, 7000);
    assert.equal(input.depositMinor, 5000);
    assert.equal(input.deliveryMinor, 2000);
    refunds++;
  } } };
  const rejected = await lenderAction(record, 'reject', { reason: ' Unavailable ' }, deps);
  await lenderAction(record, 'reject', {}, deps);
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.rejectionReason, 'Unavailable');
  assert.equal(rejected.deposit.status, 'refunded');
  assert.equal(refunds, 1);
});

test('damaged return retains the deposit and rolls back if its open case was not created', async () => {
  const record = await lifecycleFixture('active', { deposit: { amount: 100, status: 'held' } });
  await assert.rejects(lenderAction(record, 'returnDamaged', { beforeCommit: async () => {} }), { status: 409 });
  assert.equal((await Reservation.findById(record._id)).status, 'active');
  const result = await lenderAction(record, 'returnDamaged', { beforeCommit: async (returned, session) => {
    assert.equal((await Reservation.findById(record._id).session(session)).returnCondition, 'damaged');
    await DamageReport.create([{
      reservation: record._id, item: record.item, reportedBy: lender._id,
      borrower: borrower._id, description: 'Handle was damaged on return.',
    }], { session });
    assert(returned.completedAt);
  } });
  assert.equal(result.deposit.status, 'held');
  assert.equal(result.status, 'completed');
  await assert.rejects(lenderAction(record, 'return'), { status: 409 });
  assert.equal(await DamageReport.countDocuments({ reservation: record._id }), 1);
});

test('returns at the UTC deadline are on time; later returns are charged through Member 2', async () => {
  const { isLateReturn } = require('../../src/services/reservations/returnTiming');
  const due = new Date('2026-11-15T00:00:00.000Z');
  assert.equal(isLateReturn(due, due), false);
  assert.equal(isLateReturn(new Date(+due + 1), due), true);
  const record = await lifecycleFixture('active', { startDate: new Date(+due - 86400000), endDate: due });
  let calls = 0;
  const deps = { payment: { async applyLateFee(input, session) {
    assert(session.inTransaction());
    assert(input.returnedAt > input.endDate);
    calls++;
    return { feeMinor: 175 };
  } } };
  const returned = await lenderAction(record, 'return', {}, deps);
  await lenderAction(record, 'return', {}, deps);
  assert.equal(returned.lateFee, 1.75);
  assert.equal(calls, 1);
});

test('borrower cancels only their current extension and expired requests cannot be approved', async () => {
  const record = await lifecycleFixture('active');
  const newEndDate = new Date(Date.parse(range.endDate) + 86400000).toISOString().slice(0, 10);
  const request = () => commands.extend({
    actorId: borrower.id, reservationId: record.id, action: 'request', endDate: newEndDate,
  });
  const first = await request();
  const firstId = first.extension.requestId;
  const cancelInput = { actorId: borrower.id, reservationId: record.id, action: 'cancel', requestId: firstId };
  await assert.rejects(commands.extend({ ...cancelInput, actorId: lender.id }), { status: 403 });
  assert.equal((await commands.extend(cancelInput)).extension.status, 'cancelled');
  const second = await request();
  await assert.rejects(commands.extend(cancelInput), { status: 409 });
  assert.equal((await Reservation.findById(record._id)).extension.status, 'pending');
  await Reservation.updateOne({ _id: record._id }, { startDate: '2026-11-14', endDate: '2026-11-15' });
  const expired = await Reservation.findById(record._id);
  assert.equal(commands.reservationView(expired).extensionStatus, 'expired');
  assert.equal(commands.reservationView(expired).returnOverdue, true);
  await assert.rejects(commands.extend({
    actorId: lender.id, reservationId: record.id, action: 'approve', requestId: second.extension.requestId,
  }), { status: 409 });
});

test('condition photos have stable private metadata and spoofed images are rejected', async () => {
  const express = require('express');
  const fs = require('node:fs/promises');
  const sharp = require('sharp');
  const { uploadConditionPhotos, fileInfo } = require('../../src/middleware/upload');
  const uploadApp = express();
  const written = [];
  uploadApp.post('/photos', uploadConditionPhotos, async (req, res) => {
    written.push(...req.files.map((file) => file.path));
    res.json(req.files.map(fileInfo));
  });
  uploadApp.use((error, req, res, next) => res.status(error.status || 400).json({ message: error.message }));
  const listener = await new Promise((resolve) => {
    const instance = uploadApp.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const send = async (bytes, name, count = 1) => {
    const form = new FormData();
    for (let index = 0; index < count; index++) {
      form.append('photos', new Blob([bytes], { type: 'image/png' }), name);
    }
    return fetch('http://127.0.0.1:' + listener.address().port + '/photos', { method: 'POST', body: form });
  };
  try {
    const png = await sharp({
      create: { width: 2, height: 2, channels: 3, background: 'white' },
    }).png().toBuffer();
    const good = await send(png, 'evidence.png');
    assert.equal(good.status, 200);
    const [info] = await good.json();
    assert.match(info.path, /^private\/condition-photos\//);
    assert.equal(info.url, undefined);
    assert.equal((await fetch(base + '/uploads/' + info.path)).status, 404);
    assert.equal((await send('not an image', 'fake.png')).status, 400);
    assert.equal((await send(png, 'wrong.pdf')).status, 400);
    assert.equal((await send(png, 'too-many.png', 6)).status, 400);
    const record = await lifecycleFixture('active', { conditionPhotos: {
      pickup: [{ ...info, uploadedBy: lender._id }, { ...info, uploadedBy: lender._id }],
    } });
    assert.notEqual(String(record.conditionPhotos.pickup[0]._id), String(record.conditionPhotos.pickup[1]._id));
    assert.equal(record.conditionPhotos.pickup[0].url, undefined);
  } finally {
    await new Promise((resolve) => listener.close(resolve));
    await Promise.all(written.map((file) => fs.unlink(file)));
  }
});

test('cancelling a delivery refunds the full fee and only the allowed part of the deposit', async () => {
  const record = await lifecycleFixture('confirmed', {
    deposit: { amount: 100, status: 'held' },
    fulfilment: { method: 'delivery', deliveryFee: 25, deliveryStatus: 'preparing' },
  });
  const input = { actorId: borrower.id, reservationId: record.id };
  const depositOnly = { payment: { settleCancellation: async () => ({ refundMinor: 5000 }) } };
  await assert.rejects(cancel(input, depositOnly), { status: 503 });
  assert.equal((await Reservation.findById(record.id)).status, 'confirmed');

  let settlements = 0;
  const deps = { payment: { async settleCancellation(quote, session) {
    assert(session.inTransaction());
    assert.equal(quote.amountMinor, 10000);
    assert.equal(quote.deliveryMinor, 2500);
    settlements++;
    return { refundMinor: 5000, deliveryRefundMinor: 2500 };
  } } };
  const cancelled = await cancel(input, deps);
  await cancel(input, deps);
  assert.equal(cancelled.cancellation.refundAmount, 75);
  assert.equal(cancelled.deposit.forfeited, 50);
  assert.equal(cancelled.deposit.status, 'partially_forfeited');
  assert.equal(settlements, 1);
});

test('delivery-only charges are refunded before handover and completed deliveries cannot be cancelled', async () => {
  const fields = { fulfilment: { method: 'delivery', deliveryFee: 25, deliveryStatus: 'preparing' } };
  const record = await lifecycleFixture('confirmed', fields);
  const delivered = await lifecycleFixture('confirmed', {
    fulfilment: { ...fields.fulfilment, deliveryStatus: 'delivered' },
  });
  let settlements = 0;
  const deps = { payment: { async settleCancellation(quote) {
    assert.equal(quote.amountMinor, 0);
    settlements++;
    return { refundMinor: 0, deliveryRefundMinor: quote.deliveryMinor };
  } } };
  await assert.rejects(cancel({ actorId: borrower.id, reservationId: delivered.id }, deps), { status: 409 });
  const cancelled = await cancel({ actorId: borrower.id, reservationId: record.id }, deps);
  assert.equal(cancelled.cancellation.refundAmount, 25);
  assert.equal(cancelled.deposit.status, 'none');
  assert.equal(settlements, 1);
});
