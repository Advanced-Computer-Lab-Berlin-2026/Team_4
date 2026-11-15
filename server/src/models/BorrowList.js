/**
 * BORROW LIST (owner: Member 5 - Req 46, 47, 48)
 * One draft list per member: items + the dates they want, before Member 1's checkout (Req 49) turns them into
 * reservations. It does NOT hold the items - checkout re-checks availability. Rules live in services/borrow/borrowList.js.
 */
const mongoose = require('mongoose');
const { Schema } = mongoose;

const entrySchema = new Schema({
  item: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
  startDate: { type: Date, required: true }, // UTC midnight of the first day
  endDate: { type: Date, required: true },   // UTC midnight of the last day (inclusive)
  addedAt: { type: Date, default: Date.now },
});

const schema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    entries: [entrySchema],
  },
  { timestamps: true }
);
module.exports = mongoose.model('BorrowList', schema);
