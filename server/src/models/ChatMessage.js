/** SPRINT 2 model - defined now so the schema is stable and Sprint 1 code can reference it. Not used by Sprint 1 features. */
const mongoose = require('mongoose');
const { Schema } = mongoose;
const schema = new Schema(
  {
    reservation: { type: Schema.Types.ObjectId, ref: 'Reservation', required: true, index: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    readAt: Date,
  },
  { timestamps: true }
);
module.exports = mongoose.model('ChatMessage', schema);
