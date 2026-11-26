const { createHash } = require('node:crypto');
const { access } = require('node:fs/promises');
const path = require('node:path');
const mongoose = require('mongoose');
const env = require('../config/env');
const connectDB = require('../config/db');
const { User, Item, Category, Favorite, Notice, Report, Reservation } = require('../models');
const seedBase = require('./seed');
const listings = require('./demoListings');

const password = 'Passw0rd!';
const photoDir = path.join(__dirname, 'assets', 'demo-catalog');
// The fixture keys also identify existing bookings and listings. Keep them stable when renaming accounts.
const lenders = [
  ['nadia', 'Emily Parker', 'Nadia Hassan'],
  ['omar', 'James Wilson', 'Omar Fawzi'],
  ['salma', 'Sophie Hayes', 'Salma Nasser'],
  ['youssef', 'Daniel Reed', 'Youssef Kamel'],
  ['mariam', 'Hannah Brooks', 'Mariam Adel'],
  ['hassan', 'Michael Bennett', 'Hassan Mansour'],
  ['lina', 'Olivia Clark', 'Lina Mostafa'],
  ['karim', 'Thomas Miller', 'Karim Amin'],
];
const members = [
  ['yara', 'Grace Mitchell', 'Yara Mahmoud'],
  ['adam', 'Ryan Cooper', 'Adam Ramy'],
  ['dina', 'Chloe Morgan', 'Dina Zaki'],
  ['malak', 'Lucy Adams', 'Malak Riad'],
  ['ali', 'Liam Foster', 'Ali Farouk'],
  ['jana', 'Isabel Price', 'Jana Ibrahim'],
  ['fady', 'Noah Scott', 'Fady Nabil'],
  ['aya', 'Ava Collins', 'Aya Saad'],
  ['tarek', 'Ethan Ward', 'Tarek Salah'],
  ['reema', 'Mia Turner', 'Reema Samir'],
  ['nour', 'Ella Hughes', 'Nour Habib'],
  ['sara', 'Sarah Brown', 'Sara Badr'],
  ['hazem', 'Ben Taylor', 'Hazem Ashraf'],
  ['yasmin', 'Zoe Martin', 'Yasmin Galal'],
  ['mohamed', 'Oliver Lewis', 'Mohamed Essam'],
  ['layla', 'Lily Wood', 'Layla Amin'],
];

const neighborhoods = ['Maadi', 'Dokki', 'Heliopolis', 'Agouza', 'Garden City', 'Zamalek', 'Nasr City', 'Mohandessin'];
const pickupNotes = [
  'Message me to arrange a time before heading over.',
  'I can usually meet in the courtyard after 5 pm.',
  'Please bring something to secure the tool for the trip home.',
  'We can agree on a pickup time in reservation messages.',
];
const conditions = [
  'Good working order with light wear from previous projects.',
  'Clean and tested. A few cosmetic scratches on the housing.',
  'Ready to use. Please wipe it down before returning.',
  'Well maintained. Ask at pickup if you would like a quick demonstration.',
];
const idFor = (collection, key) => new mongoose.Types.ObjectId(
  createHash('sha256').update(`shareshed-demo:${collection}:${key}`).digest('hex').slice(0, 24),
);
const photoName = (slug, variant) => `${slug}-${variant + 1}.jpg`;

async function insertFixture(Model, key, data) {
  const _id = idFor(Model.modelName, key);
  const fixture = new Model({ ...data, _id });
  await fixture.validate();
  const fields = fixture.toObject({ versionKey: false });
  delete fields._id;
  const now = new Date();
  await Model.updateOne({ _id }, { $setOnInsert: {
    ...fields, createdAt: fields.createdAt || now, updatedAt: fields.updatedAt || now,
  } }, { upsert: true, timestamps: false, runValidators: true });
  return _id;
}

async function seedAccounts() {
  const accounts = [...lenders, ...members];
  for (const [index, [key, name, previousName]] of accounts.entries()) {
    const _id = idFor('User', key);
    const existing = await User.findById(_id).select('name').lean();
    if (existing) {
      if (existing.name === previousName) {
        await User.updateOne({ _id, name: previousName }, { $set: { name } }, { runValidators: true });
      }
      continue;
    }
    const isLender = index < lenders.length;
    const neighborhood = neighborhoods[index % neighborhoods.length];
    const user = new User({
      _id, username: `demo.${key}`, name, email: `demo.${key}@shareshed.invalid`,
      phone: `+20155550${String(index + 1).padStart(4, '0')}`,
      address: { street: `${10 + index} Demo Lane, ${neighborhood}`, city: 'Cairo', country: 'Egypt' },
      lenderStatus: isLender ? 'verified' : 'none',
      notificationPrefs: { reservations: false, promotions: false, communityNotices: false },
    });
    await user.setPassword(password);
    const { _id: userId, ...fields } = user.toObject();
    await user.validate();
    const now = new Date();
    await User.updateOne({ _id: userId }, { $setOnInsert: { ...fields, createdAt: now, updatedAt: now } },
      { upsert: true, timestamps: false, runValidators: true });
  }
}

