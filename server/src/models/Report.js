const { Schema, model } = require('mongoose');

const schema = new Schema({
  reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  targetType: { type: String, enum: ['item', 'user'], required: true },
  targetItem: { type: Schema.Types.ObjectId, ref: 'Item' },
  targetUser: { type: Schema.Types.ObjectId, ref: 'User' },
  reason: { type: String, required: true, trim: true, maxlength: 150 },
  details: { type: String, trim: true, maxlength: 4000 },
  status: { type: String, enum: ['open', 'dismissed', 'actioned'], default: 'open', index: true },
  action: { type: String, enum: ['none', 'flagged', 'removed'], default: 'none' },
  supportTicketId: { type: Schema.Types.ObjectId, ref: 'SupportTicket' },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  adminNotes: { type: String, trim: true, maxlength: 1000 },
}, { timestamps: true });

schema.index({ supportTicketId: 1 }, { unique: true, sparse: true });
module.exports = model('Report', schema);
