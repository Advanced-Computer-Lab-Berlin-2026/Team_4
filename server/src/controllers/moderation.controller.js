const asyncHandler = require('../utils/asyncHandler');
const moderationService = require('../services/moderation/moderation');

exports.getReports = asyncHandler(async (req, res) => {
    const result = await moderationService.listReports(req.query);
    res.status(200).json({ success: true, ...result });
});

exports.createReport = asyncHandler(async (req, res) => {
    const { targetType, targetId, reason, details } = req.body ?? {};
    const entity = await moderationService.createReport({
        reporterId: req.user._id, targetType, targetId, reason, details,
    });
    res.status(201).json({ success: true, entity });
});

exports.reviewReport = asyncHandler(async (req, res) => {
    const entity = await moderationService.applyModerationAction({
        reportId: req.params.id,
        adminId: req.user._id,
        action: req.body.action,
        adminNotes: req.body.adminNotes,
    });
    res.status(200).json({ success: true, entity });
});