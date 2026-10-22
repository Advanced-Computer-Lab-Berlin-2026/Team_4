/** SPRINT 2 model - defined now so the schema is stable and Sprint 1 code can reference it. Not used by Sprint 1 features. */
const mongoose = require('mongoose');
const { Schema } = mongoose;
const schema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, required: true }, // reservation_confirmed | reservation_cancelled | waitlist_available | delivery | due_reminder | membership_renewal | favorite_available | notice ...
    category: { type: String, enum: ['reservations', 'promotions', 'communityNotices', 'system'], default: 'system' },
    title: { type: String, required: true },
    message: String,
    link: String,
    readAt: Date,
    email: { sent: { type: Boolean, default: false }, sentAt: Date }, // NFR 13: email within 1 minute
  },
  { timestamps: true }
);
schema.index({ user: 1, readAt: 1, createdAt: -1 });
module.exports = mongoose.model('Notification', schema);
