/** SPRINT 2 model - defined now so the schema is stable and Sprint 1 code can reference it. Not used by Sprint 1 features. */
// Ledger for every wallet change (supports Req 36, 52, 77, 78 and NFR 14 auditability).
const mongoose = require('mongoose');
const { Schema } = mongoose;
const schema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['deposit_hold', 'deposit_release', 'refund', 'late_fee', 'forfeit', 'membership', 'referral_credit', 'adjustment'], required: true },
    amount: { type: Number, required: true },   // signed: + credit, - debit (EGP)
    balanceAfter: { type: Number, required: true },
    reservation: { type: Schema.Types.ObjectId, ref: 'Reservation' },
    note: String,
  },
  { timestamps: true }
);
module.exports = mongoose.model('WalletTransaction', schema);
