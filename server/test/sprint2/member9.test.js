// Run with TEST_MONGO_URI=<disposable MongoDB URI> node --test test/sprint2/member9.test.js
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const mongoose = require('mongoose');
const User = require('../../src/models/User');
const Referral = require('../../src/models/Referral');
const Notification = require('../../src/models/Notification');
const EventOutbox = require('../../src/models/EventOutbox');
const Reservation = require('../../src/models/Reservation');
let smtpServer;
let smtpPort;
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
            socket.write('250 2.0.0 queued\r\n');
          }
        } else if (/^(EHLO|HELO)\b/i.test(line)) {
          socket.write('250-localhost\r\n250 SIZE 100000\r\n');
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
  await Promise.all([User.init(), Referral.init(), Notification.init(), EventOutbox.init(), Reservation.init()]);
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
  const first = await eventOutbox.enqueueEvent('availability_changed', member._id, [member._id], {}, eventKey);
  const second = await eventOutbox.enqueueEvent('availability_changed', member._id, [member._id], {}, eventKey);
  assert.equal(String(first._id), String(second._id));
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
  const referee = await makeMember('202', { notificationPrefs: { reservations: false } });
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
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const laterCompletedReservation = await Reservation.create({
    item: new mongoose.Types.ObjectId(),
    borrower: referee._id,
    lender: referrer._id,
    startDate: new Date(Date.now() - 48 * 60 * 60 * 1000),
    endDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
    status: 'completed',
  });
  const completionEvent = {
    type: 'completed',
    aggregateId: laterCompletedReservation._id,
    recipients: [referee._id],
    eventKey: 'test:reservation-completed-later',
    payload: { borrowerId: referee._id },
  };
  await notificationService.processEvent(completionEvent);
  assert.equal(credits, 0);
  const firstCompletionEvent = {
    ...completionEvent,
    aggregateId: firstCompletedReservation._id,
    eventKey: 'test:reservation-completed-first',
  };
  await notificationService.processEvent(firstCompletionEvent);
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
});

test('reminder event windows use stable UTC dates', () => {
  const { utcDate } = require('../../src/services/notifications/reminders');
  assert.equal(utcDate(new Date('2026-11-15T23:59:59.000Z')), '2026-11-15');
});
