const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema(
  {
    promoCode: { type: Schema.Types.ObjectId, ref: 'PromoCode', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reservation: { type: Schema.Types.ObjectId, ref: 'Reservation' },
    // Checkout records new discounts on the reservation in the same transaction.
    discountApplied: { type: Number, min: 0, required() { return !this.reservation; } },
  },
  { timestamps: true }
);

schema.index({ reservation: 1 }, {
  unique: true,
  partialFilterExpression: { reservation: { $type: 'objectId' } },
});
schema.index({ promoCode: 1, user: 1 });
schema.index({ createdAt: -1, _id: -1 });

module.exports = mongoose.model('PromoRedemption', schema);
