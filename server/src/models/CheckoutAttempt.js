const { Schema, model } = require('mongoose');

const line = new Schema({
  reservationId: { type: Schema.Types.ObjectId, required: true },
  entryId: Schema.Types.ObjectId,
  item: { type: Schema.Types.ObjectId, required: true },
  lender: { type: Schema.Types.ObjectId, required: true },
  title: String,
  startDate: Date,
  endDate: Date,
  amountMinor: Number,
  deposit: {
    base: Number, amount: Number, categoryMultiplier: Number,
    tierDiscountPercent: Number, promoDiscount: Number,
  },
  fulfilment: {
    method: { type: String, enum: ['pickup', 'delivery'] },
    deliveryAddress: String,
    deliveryFee: Number,
  },
  promoCode: Schema.Types.ObjectId,
}, { _id: false });

const schema = new Schema({
  borrower: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  operationKey: { type: String, required: true },
  requestHash: { type: String, required: true },
  method: { type: String, enum: ['wallet', 'card'], required: true },
  status: { type: String, enum: ['awaiting_payment', 'completed', 'failed', 'refund_due'], required: true },
  expiresAt: Date,
  lines: [line],
  amountMinor: { type: Number, required: true },
  currency: { type: String, required: true },
  paymentReference: String,
  failure: String,
}, { timestamps: true });

schema.index({ borrower: 1, operationKey: 1 }, { unique: true });
schema.index({ status: 1, expiresAt: 1 });

module.exports = model('CheckoutAttempt', schema);
