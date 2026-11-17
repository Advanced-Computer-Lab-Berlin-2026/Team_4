const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'member4-disposable-test-fixture';

const mongoose = require('mongoose');
const { PDFDocument } = require('pdf-lib');
const app = require('../../src/app');
const models = require('../../src/models');
const { signToken } = require('../../src/utils/tokens');
const { User, Item, Category, Reservation, DamageReport, SupportTicket, Report } = models;

let server, base, admin, owner, other, lender, drill, ladder, booking, damage;
async function call(method, path, auth, input) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(auth && { authorization: 'Bearer ' + signToken(auth.id) }),
      ...(input && { 'content-type': 'application/json' }),
    },
    ...(input && { body: JSON.stringify(input) }),
  });
  const type = res.headers.get('content-type');
  return { code: res.status, type, data: type?.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
}

before(async () => {
  assert(process.env.TEST_MONGO_URI, 'Set TEST_MONGO_URI to a disposable replica set');
  mongoose.set('strictQuery', true);
  await mongoose.connect(process.env.TEST_MONGO_URI, { dbName: 'member4_test_' + process.pid });
  await Promise.all(Object.values(models).map((model) => model.init()));
  const users = ['admintest', 'ownertest', 'othertest', 'lendertest'];
  [admin, owner, other, lender] = await User.insertMany(users.map((username, i) => ({
    username, name: username, email: username + '@test.invalid', phone: '0123456000' + i,
    address: { street: 'Fixture', city: 'Test' }, passwordHash: 'fixture',
    role: i === 0 ? 'admin' : 'member', lenderStatus: i === 3 ? 'verified' : 'none',
  })));
  const [power, access] = await Category.insertMany([
    { name: 'Power Tools', slug: 'power' }, { name: 'Access', slug: 'access' },
  ]);
  [drill, ladder] = await Item.insertMany([
    { title: '=1+1', owner: lender.id, category: power.id, description: 'Test', depositAmount: 200 },
    { title: 'Ladder', owner: lender.id, category: access.id, description: 'Test', depositAmount: 50 },
  ]);
  const [first] = await Reservation.insertMany([
    { item: drill.id, lender: lender.id, borrower: owner.id, startDate: '2026-11-05', endDate: '2026-11-06',
      createdAt: '2026-10-31', status: 'completed', deposit: { amount: 200, status: 'held' } },
    { item: ladder.id, lender: lender.id, borrower: owner.id, startDate: '2026-11-09', endDate: '2026-11-10',
      createdAt: '2026-11-02', status: 'completed', deposit: { amount: 50, status: 'held' } },
  ]);
  booking = first;
  damage = await DamageReport.create({
    reservation: booking.id, item: drill.id, borrower: owner.id, reportedBy: lender.id,
    description: 'Resolved fixture', status: 'resolved', decision: { forfeitAmount: 90 },
    dispute: { reason: 'Disputed', at: '2026-11-08' }, resolution: { finalForfeitAmount: 60 },
  });
  server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  base = 'http://127.0.0.1:' + server.address().port + '/api';
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('support accepts a ticket and scopes lists, details and replies to the real owner', async () => {
  await SupportTicket.create({ user: other.id, subject: 'Private', message: 'Other member’s ticket' });
  const created = await call('POST', '/support-tickets', owner, {
    userId: other.id, userRole: 'admin', subject: 'A ticket', description: 'Initial',
  });
  assert.equal(created.code, 201);
  assert.equal(created.data.entity.creator._id, owner.id);
  assert.equal(created.data.entity.messages[0].senderRole, 'member');
  const path = '/support-tickets/' + created.data.entity._id;
  const mine = await call('GET', '/support-tickets/mine', owner);
  assert.deepEqual(mine.data.items.map((t) => t.subject), ['A ticket']);
  assert.equal((await call('GET', path, other)).code, 404);
  assert.equal((await call('POST', path + '/messages', other, { body: 'Unrelated' })).code, 404);
  assert.equal((await call('GET', '/support-tickets', owner)).code, 403);
  assert.equal((await call('PATCH', path + '/resolve', owner, { status: 'closed' })).code, 403);
  const reply = await call('POST', path + '/messages', admin, { body: 'We are looking at it' });
  assert.equal(reply.data.entity.messages[1].body, 'We are looking at it');
  assert.equal(reply.data.entity.status, 'in_progress');
  const closed = await call('PATCH', path + '/resolve', admin, { status: 'closed', resolutionNote: 'Done' });
  assert.equal(closed.data.entity.status, 'closed');
  assert.equal((await call('POST', path + '/messages', owner, { body: 'Another reply' })).code, 409);
  assert.equal((await call('GET', '/support-tickets/mine?status=closed', owner)).data.total, 1);
});

test('moderation escalates a support ticket once and persists the outcome without deleting history', async () => {
  const created = await call('POST', '/support-tickets', owner, {
    subject: 'Reported listing', description: 'Please review', category: 'listing_report',
    relatedTargetType: 'item', relatedTargetId: drill.id,
  });
  assert.equal(created.code, 201);
  const ticketId = created.data.entity._id;
  const endpoint = '/support-tickets/' + ticketId + '/resolve';
  const input = { status: 'resolved', linkReport: { targetType: 'item', targetId: drill.id } };
  const resolved = await call('PATCH', endpoint, admin, input);
  assert.equal(resolved.code, 200);
  const reportId = resolved.data.report._id;
  assert.equal(resolved.data.report.supportTicketId, ticketId);
  assert.equal((await call('PATCH', endpoint, admin, input)).data.entity.linkedReport, reportId);
  assert.equal(await Report.countDocuments({ supportTicketId: ticketId }), 1);
  const reviewPath = '/moderation/reports/' + reportId + '/action';
  assert.equal((await call('PATCH', reviewPath, admin, { action: 'flag', adminNotes: 'Check' })).data.entity.adminNotes, 'Check');
  assert.equal((await Item.findById(drill.id)).moderationStatus, 'flagged');
  assert.equal((await call('GET', '/catalog/' + drill.id)).code, 404);
  assert.equal((await call('PATCH', reviewPath, admin, { action: 'remove' })).code, 200);
  assert.equal((await Item.findById(drill.id)).isArchived, true);
  assert(await Reservation.exists({ _id: booking.id }));
  assert(await DamageReport.exists({ _id: damage.id }));
});

test('moderation protects admins and handles account flag and removal distinctly', async () => {
  const create = async (target) => {
    const result = await call('POST', '/moderation/reports', admin, {
      reporterId: other.id, targetType: 'user', targetId: target.id, reason: 'Test case',
    });
    assert.equal(result.data.entity.reporter._id, admin.id);
    return '/moderation/reports/' + result.data.entity._id + '/action';
  };
  const self = await create(admin);
  assert.equal((await call('PATCH', self, admin, { action: 'remove' })).code, 409);
  assert.equal((await User.findById(admin.id)).status, 'active');
  assert.equal((await call('PATCH', self, admin, { action: 'dismiss' })).data.entity.status, 'dismissed');

  const path = await create(other);
  const result = await call('PATCH', path, admin, { action: 'flag' });
  if (User.schema.path('isFlagged')) {
    assert.equal(result.code, 200);
    assert.equal((await User.findById(other.id)).isFlagged, true);
  } else {
    assert.equal(result.code, 503);
  }
  assert.equal((await User.findById(other.id)).status, 'active');
  assert.equal((await call('PATCH', path, admin, { action: 'remove' })).code, 200);
  assert.equal((await User.findById(other.id)).status, 'suspended');
});

test('usage reports use reservation dates and nested amounts, with literal filters and matching exports', async () => {
  const path = '/analytics/usage';
  assert.equal((await call('GET', path, owner)).code, 403);
  const all = await call('GET', path + '?month=2026-11', admin);
  assert.equal(all.data.summary.totalReservations, 2);
  assert.equal(all.data.summary.totalDepositVolume, 250);
  assert.equal(all.data.categories.length, 2);
  assert.equal((await call('GET', path + '?month=2026-13', admin)).code, 400);
  assert.equal((await call('GET', path + '?itemId=bad', admin)).code, 400);
  assert.equal((await call('GET', path + '?item=%5B', admin)).data.total, 0);
  const filter = '?month=2026-11&startDate=2026-11-05&endDate=2026-11-05&category=power&item=' + drill.id;
  const row = await call('GET', path + filter, admin);
  assert.equal(row.data.items[0].totalDepositVolume, 200);
  assert.equal(row.data.total, 1);
  const csv = await call('GET', path + '/export' + filter + '&format=csv', admin);
  assert.match(csv.data.toString(), /,'=1\+1,/);
  assert.doesNotMatch(csv.data.toString(), /Ladder/);
  const pdf = await call('GET', path + '/export' + filter + '&format=pdf', admin);
  assert.equal((await PDFDocument.load(pdf.data)).getPageCount(), 1);
});

test('damage report and exports use the final forfeiture and retain dispute history', async () => {
  const filter = '?status=resolved&resolution=partial_forfeit';
  const response = await call('GET', '/analytics/damage' + filter, admin);
  const [row] = response.data.items;
  assert.equal(row.isDisputed, true);
  assert.equal(row.resolution, 'Partial forfeiture');
  assert.equal(row.heldDeposit, 200);
  assert.equal(row.forfeitedAmount, 60);
  assert.equal(row.refundedAmount, 140);
  assert.doesNotMatch(JSON.stringify(response.data), /conditionPhotos|private\//);
  const csv = await call('GET', '/analytics/damage/export' + filter + '&format=csv', admin);
  assert.match(csv.data.toString(), /Yes,Partial forfeiture,200,60,140/);
  const pdf = await call('GET', '/analytics/damage/export' + filter + '&format=pdf', admin);
  assert.equal((await PDFDocument.load(pdf.data)).getPageCount(), 1);
});
