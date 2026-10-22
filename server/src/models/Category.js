/**
 * CATEGORY (owner: Member 6)
 * Categories are DATA, not an enum -> new categories need no code/schema change (NFR 11).
 * depositMultiplier (Req 40) multiplies an item's deposit for "high-value" categories (e.g. power tools).
 */
const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, trim: true },
    icon: { type: String, trim: true }, // emoji or icon name
    depositMultiplier: { type: Number, default: 1, min: 1 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Category', schema);
