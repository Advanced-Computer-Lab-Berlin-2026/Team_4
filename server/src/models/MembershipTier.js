/** SPRINT 2 model - defined now so the schema is stable and Sprint 1 code can reference it. Not used by Sprint 1 features. */
// Tiers are DATA (NFR 11): add a tier by inserting a document, no code change.
const mongoose = require('mongoose');
const schema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },       // Basic | Plus | Premium
    annualFee: { type: Number, default: 0, min: 0 },             // EGP/year
    depositDiscountPercent: { type: Number, default: 0, min: 0, max: 100 },
    waitlistPriority: { type: Number, required: true },          // 1 = top priority
    maxConcurrentReservations: { type: Number },                 // undefined = platform default
    description: String,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);
module.exports = mongoose.model('MembershipTier', schema);
