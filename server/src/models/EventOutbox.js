const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema(
  {
    type: { type: String, required: true, index: true },
    aggregateId: { type: Schema.Types.ObjectId, required: true, index: true },
    recipients: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    payload: { type: Schema.Types.Mixed, default: {} },
    eventKey: { type: String, required: true, unique: true },
    status: { type: String, enum: ['pending', 'processing', 'sent', 'failed'], default: 'pending', index: true },
    attempts: { type: Number, default: 0 },
    availableAt: { type: Date, default: Date.now, index: true },
    lockedAt: Date,
    lastError: String,
    failedAt: Date,
    sentAt: Date,
  },
  { timestamps: true }
);

schema.index({ status: 1, availableAt: 1, createdAt: 1 });

module.exports = mongoose.model('EventOutbox', schema);
