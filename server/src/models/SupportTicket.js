/** SPRINT 2 model - defined now so the schema is stable and Sprint 1 code can reference it. Not used by Sprint 1 features. */
const mongoose = require('mongoose');
const { Schema } = mongoose;
const schema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subject: { type: String, required: true, trim: true, maxlength: 150 },
    message: { type: String, required: true, trim: true },
    status: { type: String, enum: ['open', 'in_progress', 'resolved'], default: 'open', index: true },
    replies: [{ author: { type: Schema.Types.ObjectId, ref: 'User' }, message: String, at: { type: Date, default: Date.now } }],
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: Date,
  },
  { timestamps: true }
);
module.exports = mongoose.model('SupportTicket', schema);
