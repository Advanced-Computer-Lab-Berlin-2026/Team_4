/** SPRINT 2 model - defined now so the schema is stable and Sprint 1 code can reference it. Not used by Sprint 1 features. */
const mongoose = require('mongoose');
const { Schema } = mongoose;
const schema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    eventKey: { type: String, required: true },
    type: { type: String, required: true },
    category: { type: String, enum: ['reservations', 'promotions', 'communityNotices', 'system'], default: 'system' },
    title: { type: String, required: true },
    message: String,
    link: String,
    readAt: Date,
    email: {
      sent: { type: Boolean, default: false },
      status: { type: String, enum: ['pending', 'sent', 'skipped', 'failed'], default: 'pending' },
      sentAt: Date,
      failedAt: Date,
      lastError: String,
    },
  },
  { timestamps: true }
);
schema.index({ user: 1, readAt: 1, createdAt: -1 });
schema.index({ user: 1, eventKey: 1 }, {
  name: 'notification_user_event_key', unique: true, partialFilterExpression: { eventKey: { $type: 'string' } },
});
module.exports = mongoose.model('Notification', schema);
