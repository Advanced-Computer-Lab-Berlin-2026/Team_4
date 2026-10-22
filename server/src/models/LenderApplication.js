/**
 * LENDER APPLICATION (owner: Member 3)
 * One document per user. Documents are uploaded while status = 'draft' (Req 3), then the user submits (Req 2).
 * Files live in uploads/private/lender-docs and are only reachable through authenticated endpoints.
 */
const mongoose = require('mongoose');
const { APPLICATION_STATUS, APPLICATION_DOC_TYPES } = require('../config/constants');
const { Schema } = mongoose;

const documentSchema = new Schema({
  type: { type: String, enum: APPLICATION_DOC_TYPES, required: true },
  originalName: String,
  storedName: String,
  path: { type: String, required: true }, // relative to server/uploads
  mimeType: String,
  size: Number,
  uploadedAt: { type: Date, default: Date.now },
});

const schema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    status: { type: String, enum: APPLICATION_STATUS, default: 'draft', index: true },
    documents: [documentSchema],
    submittedAt: Date,
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    rejectionReason: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model('LenderApplication', schema);
