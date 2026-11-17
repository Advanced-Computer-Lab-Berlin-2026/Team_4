const { Schema, model } = require('mongoose');

const replySchema = new Schema({
  author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  authorRole: { type: String, enum: ['admin', 'member'] },
  message: { type: String, required: true, maxlength: 4000, trim: true },
  at: { type: Date, default: Date.now },
});

const schema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  subject: { type: String, required: true, trim: true, maxlength: 150 },
  message: { type: String, required: true, trim: true, maxlength: 4000 },
  category: {
    type: String,
    enum: ['account', 'reservation', 'payment', 'listing_report', 'user_report', 'technical', 'other'],
    default: 'other',
  },
  relatedTargetType: { type: String, enum: ['none', 'item', 'user'], default: 'none' },
  relatedTargetId: Schema.Types.ObjectId,
  status: { type: String, enum: ['open', 'in_progress', 'resolved', 'closed'], default: 'open', index: true },
  replies: [replySchema],
  resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  resolvedAt: Date,
  resolutionNote: { type: String, maxlength: 4000 },
  linkedReport: { type: Schema.Types.ObjectId, ref: 'Report' },
}, { timestamps: true });

schema.index({ user: 1, updatedAt: -1 });
module.exports = model('SupportTicket', schema);
