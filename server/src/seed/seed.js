/**
 * Seed the database with demo data so every member can work independently from day 1.
 *   npm run seed          -> insert missing demo data (safe to re-run)
 *   npm run seed:reset    -> DROP the whole database first, then seed  (careful!)
 *
 * All seeded users share the password:  Passw0rd!
 *   admin      (role admin)
 *   member1    (member; same address as member2 -> use for household-link testing)
 *   member2    (member; same address as member1)
 *   lender1    (verified lender, owns the demo items)
 *   applicant  (member who has NOT applied yet -> use for the lender-application flow)
 */
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const {
  User, Category, Item, MembershipTier, Notice,
} = require('../models');

const PASSWORD = 'Passw0rd!';
const HOME = { street: '12 Nile Corniche', city: 'Cairo', state: 'Cairo', postalCode: '11511', country: 'Egypt' };
const OTHER = { street: '5 Palm Street', city: 'Giza', state: 'Giza', postalCode: '12611', country: 'Egypt' };
const PLACEHOLDER = { url: '/uploads/placeholder.svg' };

async function upsertUser(data) {
  let u = await User.findOne({ username: data.username });
  if (u) return u;
  const { password, ...rest } = data;
  u = new User(rest);
  await u.setPassword(password || PASSWORD);
  await u.save();
  return u;
}

(async () => {
  await connectDB();
  if (process.argv.includes('--reset')) {
    await mongoose.connection.dropDatabase();
    console.log('Database dropped.');
  }
  await Promise.all(Object.values(require('../models')).map((m) => m.init())); // build indexes

  // ---- Membership tiers (spec: Basic / Plus / Premium) -------------------------------------------
  const tiers = [
    { name: 'Basic', annualFee: 0, depositDiscountPercent: 0, waitlistPriority: 3, description: 'No fee, standard deposits, standard waitlist priority.' },
    { name: 'Plus', annualFee: 150, depositDiscountPercent: 10, waitlistPriority: 2, description: '150 EGP/year, 10% lower deposits, 2nd priority in waitlists.' },
    { name: 'Premium', annualFee: 300, depositDiscountPercent: 20, waitlistPriority: 1, maxConcurrentReservations: 5, description: '300 EGP/year, 20% lower deposits, top waitlist priority, up to 5 concurrent reservations.' },
  ];
  for (const t of tiers) await MembershipTier.updateOne({ name: t.name }, { $setOnInsert: t }, { upsert: true });

  // ---- Categories ---------------------------------------------------------------------------------
  const cats = [
    { name: 'Power Tools', slug: 'power-tools', icon: '🔌', depositMultiplier: 1.5, description: 'Drills, saws, sanders and more.' },
    { name: 'Hand Tools', slug: 'hand-tools', icon: '🔧', description: 'Hammers, wrenches, screwdriver sets.' },
    { name: 'Ladders & Access', slug: 'ladders-access', icon: '🪜', description: 'Ladders, scaffolds and steps.' },
    { name: 'Camping & Outdoors', slug: 'camping-outdoors', icon: '⛺', description: 'Tents, stoves, sleeping bags.' },
    { name: 'Cleaning Equipment', slug: 'cleaning-equipment', icon: '🧽', description: 'Pressure washers, steam cleaners, vacuums.' },
    { name: 'Garden', slug: 'garden', icon: '🌱', description: 'Lawn mowers, trimmers, hoses.' },
  ];
  for (const c of cats) await Category.updateOne({ slug: c.slug }, { $setOnInsert: c }, { upsert: true });
  const cat = Object.fromEntries((await Category.find()).map((c) => [c.slug, c]));

  // ---- Users --------------------------------------------------------------------------------------
  await upsertUser({ username: 'admin', name: 'Site Admin', email: 'admin@shareshed.local', phone: '+201000000001', address: HOME, role: 'admin' });
  await upsertUser({ username: 'member1', name: 'Mona Member', email: 'member1@shareshed.local', phone: '+201000000002', address: HOME });
  await upsertUser({ username: 'member2', name: 'Karim Member', email: 'member2@shareshed.local', phone: '+201000000003', address: HOME });
  const lender = await upsertUser({ username: 'lender1', name: 'Layla Lender', email: 'lender1@shareshed.local', phone: '+201000000004', address: OTHER, lenderStatus: 'verified', trustScore: 80 });
  await upsertUser({ username: 'applicant', name: 'Adam Applicant', email: 'applicant@shareshed.local', phone: '+201000000005', address: OTHER });
  const admin = await User.findOne({ username: 'admin' });

  // ---- Items (owned by lender1) -------------------------------------------------------------------
  if ((await Item.countDocuments({ owner: lender._id })) === 0) {
    const mk = (title, slug, deposit, description, extra = {}) => ({
      owner: lender._id, title, category: cat[slug]._id, depositAmount: deposit, description,
      conditionNotes: 'Good working condition, minor cosmetic wear.', photos: [PLACEHOLDER],
      pickup: { location: 'Giza - 5 Palm Street, ground floor', instructions: 'Call 10 minutes before arriving.' }, ...extra,
    });
    await Item.insertMany([
      mk('Bosch 18V Cordless Drill', 'power-tools', 400, 'Powerful cordless drill with two batteries and a bit set.', { rules: { maxBorrowDays: 7, minTrustScore: 0 } }),
      mk('Circular Saw 1400W', 'power-tools', 600, 'Corded circular saw with a fresh blade.', { rules: { maxBorrowDays: 3, minTrustScore: 40 } }),
      mk('Aluminium Extension Ladder 4m', 'ladders-access', 250, 'Lightweight 4m extension ladder.'),
      mk('4-Person Camping Tent', 'camping-outdoors', 200, 'Waterproof 4-person tent, easy pitch.'),
      mk('Pressure Washer 1800W', 'cleaning-equipment', 500, 'Great for cars, patios and walls.'),
      mk('Garden Hedge Trimmer', 'garden', 180, 'Electric hedge trimmer, 60cm blade.'),
      mk('Socket & Wrench Set (120 pc)', 'hand-tools', 150, 'Complete metric + imperial set in a case.'),
      mk('Old Step Stool (archived demo)', 'ladders-access', 50, 'Archived listing for testing Req 15.', { isArchived: true, archivedAt: new Date() }),
    ]);
  }

  // ---- Notice -------------------------------------------------------------------------------------
  if ((await Notice.countDocuments()) === 0) {
    await Notice.create({ title: 'Welcome to ShareShed!', body: 'Borrow before you buy. Be kind, return items on time, and report any damage honestly.', postedBy: admin._id, pinned: true });
  }

  console.log('\nSeed complete. Login (password for all: ' + PASSWORD + ')');
  console.log('  admin | member1 | member2 | lender1 (verified lender) | applicant');
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
