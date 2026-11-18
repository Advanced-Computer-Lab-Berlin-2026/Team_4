// Run with TEST_MONGO_URI=<disposable MongoDB URI> node --test test/sprint2/member9.test.js
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const mongoose = require('mongoose');
const User = require('../../src/models/User');
const Referral = require('../../src/models/Referral');
const Notification = require('../../src/models/Notification');
const EventOutbox = require('../../src/models/EventOutbox');
const Reservation = require('../../src/models/Reservation');
let smtpServer;
let smtpPort;
let rejectSmtpMessages = false;
let rejectRecipient = null;
let referralService;
let eventOutbox;
let notificationService;
let reminderService;

function startSmtpServer() {
  smtpServer = net.createServer((socket) => {
    socket.setEncoding('utf8');
    let buffer = '';
    let readingMessage = false;
    socket.write('220 localhost ESMTP\r\n');
    socket.on('data', (chunk) => {
      buffer += chunk;
      let end = buffer.indexOf('\r\n');
      while (end !== -1) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (readingMessage) {
          if (line === '.') {
            readingMessage = false;
            socket.write(rejectSmtpMessages ? '550 5.0.0 simulated delivery failure\r\n' : '250 2.0.0 queued\r\n');
          }
        } else if (/^(EHLO|HELO)\b/i.test(line)) {
          socket.write('250-localhost\r\n250 SIZE 100000\r\n');
        } else if (/^RCPT TO:/i.test(line) && rejectRecipient && line.includes(rejectRecipient)) {
          socket.write('550 5.0.0 simulated recipient failure\r\n');
        } else if (/^MAIL FROM:/i.test(line) || /^RCPT TO:/i.test(line)) {
          socket.write('250 2.1.0 accepted\r\n');
        } else if (/^DATA$/i.test(line)) {
          readingMessage = true;
          socket.write('354 end with <CRLF>.<CRLF>\r\n');
        } else if (/^QUIT$/i.test(line)) {
          socket.write('221 2.0.0 closing\r\n');
          socket.end();
        } else {
          socket.write('250 ok\r\n');
        }
        end = buffer.indexOf('\r\n');
      }
    });
  });
  return new Promise((resolve) => {
    smtpServer.listen(0, '127.0.0.1', () => {
      smtpPort = smtpServer.address().port;
      resolve();
    });
  });
}

function makeMember(suffix, extra = {}) {
  return User.create({
    username: `m9_${suffix}`,
    name: `Member ${suffix}`,
    email: `${suffix}@example.test`,
    phone: `1234567${String(suffix).replace(/\D/g, '').padStart(3, '0')}`,
    address: { street: '1 Test Street', city: 'Berlin' },
    passwordHash: 'test-hash',
    ...extra,
  });
}

before(async () => {
  if (!process.env.TEST_MONGO_URI) return;
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'member9-integration-test-secret';
  await startSmtpServer();
  process.env.SMTP_HOST = '127.0.0.1';
  process.env.SMTP_PORT = String(smtpPort);
  process.env.SMTP_USER = '';
  process.env.SMTP_PASS = '';
  process.env.EMAIL_FROM = 'ShareShed Test <test@example.test>';
  await mongoose.connect(process.env.TEST_MONGO_URI, { dbName: `member9_test_${process.pid}` });
  await Promise.all(Object.values(require('../../src/models')).map((model) => model.init()));
  referralService = require('../../src/services/referrals/referral');
  eventOutbox = require('../../src/services/notifications/eventOutbox');
  notificationService = require('../../src/services/notifications/notification');
  reminderService = require('../../src/services/notifications/reminders');
});

