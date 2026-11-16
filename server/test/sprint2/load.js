const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { performance } = require('node:perf_hooks');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'disposable-member1-load-test';
const mongoose = require('mongoose');
const app = require('../../src/app');
const { User, Item, Category, Reservation } = require('../../src/models');
const { signToken } = require('../../src/utils/tokens');

let server;
const sampleCount = 100;

async function run() {
  assert(process.env.TEST_MONGO_URI, 'Set TEST_MONGO_URI to a disposable replica set');
  await mongoose.connect(process.env.TEST_MONGO_URI, { dbName: 'member1_load_' + process.pid });
  await Promise.all(Object.values(require('../../src/models')).map((model) => model.init()));
  const [lender, ...members] = await User.insertMany(Array.from({ length: 201 }, (_, index) => ({
    username: 'load' + index, email: 'load' + index + '@test.invalid', phone: String(10000000 + index),
    name: 'Load test user', address: { street: 'Test', city: 'Cairo' }, passwordHash: 'fixture-only',
    lenderStatus: index === 0 ? 'verified' : 'none',
  })));
  const category = await Category.create({ name: 'Tools', slug: 'tools' });
  const items = await Item.insertMany(Array.from({ length: 5000 }, (_, index) => ({
    owner: lender.id, title: 'Tool ' + index, category: category.id, depositAmount: 0, description: 'Load test item',
  })));
  server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  async function invoke(user, path, body) {
    const response = await fetch('http://127.0.0.1:' + server.address().port + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + signToken(user.id) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    return data;
  }

  const selections = items.slice(0, sampleCount).map((item) => ({
    source: 'single', itemId: item.id,
    startDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    endDate: new Date(Date.now() + 172800000).toISOString().slice(0, 10),
  }));
  const checkoutInputs = await Promise.all(selections.map(async (selection, index) => {
    const { quote } = await invoke(members[index], '/api/checkout/quote', selection);
    return { ...selection, method: 'wallet', operationKey: randomUUID(), quoteHash: quote.quoteHash };
  }));

  const start = performance.now();
  const elapsed = await Promise.all(members.map(async (member, index) => {
    if (index < sampleCount) {
      const { checkout } = await invoke(member, '/api/checkout', checkoutInputs[index]);
      assert.equal(checkout.status, 'completed');
    } else {
      const data = await invoke(member, '/api/catalog?q=Tool&limit=12');
      assert(data.items.length > 0);
    }
    return performance.now() - start;
  }));
  elapsed.sort((a, b) => a - b);
  const p95 = Math.round(elapsed[Math.ceil(elapsed.length * 0.95) - 1]);
  assert.equal(await Reservation.countDocuments(), sampleCount);
  console.log(JSON.stringify({
    users: members.length, catalogSize: items.length, reservations: sampleCount,
    failures: 0, p95Ms: p95, maxMs: Math.round(elapsed.at(-1)),
  }));
  const budget = Number(process.env.LOAD_P95_MS || 2000);
  assert(p95 <= budget, 'Combined browsing and reserve p95 exceeded ' + budget + 'ms');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
