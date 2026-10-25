// Run against a disposable MongoDB database: TEST_MONGO_URI=... node --test src/controllers/auth-tests/auth.test.js
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'integration-test-secret-not-for-production';
const mongoose = require('mongoose');
const User = require('../../models/User');
const app = require('../../app');
let server, base;
const password = 'Testing123!';
const member = (suffix = 'one') => ({ username: `member_${suffix}`, password, name: 'Test Member', email: `${suffix}@example.com`, phone: suffix === 'one' ? '1234567890' : '1234567891', address: { street: '1 Test Street', city: 'Berlin' } });
async function request(path, body, cookie, method = 'POST') {
  const response = await fetch(`${base}/api${path}`, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie') };
}
before(async () => {
  assert.ok(process.env.TEST_MONGO_URI, 'Set TEST_MONGO_URI to a disposable test database');
  await mongoose.connect(process.env.TEST_MONGO_URI, { dbName: `auth_test_${process.pid}` });
  await User.init();
  server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
test('registration, sessions, validation, role boundaries and admin creation', async () => {
  // Exercise the upgrade from the original non-sparse unique indexes.
  for (const field of ['email', 'phone']) {
    await User.collection.dropIndex(`${field}_1`);
    await User.collection.createIndex({ [field]: 1 }, { unique: true });
  }
  const migrateUserIndexes = require('../../models/User.indexes');
  await migrateUserIndexes();
  await migrateUserIndexes(); // Safe to run again.
  const indexes = await User.collection.indexes();
  assert.ok(indexes.find((index) => index.name === 'name_1'));
  for (const field of ['email', 'phone']) {
    assert.equal(indexes.find((index) => index.name === `${field}_1`).sparse, true);
  }
  for (const body of [{}, { ...member(), password: 'weak' }, { ...member(), username: { $ne: null } }, { ...member(), address: { city: 'Berlin' } }, { ...member(), password: 'Aa1!' + 'x'.repeat(69) }]) {
    assert.equal((await request('/auth/register', body)).status, 400);
  }
  const registered = await request('/auth/register', { ...member(), username: ' MEMBER_ONE ', role: 'admin', lenderStatus: 'verified', walletBalance: 500 });
  assert.equal(registered.status, 201);
  assert.equal(registered.data.user.username, 'member_one');
  assert.equal(registered.data.user.role, 'member');
  assert.equal(registered.data.user.lenderStatus, 'none');
  assert.equal(registered.data.user.walletBalance, 0);
  assert.equal(registered.data.user.passwordHash, undefined);
  assert.match(registered.cookie, /HttpOnly/);
  assert.match(registered.cookie, /SameSite=Lax/i);
  const saved = await User.findById(registered.data.user._id).select('+passwordHash');
  assert.notEqual(saved.passwordHash, password);
  assert.ok(await saved.checkPassword(password));
  const cookie = registered.cookie.split(';')[0];
  assert.equal((await request('/auth/me', undefined, cookie, 'GET')).data.user._id, String(saved._id));
  assert.equal((await request('/auth/me', undefined, undefined, 'GET')).status, 401);
  for (const field of ['username', 'email', 'phone']) {
    const duplicate = { ...member('two'), [field]: member()[field] };
    assert.equal((await request('/auth/register', duplicate)).status, 409);
  }
  const missing = await request('/auth/login', { username: 'missing', password });
  const wrong = await request('/auth/login', { username: 'member_one', password: 'wrong' });
  assert.equal(missing.status, 401); assert.equal(wrong.status, 401);
  assert.equal(missing.data.message, wrong.data.message);
  assert.equal((await request('/auth/login', { username: ' MEMBER_ONE ', password })).status, 200);
  await User.updateOne({ _id: saved._id }, { status: 'suspended' });
  assert.equal((await request('/auth/login', { username: 'member_one', password })).status, 403);
  assert.equal((await request('/auth/me', undefined, cookie, 'GET')).status, 403);
  await User.updateOne({ _id: saved._id }, { status: 'active' });
  assert.equal((await request('/admins', { username: 'new_admin', password })).status, 401);
  assert.equal((await request('/admins', { username: 'new_admin', password }, cookie)).status, 403);
  const admin = new User({ username: 'root_admin', name: 'Root Admin', role: 'admin' });
  await admin.setPassword(password); await admin.save();
  const adminLogin = await request('/auth/login', { username: admin.username, password });
  const adminCookie = adminLogin.cookie.split(';')[0];
  for (const username of ['new_admin', 'other_admin']) {
    const created = await request('/admins', { username, password, createdBy: saved._id }, adminCookie);
    assert.equal(created.status, 201); assert.equal(created.data.user.role, 'admin');
    assert.equal(created.data.user.createdBy, String(admin._id));
    assert.equal(created.data.user.passwordHash, undefined); assert.equal(created.cookie, null);
    assert.equal((await request('/auth/login', { username, password })).status, 200);
  }
  assert.equal((await request('/admins', { username: 'new_admin', password }, adminCookie)).status, 409);
  assert.equal((await request('/admins', { username: 'bad_admin', password: 'weak' }, adminCookie)).status, 400);
  assert.equal((await request('/auth/me', undefined, adminCookie, 'GET')).data.user._id, String(admin._id));
  const logout = await request('/auth/logout', {}, cookie);
  assert.equal(logout.status, 200); assert.match(logout.cookie, /Expires=Thu, 01 Jan 1970/);
  assert.equal((await request('/auth/logout', {})).status, 200);
});
