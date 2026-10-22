/** SPRINT 2 model - defined now so the schema is stable and Sprint 1 code can reference it. Not used by Sprint 1 features. */
const mongoose = require('mongoose');
const { RESERVATION_STATUS, DEPOSIT_STATUS, DELIVERY_STATUS } = require('../config/constants');
const { Schema } = mongoose;
const photoRef = new Schema({ url: String, path: String, takenAt: { type: Date, default: Date.now } }, { _id: false });

const schema = new Schema(
  {
    item: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
    borrower: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    lender: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },   // current agreed return date (updated by approved extensions)
    status: { type: String, enum: RESERVATION_STATUS, default: 'pending', index: true },

    deposit: {
      base: Number, categoryMultiplier: Number, tierDiscountPercent: Number, promoDiscount: Number,
      amount: Number, status: { type: String, enum: DEPOSIT_STATUS, default: 'none' }, forfeited: { type: Number, default: 0 },
    },
    payment: { method: { type: String, enum: ['wallet', 'card'] }, stripePaymentIntentId: String },
    promoCode: { type: Schema.Types.ObjectId, ref: 'PromoCode' },

    fulfilment: {
      method: { type: String, enum: ['pickup', 'delivery'], default: 'pickup' },
      deliveryAddress: String, deliveryFee: { type: Number, default: 0 },
      deliveryStatus: { type: String, enum: DELIVERY_STATUS, default: 'none' },
    },
    pickedUpAt: Date,
    returnedAt: Date,
    conditionPhotos: { pickup: [photoRef], return: [photoRef] },

    extension: { requestedEndDate: Date, status: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' }, decidedAt: Date },
    cancellation: { at: Date, by: { type: Schema.Types.ObjectId, ref: 'User' }, reason: String, refundAmount: Number },
    lateFee: { type: Number, default: 0 },
    remindersSent: { dueSoon: { type: Boolean, default: false } },
  },
  { timestamps: true }
);
// Double-booking prevention (NFR 7) queries this index; enforce atomically in the reservation service.
schema.index({ item: 1, status: 1, startDate: 1, endDate: 1 });

module.exports = mongoose.model('Reservation', schema);
