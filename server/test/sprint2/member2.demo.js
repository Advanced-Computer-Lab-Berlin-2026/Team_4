// Member 2 - DEV ONLY demo data, so the Wallet and Late fees pages have something to show before M1's checkout
// and M5's returns exist. Uses the real payment services, so the balance, ledger and audit stay consistent.
// Safe to run more than once: fixed idempotency keys mean each demo operation happens only once.
//   node server/test/sprint2/member2.demo.js            (default user: member1)
//   node server/test/sprint2/member2.demo.js member2
const mongoose = require('mongoose');
const connectDB = require('../../src/config/db');
const User = require('../../src/models/User');
const Item = require('../../src/models/Item');
const Reservation = require('../../src/models/Reservation');
const PaymentOperation = require('../../src/models/PaymentOperation');
const payment = require('../../src/services/payments/payment');
const wallet = require('../../src/services/payments/wallet');
const audit = require('../../src/services/payments/audit');

const DAY = 24 * 60 * 60 * 1000;

async function main() {
  await connectDB();
  const username = process.argv[2] || 'member1';
  const user = await User.findOne({ username });
  if (!user) throw new Error(`No user "${username}" - run npm run seed first`);
  const key = (name) => `demo:${user._id}:${name}`;

  // 1. Money in: two credits (stand-ins for refunds/rewards until those flows exist).
  await payment.creditReferral({ userId: user._id, amountMinor: 50000, referralId: user._id, idempotencyKey: key('credit-1') });
  await payment.creditReferral({ userId: user._id, amountMinor: 12550, referralId: user._id, idempotencyKey: key('credit-2') });

  // 2. A finished, late reservation of a real seeded item (stand-in for M1/M5 data).
  //    Found again on later runs through its demo deposit operation, so it is created only once.
  const demoDeposit = await PaymentOperation.findOne({ idempotencyKey: key('deposit') });
  let reservation = demoDeposit ? await Reservation.findById(demoDeposit.reference.id) : null;
  if (!reservation) {
    const item = await Item.findOne({ owner: { $ne: user._id } });
    if (!item) throw new Error('No items found - run npm run seed first');
    reservation = await Reservation.create({
      item: item._id, borrower: user._id, lender: item.owner, status: 'completed',
      startDate: new Date(Date.now() - 10 * DAY), endDate: new Date(Date.now() - 5 * DAY), returnedAt: new Date(Date.now() - 2 * DAY),
      deposit: { amount: 200, status: 'held' },
    });
  }

  // 3. Wallet deposit for it.
  await payment.charge({ userId: user._id, amountMinor: 20000, purpose: 'deposit', reference: { type: 'reservation', id: reservation._id }, idempotencyKey: key('deposit') });

  // 4. A late fee of EGP 120 for 3 days late, of which only EGP 40 is paid now -> EGP 80 outstanding.
  //    (Step 6 replaces this with the real applyLateFee calculation.)
  const lateFeeMinor = 12000;
  const chargedMinor = 4000;
  const reference = { type: 'reservation', id: reservation._id };
  const result = await payment.runOperation(
    { idempotencyKey: key('late-fee'), kind: 'late_fee', purpose: 'late_fee', userId: user._id, reference, amountMinor: lateFeeMinor },
    async ({ session, operation }) => {
      await wallet.applyChange({ userId: user._id, deltaMinor: -chargedMinor, type: 'late_fee', reference, operationId: operation._id, note: 'Late fee (demo)' }, { session });
      await PaymentOperation.updateOne({ _id: operation._id }, { $set: { outstandingMinor: lateFeeMinor - chargedMinor } }, { session });
      await audit.record({ action: 'late_fee_applied', reservationId: reservation._id, userId: user._id, amountMinor: lateFeeMinor, operationId: operation._id, inputs: { demo: true, daysLate: 3 }, result: { lateFeeMinor, chargedMinor } }, { session });
      return { lateFeeMinor, chargedMinor, daysLate: 3 };
    }
  );

  const balanceMinor = await wallet.getBalanceMinor(user._id);
  console.log(`Demo data ready for ${username}: balance EGP ${(balanceMinor / 100).toFixed(2)}, late fee ${result.replayed ? 'already existed' : 'created'}.`);
  console.log('Open http://localhost:5173/account/wallet (logged in as that user).');
}

main()
  .catch((err) => { console.error(err.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
