const { Schema, model } = require('mongoose');

const schema = new Schema({
  attempt: { type: Schema.Types.ObjectId, ref: 'CheckoutAttempt', index: true },
  item: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
  borrower: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

schema.index({ item: 1, expiresAt: 1, startDate: 1, endDate: 1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = model('ReservationHold', schema);
