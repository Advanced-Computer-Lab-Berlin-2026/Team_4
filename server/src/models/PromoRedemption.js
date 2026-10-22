/** SPRINT 2 model - defined now so the schema is stable and Sprint 1 code can reference it. Not used by Sprint 1 features. */
const mongoose = require('mongoose');
const { Schema } = mongoose;
const schema = new Schema(
  {
    promoCode: { type: Schema.Types.ObjectId, ref: 'PromoCode', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reservation: { type: Schema.Types.ObjectId, ref: 'Reservation' },
    discountApplied: { type: Number, required: true },
  },
  { timestamps: true }
);
module.exports = mongoose.model('PromoRedemption', schema);
