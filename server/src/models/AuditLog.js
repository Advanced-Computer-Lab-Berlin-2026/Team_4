/**
 * AUDIT LOG (owner: Member 2). NFR 14: every quote/deposit/refund/forfeiture/late-fee calculation is logged
 * with timestamp (`at`), reservation id, calculation inputs and the result. Written by services/payments/audit.js.
 */
const mongoose = require('mongoose');
const { Schema } = mongoose;
const schema = new Schema(
  {
    action: { type: String, required: true }, // deposit_charged | deposit_released | refund_credited | deposit_forfeited | late_fee_applied ...
    reservation: { type: Schema.Types.ObjectId, ref: 'Reservation', index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    amount: Number, // EGP (kept for compatibility)
    amountMinor: Number, // piastres
    currency: { type: String, default: 'EGP' },
    operation: { type: Schema.Types.ObjectId, ref: 'PaymentOperation' },
    inputs: Schema.Types.Mixed, // what the calculation used (deposit, rate, hours, days late, ...)
    result: Schema.Types.Mixed, // what it produced
    details: Schema.Types.Mixed, // free-form extra info (kept for compatibility)
  },
  { timestamps: { createdAt: 'at', updatedAt: false } }
);
module.exports = mongoose.model('AuditLog', schema);
