/** PASSWORD RESET OTP (owner: Member 2). Store only a HASH of the OTP. Documents auto-delete after expiresAt (TTL). */
const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    otpHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } }, // TTL index
    attempts: { type: Number, default: 0 }, // lock after 5 wrong tries
    usedAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model('PasswordResetOtp', schema);