after(async () => {
  if (smtpServer) await new Promise((resolve) => smtpServer.close(resolve));
  if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('outbox deduplicates event keys and preference opt-out retains in-app notification', { skip: !process.env.TEST_MONGO_URI }, async () => {
  const member = await makeMember('101', { notificationPrefs: { promotions: false } });
  const eventKey = `test:duplicate:${member._id}`;
  await mongoose.connection.transaction(async (session) => {
    const first = await eventOutbox.enqueueEvent('availability_changed', member._id, [member._id], {}, eventKey, session);
    const second = await eventOutbox.enqueueEvent('availability_changed', member._id, [member._id], {}, eventKey, session);
    assert.equal(String(first._id), String(second._id));
    assert.ok(first.createdAt instanceof Date);
  });
  assert.equal(await EventOutbox.countDocuments({ eventKey }), 1);

  await notificationService.processEvent({
    type: 'availability_changed',
    aggregateId: member._id,
    recipients: [member._id],
    eventKey,
    payload: {},
  });
  const notification = await Notification.findOne({ user: member._id, eventKey });
  assert.ok(notification);
  assert.equal(notification.email.status, 'skipped');
  assert.equal(notification.readAt, undefined);
});

test('referral rewards only after completion, blocks self-referral, and credits once', { skip: !process.env.TEST_MONGO_URI }, async () => {
  const referrer = await makeMember('201', { referralCode: 'REFERRAL201' });
  const referee = await makeMember('202');
  const referral = await referralService.captureReferral({ userId: referee._id, code: referrer.referralCode });
  assert.equal(referral.status, 'registered');
  await assert.rejects(
    referralService.captureReferral({ userId: referrer._id, code: referrer.referralCode }),
    (error) => error.status === 400
  );

  let credits = 0;
  referralService.setWalletCreditService({
    async creditReferral(input) {
      credits += 1;
      assert.equal(input.userId.toString(), referrer._id.toString());
      assert.equal(input.amountMinor, 10000);
      assert.equal(input.idempotencyKey, `referral:${referral._id}:first-completion`);
    },
  });
  await notificationService.processEvent({
    type: 'confirmed',
    aggregateId: new mongoose.Types.ObjectId(),
    recipients: [referee._id],
    eventKey: 'test:reservation-confirmed',
    payload: {},
  });
  assert.equal(credits, 0);

  const firstCompletedReservation = await Reservation.create({
    item: new mongoose.Types.ObjectId(),
    borrower: referee._id,
    lender: referrer._id,
    startDate: new Date(Date.now() - 48 * 60 * 60 * 1000),
    endDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
    status: 'completed',
    completedAt: new Date('2026-01-02T00:00:00.000Z'),
    returnedAt: new Date('2026-01-02T00:00:00.000Z'),
  });
  const laterCompletedReservation = await Reservation.create({
    item: new mongoose.Types.ObjectId(),
    borrower: referee._id,
    lender: referrer._id,
    startDate: new Date(Date.now() - 48 * 60 * 60 * 1000),
    endDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
    status: 'completed',
    returnedAt: new Date('2026-01-01T00:00:00.000Z'),
  });
  await Reservation.collection.updateOne(
    { _id: laterCompletedReservation._id },
    { $set: { updatedAt: new Date('2026-02-01T00:00:00.000Z') } }
  );
  const completionEvent = {
    type: 'completed',
    aggregateId: laterCompletedReservation._id,
    recipients: [referee._id],
    eventKey: 'test:reservation-completed-later',
    payload: { borrowerId: referee._id },
  };
  rejectSmtpMessages = true;
  try {
    await assert.rejects(notificationService.processEvent(completionEvent), /simulated delivery failure/);
  } finally {
    rejectSmtpMessages = false;
  }
  assert.equal(credits, 1);
  await notificationService.processEvent(completionEvent);
  assert.equal(credits, 1);

  const firstCompletionEvent = {
    ...completionEvent,
    aggregateId: firstCompletedReservation._id,
    eventKey: 'test:reservation-completed-first',
  };
  await notificationService.processEvent(firstCompletionEvent);
  assert.equal(credits, 1);
  assert.equal((await Referral.findById(referral._id)).status, 'converted');
  referralService.setWalletCreditService(null);

  const previousBorrower = await makeMember('203');
  await Reservation.create({
    item: new mongoose.Types.ObjectId(),
    borrower: previousBorrower._id,
    lender: referrer._id,
    startDate: new Date(Date.now() - 48 * 60 * 60 * 1000),
    endDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
    status: 'completed',
  });
  await assert.rejects(
    referralService.captureReferral({ userId: previousBorrower._id, code: referrer.referralCode }),
    (error) => error.status === 400
  );
});

test('password-reset email may use the development console fallback, but notifications still require SMTP', () => {
  const script = `
    const { sendEmail } = require('./src/utils/email');
    (async () => {
      await sendEmail({ to: 'member@example.test', subject: 'Reset code', text: 'Code: 123456', consoleFallback: true });
      try {
        await sendEmail({ to: 'member@example.test', subject: 'Notification', text: 'Hello' });
        process.exitCode = 1;
      } catch (error) {
        if (!error.message.includes('SMTP is not configured')) throw error;
        console.log('SMTP_REQUIRED');
      }
    })().catch((error) => { console.error(error); process.exitCode = 1; });
  `;
  const output = execFileSync(process.execPath, ['-e', script], {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, NODE_ENV: 'development', SMTP_HOST: '' },
    encoding: 'utf8',
  });
  assert.match(output, /email:development-fallback/);
  assert.match(output, /Code: 123456/);
  assert.match(output, /SMTP_REQUIRED/);

  const productionScript = `
    const { sendEmail } = require('./src/utils/email');
    (async () => {
      try {
        await sendEmail({ to: 'member@example.test', subject: 'Reset code', text: 'Code: 123456', consoleFallback: true });
        throw new Error('Production unexpectedly allowed console fallback');
      } catch (error) {
        if (error.message === 'Production unexpectedly allowed console fallback') throw error;
        if (!error.message.includes('SMTP is not configured')) throw error;
        console.log('PRODUCTION_REJECTED');
      }
    })().catch((error) => { console.error(error); process.exitCode = 1; });
  `;
  const productionOutput = execFileSync(process.execPath, ['-e', productionScript], {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, NODE_ENV: 'production', SMTP_HOST: '' },
    encoding: 'utf8',
  });
  assert.match(productionOutput, /PRODUCTION_REJECTED/);
});

