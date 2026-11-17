// Moderation service - Owner: Member 4
const mongoose = require('mongoose');
const Report = require('../../models/Report');
const Item = require('../../models/Item');
const User = require('../../models/User');
const ApiError = require('../../utils/ApiError');

/**
 * List reported listings/users with filters & pagination
 */
async function listReports({ status, targetType, page = 1, limit = 20 } = {}) {
    const query = {};
    if (status) query.status = status;
    if (targetType) query.targetType = targetType;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
        Report.find(query)
            .populate('reporter', 'name username email')
            .populate('targetItem', 'title category isArchived isFlagged owner')
            .populate('targetUser', 'name username email role status isFlagged')
            .populate('reviewedBy', 'name username')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean(),
        Report.countDocuments(query),
    ]);

    return {
        items,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum) || 1,
    };
}

/**
 * Create a report
 */
async function createReport({ reporterId, targetType, targetId, reason, details }) {
    if (!['item', 'user'].includes(targetType)) {
        throw ApiError.badRequest('targetType must be item or user');
    }
    if (!mongoose.Types.ObjectId.isValid(targetId)) {
        throw ApiError.badRequest('Valid targetId is required');
    }
    if (!reason || !reason.trim()) {
        throw ApiError.badRequest('Reason is required');
    }

    const payload = {
        reporter: reporterId,
        targetType,
        reason: reason.trim(),
        details: (details || '').trim(),
        status: 'open',
        action: 'none',
    };

    if (targetType === 'item') {
        const item = await Item.findById(targetId).select('_id');
        if (!item) throw ApiError.notFound('Reported item not found');
        payload.targetItem = item._id;
    } else {
        const user = await User.findById(targetId).select('_id');
        if (!user) throw ApiError.notFound('Reported user not found');
        payload.targetUser = user._id;
    }

    const created = await Report.create(payload);
    return Report.findById(created._id)
        .populate('reporter', 'name username email')
        .populate('targetItem', 'title category isArchived isFlagged')
        .populate('targetUser', 'name username email role status isFlagged');
}

/**
 * Review a report and flag, remove, or dismiss.
 * Preserves historical reservations and financial records.
 */
async function applyModerationAction({ reportId, adminId, action }) {
    if (!mongoose.Types.ObjectId.isValid(reportId)) {
        throw ApiError.badRequest('Invalid report ID');
    }
    if (!['flagged', 'removed', 'dismissed'].includes(action)) {
        throw ApiError.badRequest('Action must be flagged, removed, or dismissed');
    }

    const report = await Report.findById(reportId);
    if (!report) throw ApiError.notFound('Report not found');

    report.action = action;
    report.status = action === 'dismissed' ? 'dismissed' : 'actioned';
    report.reviewedBy = adminId;
    report.reviewedAt = new Date();

    if (action === 'flagged') {
        if (report.targetType === 'item' && report.targetItem) {
            await Item.updateOne({ _id: report.targetItem }, { $set: { isFlagged: true } });
        } else if (report.targetType === 'user' && report.targetUser) {
            await User.updateOne({ _id: report.targetUser }, { $set: { isFlagged: true } });
        }
    } else if (action === 'removed') {
        if (report.targetType === 'item' && report.targetItem) {
            // Archive listing instead of hard-deleting to preserve reservation history
            await Item.updateOne({ _id: report.targetItem }, { $set: { isArchived: true, status: 'archived' } });
        } else if (report.targetType === 'user' && report.targetUser) {
            // Suspend account instead of wiping historical records
            await User.updateOne({ _id: report.targetUser }, { $set: { status: 'suspended' } });
        }
    }

    await report.save();

    return Report.findById(report._id)
        .populate('reporter', 'name username email')
        .populate('targetItem', 'title category isArchived isFlagged')
        .populate('targetUser', 'name username email role status isFlagged')
        .populate('reviewedBy', 'name username');
}

module.exports = {
    listReports,
    createReport,
    applyModerationAction,
};