/** SPRINT 2 model - defined now so the schema is stable and Sprint 1 code can reference it. Not used by Sprint 1 features. */
const mongoose = require('mongoose');
const { Schema } = mongoose;
const schema = new Schema(
  {
    referrer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    referee: { type: Schema.Types.ObjectId, ref: 'User' },        // set when the friend registers
    code: { type: String, required: true },
    status: { type: String, enum: ['sent', 'registered', 'converted'], default: 'sent' },
    creditAmount: { type: Number, default: 0 },
    convertedAt: Date,
  },
  { timestamps: true }
);
module.exports = mongoose.model('Referral', schema);
