/** SPRINT 2 model - defined now so the schema is stable and Sprint 1 code can reference it. Not used by Sprint 1 features. */
const mongoose = require('mongoose');
const { Schema } = mongoose;
const schema = new Schema(
  {
    reservation: { type: Schema.Types.ObjectId, ref: 'Reservation', required: true, unique: true },
    item: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
    reportedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    borrower: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    description: { type: String, required: true },
    status: { type: String, enum: ['open', 'decided', 'disputed', 'resolved'], default: 'open', index: true },
    decision: { forfeitAmount: Number, note: String, decidedBy: { type: Schema.Types.ObjectId, ref: 'User' }, decidedAt: Date },
    dispute: { reason: String, at: Date },
    resolution: { finalForfeitAmount: Number, note: String, resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' }, resolvedAt: Date },
  },
  { timestamps: true }
);
module.exports = mongoose.model('DamageReport', schema);
