/** FAVORITE / WISHLIST (owner: Member 9). Req 37, 38 (and Req 82 notifications in Sprint 2). */
const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    item: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
  },
  { timestamps: true }
);
schema.index({ user: 1, item: 1 }, { unique: true });

module.exports = mongoose.model('Favorite', schema);
