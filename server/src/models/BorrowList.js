/** SPRINT 2 model - defined now so the schema is stable and Sprint 1 code can reference it. Not used by Sprint 1 features. */
const mongoose = require('mongoose');
const { Schema } = mongoose;
const schema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    entries: [{ item: { type: Schema.Types.ObjectId, ref: 'Item', required: true }, startDate: Date, endDate: Date }],
  },
  { timestamps: true }
);
module.exports = mongoose.model('BorrowList', schema);