test('reminder enqueue is restart-safe and SMTP delivery stores a sub-60-second timestamp', { skip: !process.env.TEST_MONGO_URI }, async () => {
  const borrower = await makeMember('301');
  const lender = await makeMember('302');
  const endDate = new Date(Date.now() + 12 * 60 * 60 * 1000);
  const reservation = await Reservation.create({
    item: new mongoose.Types.ObjectId(),
    borrower: borrower._id,
    lender: lender._id,
    startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
    endDate,
    status: 'active',
  });

  await reminderService.enqueueDueReturnReminders();
  await reminderService.enqueueDueReturnReminders();
  const reminderKey = `reminder:return:${reservation._id}:${endDate.toISOString().slice(0, 10)}`;
  assert.equal(await EventOutbox.countDocuments({ eventKey: reminderKey }), 1);
  const reminder = await EventOutbox.findOne({ eventKey: reminderKey });
  assert.deepEqual(reminder.recipients.map(String).sort(), [borrower.id, lender.id].sort());
  await Reservation.updateOne({ _id: reservation._id }, { $set: { endDate: new Date(+endDate + 86_400_000) } });
  await notificationService.processEvent(reminder);
  assert.equal(await Notification.countDocuments({ eventKey: reminderKey }), 0);
  await Reservation.updateOne({ _id: reservation._id }, { $set: { endDate } });
  await notificationService.processEvent(reminder);
  assert.equal(await Notification.countDocuments({ eventKey: reminderKey, 'email.status': 'sent' }), 2);

  const startedAt = Date.now();
  await notificationService.processEvent({
    type: 'confirmed',
    aggregateId: reservation._id,
    recipients: [borrower._id],
    eventKey: `test:smtp:${borrower._id}`,
    payload: { title: 'SMTP delivery test', message: 'Test email delivery.' },
  });
  const notification = await Notification.findOne({ user: borrower._id, eventKey: `test:smtp:${borrower._id}` });
  assert.equal(notification.email.status, 'sent');
  assert.ok(notification.email.sentAt instanceof Date);
  assert.ok(notification.email.sentAt.getTime() - startedAt < 60_000);
});

test('notification retries use capped exponential backoff and event types have presentation defaults', () => {
  const { retryDelay } = require('../../src/jobs/notificationWorker');
  const { getDetails } = require('../../src/services/notifications/notification');
  assert.equal(retryDelay(1), 1000);
  assert.equal(retryDelay(2), 2000);
  assert.equal(retryDelay(20), 60_000);
  assert.equal(getDetails({ type: 'confirmed', payload: {} }).category, 'reservations');
  assert.equal(getDetails({ type: 'return_reminder', payload: {} }).category, 'reservations');
  assert.equal(getDetails({ type: 'waitlist_promoted', payload: {} }).link, '/waitlists');
});

test('reminder event windows use stable UTC dates', () => {
  const { utcDate } = require('../../src/services/notifications/reminders');
  assert.equal(utcDate(new Date('2026-11-15T23:59:59.000Z')), '2026-11-15');
});


