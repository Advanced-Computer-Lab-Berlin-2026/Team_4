const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema(
  {
    code: {
      type: String, required: true, unique: true, uppercase: true, trim: true,
      match: /^[A-Z0-9][A-Z0-9_-]{0,79}$/,
    },
    discountType: { type: String, enum: ['percent', 'fixed'], required: true },
    discountValue: {
      type: Number, required: true,
      validate: {
        validator(value) {
          return Number.isFinite(value) && value > 0 &&
            (this.discountType !== 'percent' || value <= 100) &&
            Number.isSafeInteger(Math.round(value * 100)) && Math.round(value * 100) / 100 === value;
        },
        message: 'Enter a positive discount with at most two decimal places',
      },
    },
    maxRedemptions: { type: Number, min: 1, validate: Number.isSafeInteger },
    redemptionCount: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
    onePerMember: { type: Boolean, default: false },
    validFrom: Date,
    validUntil: Date,
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PromoCode', schema);
