const mongoose = require('mongoose');
const { Schema } = mongoose;
const User = require('./User');

const schema = new Schema(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        subject: { type: String, required: true, trim: true, maxlength: 150 },
        message: { type: String, required: true, trim: true },
        status: { type: String, enum: ['open', 'in_progress', 'resolved'], default: 'open', index: true },
        replies: [
            {
                author: { type: Schema.Types.ObjectId, ref: 'User' },
                message: String,
                at: { type: Date, default: Date.now },
            },
        ],
        resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        resolvedAt: Date,
    },
    { timestamps: true }
);

module.exports = mongoose.models.SupportTicket || mongoose.model('SupportTicket', schema);