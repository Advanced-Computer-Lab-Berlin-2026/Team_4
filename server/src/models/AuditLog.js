/** SPRINT 2 model - defined now so the schema is stable and Sprint 1 code can reference it. Not used by Sprint 1 features. */
// NFR 14: every deposit/refund calculation is logged with timestamp + reservation id.
const mongoose = require('mongoose');
const { Schema } = mongoose;
const schema = new Schema(
  {
    action: { type: String, required: true }, // deposit_calculated | deposit_refunded | deposit_forfeited | late_fee_applied ...
    reservation: { type: Schema.Types.ObjectId, ref: 'Reservation', index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    amount: Number,
    details: Schema.Types.Mixed, // inputs of the calculation (base, multiplier, discounts, ...)
  },
  { timestamps: { createdAt: 'at', updatedAt: false } }
);
module.exports = mongoose.model('AuditLog', schema);
