/**
 * WALLET TRANSACTION (owner: Member 2). Ledger row for every wallet change (Req 36, 52, 77, 78, NFR 14).
 * Written ONLY by services/payments/wallet.js, in the same transaction as the balance change.
 */
const mongoose = require('mongoose');
const { Schema } = mongoose;
const schema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // lender_payout = money a lender receives from a borrower's forfeited deposit or late fee
    type: { type: String, enum: ['deposit_hold', 'deposit_release', 'refund', 'late_fee', 'forfeit', 'lender_payout', 'membership', 'referral_credit', 'adjustment'], required: true },
    amount: { type: Number, required: true },   // signed: + credit, - debit (EGP)
    balanceAfter: { type: Number, required: true },
    amountMinor: { type: Number, required: true }, // signed, piastres (source of truth)
    balanceAfterMinor: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'EGP' },
    reservation: { type: Schema.Types.ObjectId, ref: 'Reservation' },
    reference: {
      type: { type: String, enum: ['checkout', 'reservation', 'membership', 'referral', 'manual'] },
      id: { type: Schema.Types.ObjectId },
    },
    operation: { type: Schema.Types.ObjectId, ref: 'PaymentOperation', index: true },
    note: String,
  },
  { timestamps: true }
);
schema.index({ user: 1, createdAt: -1 }); // "my ledger, newest first"
module.exports = mongoose.model('WalletTransaction', schema);
