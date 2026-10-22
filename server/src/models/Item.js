/**
 * ITEM (owner: Member 5; Members 6, 7, 9 also read/write parts of it - see ownership table)
 *   Member 5 : title, category, description, photos, conditionNotes, depositAmount, isArchived
 *   Member 6 : pickup, rules, manual
 *   Sprint 2 : delivery, tags
 * ALWAYS build public queries with Item.publicFilter() so archived/removed items never leak (Req 15).
 */
const mongoose = require('mongoose');
const { MODERATION_STATUS } = require('../config/constants');
const { Schema } = mongoose;

const photoSchema = new Schema({
  url: { type: String, required: true }, // /uploads/items/<file>
  path: String,                            // relative path on disk (for deletion)
  originalName: String,
});

const itemSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    description: { type: String, required: true, trim: true, maxlength: 4000 },
    photos: [photoSchema],
    conditionNotes: { type: String, trim: true, maxlength: 2000 },
    depositAmount: { type: Number, required: true, min: 0 }, // EGP, BASE deposit (multiplier/discounts applied at reservation time)

    // ---- Member 6 (Req 30, 31, 32)
    pickup: { location: { type: String, trim: true }, instructions: { type: String, trim: true } },
    rules: {
      maxBorrowDays: { type: Number, min: 1 },          // undefined = no limit
      minTrustScore: { type: Number, min: 0, max: 100, default: 0 },
    },
    manual: { url: String, path: String, originalName: String, mimeType: String, uploadedAt: Date },

    // ---- Archive (Req 15): hidden from search, reservation history kept
    isArchived: { type: Boolean, default: false, index: true },
    archivedAt: Date,

    // ---- Moderation (Sprint 2, Req 94)
    moderationStatus: { type: String, enum: MODERATION_STATUS, default: 'ok', index: true },

    // ---- Sprint 2 (Req 69, 92)
    delivery: { offered: { type: Boolean, default: false }, fee: { type: Number, default: 0, min: 0 } },
    tags: [{ type: String, trim: true, lowercase: true }], // lender-set attributes used to suggest alternatives
  },
  { timestamps: true }
);

itemSchema.index({ title: 'text', description: 'text' });
itemSchema.index({ category: 1, isArchived: 1, moderationStatus: 1 });

/** Filter every public/member-facing item query must include. */
itemSchema.statics.publicFilter = function publicFilter(extra = {}) {
  return { isArchived: false, moderationStatus: 'ok', ...extra };
};

module.exports = mongoose.model('Item', itemSchema);
