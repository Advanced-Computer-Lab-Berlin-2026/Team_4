/**
 * PAYMENT OPERATION (owner: Member 2). One row per money operation (charge, refund, release, late fee, ...).
 * The unique idempotencyKey is what makes a retried request or a duplicate webhook run exactly once.
 */
const mongoose = require('mongoose');
const { Schema } = mongoose;

const KINDS = ['charge', 'card_payment', 'release_deposit', 'refund', 'forfeiture', 'late_fee', 'referral_credit', 'adjustment'];
const PURPOSES = ['deposit', 'membership', 'cancellation', 'damage', 'late_fee', 'referral', 'adjustment'];

const schema = new Schema(
  {
    idempotencyKey: { type: String, required: true, unique: true, trim: true, maxlength: 200 },
    kind: { type: String, enum: KINDS, required: true },
    purpose: { type: String, enum: PURPOSES, required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reference: {
      type: { type: String, enum: ['checkout', 'reservation', 'membership', 'referral', 'manual'] },
      id: { type: Schema.Types.ObjectId },
    },
    amountMinor: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'EGP' },
    status: { type: String, enum: ['pending', 'succeeded', 'failed'], default: 'pending', index: true },
    requestHash: { type: String, required: true }, // detects a key reused with different inputs
    result: Schema.Types.Mixed, // returned again on a replay
    outstandingMinor: { type: Number, default: 0, min: 0 }, // late fees only: part not yet paid (low wallet)
    stripePaymentIntentId: { type: String, index: { unique: true, sparse: true } }, // card payments: Stripe's payment id
    // Card payments (Req 51): the Stripe-hosted payment page for this operation. No card data is ever stored.
    stripe: {
      sessionId: { type: String, index: { unique: true, sparse: true } },
      url: String,           // where the borrower is sent to pay
      expiresAt: Date,       // when Stripe closes the page (fixed at creation, so retries send identical requests)
      membershipTitle: String, // keep retry parameters stable if the tier is renamed
      returnPath: String,    // app page Stripe sends the borrower back to
      refundId: String,      // retry polls this provider refund until it settles
      refundAttempt: Number, // increments only when Stripe confirms the previous refund failed
    },
    completedAt: Date,
  },
  { timestamps: true }
);

schema.index({ 'reference.type': 1, 'reference.id': 1, kind: 1 });

module.exports = mongoose.model('PaymentOperation', schema);
module.exports.KINDS = KINDS;
module.exports.PURPOSES = PURPOSES;
