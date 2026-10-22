/** SPRINT 2 model - defined now so the schema is stable and Sprint 1 code can reference it. Not used by Sprint 1 features. */
const mongoose = require('mongoose');
const { Schema } = mongoose;
const schema = new Schema(
  {
    reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: ['item', 'user'], required: true },
    targetItem: { type: Schema.Types.ObjectId, ref: 'Item' },
    targetUser: { type: Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String, required: true },
    details: String,
    status: { type: String, enum: ['open', 'dismissed', 'actioned'], default: 'open', index: true },
    action: { type: String, enum: ['none', 'flagged', 'removed'], default: 'none' },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
  },
  { timestamps: true }
);
module.exports = mongoose.model('Report', schema);
