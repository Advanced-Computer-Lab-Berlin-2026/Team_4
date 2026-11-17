const mongoose = require('mongoose');
const BookingLock = require('../../models/BookingLock');

async function lockBooking(keys, session) {
  if (!session?.inTransaction()) throw new Error('An active booking transaction is required');
  for (const key of [...new Set(keys)].sort()) {
    await BookingLock.updateOne({ _id: key }, { $inc: { revision: 1 } }, { upsert: true, session });
  }
}

async function transactBooking(keys, work, session) {
  if (session) {
    await lockBooking(keys, session);
    return work(session);
  }

  // Older MongoDB releases can return a duplicate key when concurrent transactions
  // both create the same lock. Retry with a new snapshot in that case.
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await mongoose.connection.transaction(async (transaction) => {
        await lockBooking(keys, transaction);
        return work(transaction);
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    } catch (error) {
      if (error.code !== 11000 || attempt >= 3) throw error;
    }
  }
}

const bookingKeys = (itemIds, borrowerId) => [
  ...itemIds.map((id) => 'item:' + id),
  ...(borrowerId ? ['borrower:' + borrowerId] : []),
];

module.exports = { bookingKeys, transactBooking };