test('reservation notifications reach both participants and released favorites notify their subscribers', { skip: !process.env.TEST_MONGO_URI }, async () => {
  const { Category, Favorite, Item } = require('../../src/models');
  const { transition, advanceDelivery } = require('../../src/services/reservations/reservationCommands');
  const { cancel } = require('../../src/services/reservations/cancellation');
  const { processNextEvent } = require('../../src/jobs/notificationWorker');
  await EventOutbox.updateMany({}, { $set: { status: 'sent' } });
  const [borrower, lender] = await Promise.all([makeMember('401'), makeMember('402', { lenderStatus: 'verified' })]);
  const category = await Category.create({ name: 'Notifications tools', slug: 'notification-tools' });
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const day = (offset) => new Date(+today + offset * 86_400_000);
  async function makeReservation(title, status = 'pending', start = 1, fulfilment) {
    const item = await Item.create({ title, category: category.id, owner: lender.id, description: 'Fixture item', depositAmount: 0 });
    return Reservation.create({
      item: item._id, borrower: borrower._id, lender: lender._id, status, fulfilment,
      startDate: day(start), endDate: day(start + 2),
    });
  }

  const cancelled = await makeReservation('Booked drill');
  const subscriber = await makeMember('403');
  await Favorite.create({ user: subscriber.id, item: cancelled.item });
  await transition({ actorId: lender.id, reservationId: cancelled.id, action: 'confirm' });
  await cancel({ actorId: borrower.id, reservationId: cancelled.id });
  const rejected = await makeReservation('Declined drill');
  await transition({ actorId: lender.id, reservationId: rejected.id, action: 'reject' });
  const delivery = await makeReservation('Delivered drill', 'confirmed', 0, { method: 'delivery', deliveryStatus: 'preparing' });
  for (const deliveryStatus of ['out_for_delivery', 'delivered']) {
    await advanceDelivery({ actorId: lender.id, reservationId: delivery.id, deliveryStatus });
  }

  let processed = 0;
  while (await processNextEvent()) processed++;
  assert.equal(processed, 7); // five participant events and two favorite-availability events
  const favorites = await Notification.find({ type: 'availability_changed' }).lean();
  assert.equal(favorites.filter((note) => note.eventKey === `${cancelled.id}:availability:cancelled`).length, 1);
  assert.ok(favorites.some((note) => String(note.user) === subscriber.id && note.email.status === 'sent'));
  const rows = await Notification.find({ user: { $in: [borrower._id, lender._id] } }).lean();
  assert.equal(rows.length, 10);
  for (const account of [borrower, lender]) {
    const own = rows.filter((note) => String(note.user) === account.id);
    assert.deepEqual(own.map(({ type }) => type).sort(), ['cancelled', 'confirmed', 'delivery_status', 'delivery_status', 'rejected']);
    for (const note of own) {
      assert.equal(note.email.status, 'sent');
      const event = await EventOutbox.findOne({ eventKey: note.eventKey });
      assert.ok(+note.email.sentAt - +event.createdAt < 60_000);
      if (note.type === 'delivery_status') assert.equal(note.link, '/delivery-tracking/' + delivery.id);
    }
  }
});

test('a failed SMTP recipient cannot block in-app or SMTP delivery to another recipient', { skip: !process.env.TEST_MONGO_URI }, async () => {
  const [failed, healthy] = await Promise.all([makeMember('411'), makeMember('412')]);
  const key = 'notification:recipient-failure:' + failed.id;
  const { processNextEvent } = require('../../src/jobs/notificationWorker');
  await eventOutbox.enqueueEvent('confirmed', new mongoose.Types.ObjectId(), [failed._id, healthy._id], {}, key);
  rejectRecipient = failed.email;
  try {
    assert.equal(await processNextEvent(), true);
    const pending = await EventOutbox.findOne({ eventKey: key });
    assert.equal(pending.status, 'pending');
    const badNotice = await Notification.findOne({ user: failed._id, eventKey: key });
    const goodNotice = await Notification.findOne({ user: healthy._id, eventKey: key });
    assert.equal(badNotice.email.status, 'failed');
    assert.equal(goodNotice.email.status, 'sent');
    assert.equal(badNotice.readAt, undefined);
  } finally {
    rejectRecipient = null;
  }
  assert.equal(await processNextEvent(new Date(Date.now() + 3000)), true);
  assert.equal((await EventOutbox.findOne({ eventKey: key })).status, 'sent');
  assert.equal(await Notification.countDocuments({ eventKey: key, 'email.status': 'sent' }), 2);
  await EventOutbox.updateOne({ eventKey: key }, { $set: { status: 'processing', lockedAt: new Date(Date.now() - 120_000) } });
  assert.equal(await processNextEvent(), true);
  const recovered = await EventOutbox.findOne({ eventKey: key });
  assert.equal(recovered.status, 'sent');
  assert.equal(recovered.attempts, 3);
  assert.equal(await Notification.countDocuments({ eventKey: key }), 2);
});

