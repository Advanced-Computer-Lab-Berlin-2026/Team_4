/** SPRINT 2 model - defined now so the schema is stable and Sprint 1 code can reference it. Not used by Sprint 1 features. */
const mongoose = require('mongoose');
const { Schema } = mongoose;
const schema = new Schema(
  {
    reservation: { type: Schema.Types.ObjectId, ref: 'Reservation', required: true },
    reviewer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reviewee: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    direction: { type: String, enum: ['borrower_to_lender', 'lender_to_borrower'], required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 1500 },
  },
  { timestamps: true }
);
schema.index({ reservation: 1, reviewer: 1 }, { unique: true });
module.exports = mongoose.model('Review', schema);
