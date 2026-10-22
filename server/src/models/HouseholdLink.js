/**
 * HOUSEHOLD LINK (owner: Member 8)
 * Links two EXISTING accounts (each keeps its own login). Only 'accepted' links give benefits (Req 25, 88).
 * activeKey enforces "at most one pending/accepted link per pair" (declined links are kept for history
 * and do not block a new request).
 */
const mongoose = require('mongoose');
const { HOUSEHOLD_RELATIONS, HOUSEHOLD_STATUS } = require('../config/constants');
const { Schema } = mongoose;

const schema = new Schema(
  {
    requester: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    relation: { type: String, enum: HOUSEHOLD_RELATIONS, required: true },
    status: { type: String, enum: HOUSEHOLD_STATUS, default: 'pending', index: true },
    respondedAt: Date,
    activeKey: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

schema.pre('validate', function setActiveKey(next) {
  if (this.status === 'pending' || this.status === 'accepted') {
    this.activeKey = [String(this.requester), String(this.recipient)].sort().join('_');
  } else {
    this.activeKey = undefined;
  }
  next();
});

module.exports = mongoose.model('HouseholdLink', schema);