test('membership reminders are deduplicated and a cancellation suppresses a queued reminder', { skip: !process.env.TEST_MONGO_URI }, async () => {
  const renewsAt = new Date(Date.now() + 3 * 86_400_000);
  const subscriber = await makeMember('421', { membership: { status: 'active', renewsAt } });
  await reminderService.enqueueMembershipReminders();
  await reminderService.enqueueMembershipReminders();
  const query = { aggregateId: subscriber._id, type: 'membership_expiring' };
  const reminders = await EventOutbox.find(query);
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].payload.link, '/account/membership');
  await notificationService.processEvent(reminders[0]);
  assert.equal((await Notification.findOne({ user: subscriber._id, eventKey: reminders[0].eventKey })).email.status, 'sent');
  const cancelled = await makeMember('422', { membership: { status: 'active', renewsAt } });
  await reminderService.enqueueMembershipReminders();
  await User.updateOne({ _id: cancelled._id }, { $set: { 'membership.status': 'cancelled' } });
  const stale = await EventOutbox.findOne({ ...query, aggregateId: cancelled._id });
  await notificationService.processEvent(stale);
  assert.equal(await Notification.countDocuments({ eventKey: stale.eventKey }), 0);
});

test('notifications and referral reporting respect roles, preferences, ownership and share retries over HTTP', { skip: !process.env.TEST_MONGO_URI }, async (t) => {
  const app = require('../../src/app');
  const { signToken } = require('../../src/utils/tokens');
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const [member, other, admin] = await Promise.all([makeMember('431'), makeMember('432'), makeMember('433', { role: 'admin' })]);
  const call = async (method, url, user, data) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api${url}`, {
      method,
      headers: { ...(user && { authorization: 'Bearer ' + signToken(user.id) }), ...(data && { 'content-type': 'application/json' }) },
      ...(data && { body: JSON.stringify(data) }),
    });
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  };

  const request = { shareKey: randomUUID() };
  assert.equal((await call('POST', '/referrals/share', null, request)).status, 401);
  assert.equal((await call('POST', '/referrals/share', member, { shareKey: 'invalid' })).status, 400);
  assert.equal((await call('POST', '/referrals/share', member, request)).status, 204);
  assert.equal((await call('POST', '/referrals/share', member, request)).status, 204);
  const mine = await call('GET', '/referrals/mine', member);
  assert.match(mine.body.referralLink, /^\/register\?ref=/);
  assert.equal(mine.body.total, 0);
  assert.equal((await call('POST', '/referrals/capture', other, { code: mine.body.referralCode })).status, 201);
  assert.equal((await call('GET', '/referrals/report', member)).status, 403);
  const report = await call('GET', '/referrals/report?page=2&limit=1', admin);
  assert.equal(report.body.page, 2);
  assert.equal(report.body.items.length, 1);
  assert.equal(report.body.totals.referralsSent, 1);
  assert.ok(report.body.totals.signups >= 1);
  assert.ok(report.body.totals.creditsIssuedMinor >= 10000);

  assert.equal((await call('PUT', '/notification-preferences', member, { promotions: 'false' })).status, 400);
  const prefs = await call('PUT', '/notification-preferences', member, { promotions: false });
  assert.deepEqual(prefs.body.preferences, { reservations: true, promotions: false, communityNotices: true });
  const records = [{ user: member._id, title: 'Legacy 1' }, { user: member._id, title: 'Legacy 2' }];
  await Notification.collection.insertMany(records.map((row) => ({ ...row, type: 'legacy', createdAt: new Date() })));
  const first = await call('GET', '/notifications?limit=1&unreadOnly=true', member);
  assert.equal(first.body.pages, 2);
  assert.equal(first.body.items.length, 1);
  const route = '/notifications/' + first.body.items[0]._id + '/read';
  assert.equal((await call('PATCH', route, other)).status, 404);
  const read = await call('PATCH', route, member);
  assert.equal(read.status, 200);
  assert.equal((await call('PATCH', route, member)).body.notification.readAt, read.body.notification.readAt);
  assert.equal((await call('GET', '/notifications/unread-count', member)).body.count, 1);
  assert.equal((await call('PATCH', '/notifications/read-all', member)).body.modifiedCount, 1);
  assert.equal((await call('GET', '/notifications/unread-count', member)).body.count, 0);
});
