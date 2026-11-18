/**
 * WAITLIST ENTRY (Sprint 2 model; extended by Member 7 for Req 65-67)
 * One document = one member waiting for specific dates of one item.
 *   waiting   -> in the queue
 *   promoted  -> holds an expiring offer (offerExpiresAt + M1 holdId); the dates are held for this member only
 *   fulfilled -> the offeree booked (detected from their reservation)
 *   expired   -> offer timed out / dates passed;   left -> member left (Req 66)
 * activeKey enforces "one live entry per member + item + exact dates" (same pattern as HouseholdLink).
 */
const mongoose = require('mongoose');
const { Schema } = mongoose;
const schema = new Schema(
  {
    item: { type: Schema.Types.ObjectId, ref: 'Item', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    priority: { type: Number, default: 3 },    // membership tier priority (1 = top); refreshed when promoting
    status: { type: String, enum: ['waiting', 'promoted', 'fulfilled', 'left', 'expired'], default: 'waiting' },
    promotedAt: Date,
    offerExpiresAt: Date,                       // set when promoted: the claim deadline
    holdId: Schema.Types.ObjectId,              // M1 inventory hold claimed for the offer (passed to /checkout as holdId)
    leftAt: Date,
    activeKey: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

schema.pre('validate', function setActiveKey(next) {
  if ((this.status === 'waiting' || this.status === 'promoted') && this.startDate && this.endDate) {
    this.activeKey = [this.item, this.user, this.startDate.toISOString().slice(0, 10), this.endDate.toISOString().slice(0, 10)].join('_');
  } else {
    this.activeKey = undefined;
  }
  next();
});

schema.index({ item: 1, status: 1, priority: 1, createdAt: 1 });
schema.index({ user: 1, status: 1 });
schema.index({ status: 1, offerExpiresAt: 1 });
module.exports = mongoose.model('WaitlistEntry', schema);
