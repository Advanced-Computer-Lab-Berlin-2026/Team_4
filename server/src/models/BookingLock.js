const mongoose = require('mongoose');

// Incrementing the same document forces concurrent inventory writers to conflict.
const schema = new mongoose.Schema({
  _id: { type: String },
  revision: { type: Number, default: 0 },
}, { versionKey: false });

module.exports = mongoose.model('BookingLock', schema);