async function seedListings(categories) {
  const now = Date.now();
  const entries = Object.entries(listings);
  let count = 0;
  for (const [categoryIndex, [category, sets]] of entries.entries()) {
    for (const [index, [slug, title, otherTitle, deposit, description, tag]] of sets.entries()) {
      for (const variant of [0, 1]) {
        const slot = categoryIndex * sets.length + index;
        const ownerIndex = (slot + variant * 3) % lenders.length;
        const [ownerKey] = lenders[ownerIndex];
        const offered = (slot + variant) % 3 === 0;
        const depositAmount = variant && deposit > 0 ? deposit + 25 : deposit;
        const photo = photoName(slug, variant);
        const recency = variant * 24 + index * entries.length + categoryIndex;
        await insertFixture(Item, `${slug}-${variant + 1}`, {
          owner: idFor('User', ownerKey),
          title: variant ? otherTitle : title,
          category: categories[category]._id,
          description,
          conditionNotes: conditions[(index + variant) % conditions.length],
          depositAmount,
          photos: [{ url: `/uploads/demo-catalog/${photo}`, originalName: photo }],
          pickup: { location: neighborhoods[ownerIndex], instructions: pickupNotes[(index + variant) % pickupNotes.length] },
          rules: { maxBorrowDays: 4 + (slot % 4) },
          delivery: { offered, fee: offered && depositAmount ? 25 + 10 * (slot % 3) : 0 },
          tags: [category, tag],
          createdAt: new Date(now - recency * 30),
        });
        count++;
      }
    }
  }
  return count;
}

async function seedActivity(admin) {
  const today = Date.parse(new Date().toISOString().slice(0, 10));
  const day = (offset) => new Date(today + offset * 86400000);
  const time = (offset) => new Date(+day(offset) + 12 * 3600000);
  const borrower = idFor('User', 'yara');
  const lender = idFor('User', 'mariam');
  const hammer = idFor('Item', 'claw-hammer-1');
  const tent = idFor('Item', 'camping-tent-1');
  const trowel = idFor('Item', 'hand-trowel-1');
  const base = { borrower, lender, deposit: { base: 0, amount: 0 }, createdAt: day(-12) };

  const bookings = [
    ['pending', { item: hammer, status: 'pending', startDate: day(3), endDate: day(5), createdAt: new Date() }],
    ['delivery', {
      item: tent, status: 'confirmed', startDate: day(6), endDate: day(9),
      fulfilment: { method: 'delivery', deliveryAddress: '18 Demo Lane, Maadi, Cairo', deliveryFee: 0, deliveryStatus: 'preparing' },
    }],
    ['active', { item: trowel, status: 'active', startDate: day(-1), endDate: day(2), pickedUpAt: time(-1) }],
    ['completed', {
      item: trowel, status: 'completed', startDate: day(-9), endDate: day(-6),
      pickedUpAt: time(-9), returnedAt: time(-7), completedAt: time(-7), returnCondition: 'good',
    }],
    ['cancelled', {
      item: hammer, status: 'cancelled', startDate: day(8), endDate: day(10),
      cancellation: { at: day(-3), by: borrower, reason: 'Plans changed', refundAmount: 0 },
    }],
  ];
  for (const [key, booking] of bookings) await insertFixture(Reservation, key, { ...base, ...booking });
  for (const item of [hammer, tent, idFor('Item', 'pressure-washer-1')]) {
    await Favorite.updateOne({ user: borrower, item }, {
      $setOnInsert: { user: borrower, item, createdAt: day(-5), updatedAt: day(-5) },
    }, { upsert: true, timestamps: false, runValidators: true });
  }

  await insertFixture(Notice, 'weekend-pickups', {
    postedBy: admin._id, title: 'Arrange weekend pickups early',
    body: 'Planning a weekend project? Ask your lender about pickup times as soon as your reservation is confirmed.',
  });
  await insertFixture(Notice, 'workshop-sessions', {
    postedBy: admin._id, title: 'Tool care before you return',
    body: 'Wipe dust off tools, empty hoses and tanks, and check kits for loose parts. Add a return photo if there is new wear.',
  });
  await insertFixture(Report, 'listing-photos', {
    reporter: borrower, targetType: 'item', targetItem: idFor('Item', 'socket-set-2'),
    reason: 'Listing description needs clarification',
    details: 'Please ask the lender to confirm which socket sizes are in the kit.',
  });
}

async function run() {
  if (!['development', 'test'].includes(env.NODE_ENV)) throw new Error('The demo seed is available only in development or test.');
  await Promise.all(Object.values(listings).flatMap((sets) => sets.flatMap(([slug]) =>
    [0, 1].map((variant) => access(path.join(photoDir, photoName(slug, variant)))),
  )));
  try {
    await connectDB();
    const { categories, admin } = await seedBase();
    if (process.argv.includes('--repair-ladders-multiplier')) {
      const result = await Category.updateOne(
        { _id: categories['ladders-access']._id, depositMultiplier: 10 },
        { $set: { depositMultiplier: 1 } },
      );
      if (result.modifiedCount) console.log('Restored the demo Ladders & Access deposit multiplier to ×1.');
    }
    await seedAccounts();
    const count = await seedListings(categories);
    await seedActivity(admin);
    console.log(`Demo seed ready. ${lenders.length + members.length} additional accounts and ${count} photographed listings.`);
    console.log(`Start with demo.yara (borrower) or demo.mariam (lender). Demo password: ${password}`);
    console.log('The standard seed logins (admin, member1, member2, lender1, applicant) are also ready.');
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => { console.error(error.message); process.exitCode = 1; });
