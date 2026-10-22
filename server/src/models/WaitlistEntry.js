/** SPRINT 2 model - defined now so the schema is stable and Sprint 1 code can reference it. Not used by Sprint 1 features. */
const mongoose = require('mongoose');
const { Schema } = mongoose;
const schema = new Schema(
  {
    item: { type: Schema.Types.ObjectId, ref: 'Item', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    priority: { type: Number, default: 3 },    // copied from membership tier at join time (1 = top)
    status: { type: String, enum: ['waiting', 'promoted', 'left', 'expired'], default: 'waiting' },
    promotedAt: Date,
  },
  { timestamps: true }
);
schema.index({ item: 1, status: 1, priority: 1, createdAt: 1 });
module.exports = mongoose.model('WaitlistEntry', schema);
