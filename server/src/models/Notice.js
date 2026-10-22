/** COMMUNITY NOTICE (owner: Member 9). Req 41 (admin posts), Req 42 (members view). */
const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 150 },
    body: { type: String, required: true, trim: true, maxlength: 5000 },
    postedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    pinned: { type: Boolean, default: false },
  },
  { timestamps: true }
);
schema.index({ pinned: -1, createdAt: -1 });

module.exports = mongoose.model('Notice', schema);
