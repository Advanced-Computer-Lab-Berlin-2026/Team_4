/**
 * USER  (owner: Member 1)
 * One collection for every account type:
 *   role 'member' + lenderStatus 'none'      -> regular member
 *   role 'member' + lenderStatus 'pending'   -> applied to be a lender
 *   role 'member' + lenderStatus 'verified'  -> verified lender
 *   role 'admin'                             -> admin
 * Passwords are stored ONLY as salted bcrypt hashes (NFR 3). ALWAYS use setPassword()/checkPassword().
 */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLES, LENDER_STATUS, USER_STATUS, TRUST_SCORE_DEFAULT } = require('../config/constants');

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, lowercase: true, minlength: 3, maxlength: 30, match: [/^[a-z0-9_.]+$/, 'Username may only contain letters, numbers, _ and .'] },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true, match: [/^\S+@\S+\.\S+$/, 'Invalid email address'] },
    phone: { type: String, required: true, unique: true, trim: true, match: [/^\+?[0-9\s-]{7,15}$/, 'Invalid phone number'] },
    address: {
      street: { type: String, required: true, trim: true },
      city: { type: String, required: true, trim: true },
      state: { type: String, trim: true },
      postalCode: { type: String, trim: true },
      country: { type: String, trim: true, default: 'Egypt' },
    },
    passwordHash: { type: String, required: true, select: false },

    role: { type: String, enum: Object.values(ROLES), default: ROLES.MEMBER, index: true },
    lenderStatus: { type: String, enum: Object.values(LENDER_STATUS), default: LENDER_STATUS.NONE, index: true },

    status: { type: String, enum: Object.values(USER_STATUS), default: USER_STATUS.ACTIVE, index: true },
    suspension: { reason: String, at: Date, by: { type: Schema.Types.ObjectId, ref: 'User' } },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User' }, // set when an admin creates another admin (Req 6)

    // ---- Wallet (Req 36). Every change must also write a WalletTransaction (Sprint 2).
    walletBalance: { type: Number, default: 0, min: 0 },

    // ---- Trust (Req 31 reads trustScore; Req 99 recalculates it in Sprint 2)
    trustScore: { type: Number, default: TRUST_SCORE_DEFAULT, min: 0, max: 100 },
    stats: {
      completedReservations: { type: Number, default: 0 },
      onTimeReturns: { type: Number, default: 0 },
      lateReturns: { type: Number, default: 0 },
      damageReports: { type: Number, default: 0 },
      ratingSum: { type: Number, default: 0 },
      ratingCount: { type: Number, default: 0 },
    },

    // ---- Sprint 2 fields (declared now so the schema doesn't change later)
    membership: {
      tier: { type: Schema.Types.ObjectId, ref: 'MembershipTier' }, // null => Basic
      status: { type: String, enum: ['none', 'active', 'cancelled', 'expired'], default: 'none' },
      subscribedAt: Date,
      renewsAt: Date,
    },
    notificationPrefs: {
      reservations: { type: Boolean, default: true },
      promotions: { type: Boolean, default: true },
      communityNotices: { type: Boolean, default: true },
    },
    referralCode: { type: String, unique: true, sparse: true },
    referredBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

userSchema.index({ name: 1 });

/** Hash with a per-password random salt (bcrypt, cost 10). Does NOT save - call user.save() after. */
userSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await bcrypt.hash(plain, 10);
};

/** NOTE: passwordHash is select:false -> load with  User.findOne(...).select('+passwordHash')  */
userSchema.methods.checkPassword = function checkPassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.methods.isVerifiedLender = function isVerifiedLender() {
  return this.role === ROLES.MEMBER && this.lenderStatus === LENDER_STATUS.VERIFIED;
};

userSchema.set('toJSON', {
  transform: (doc, ret) => { delete ret.passwordHash; delete ret.__v; return ret; },
});

module.exports = mongoose.model('User', userSchema);
