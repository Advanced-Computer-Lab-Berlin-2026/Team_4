const mongoose = require('mongoose');
const Report = require('../../models/Report');
const Item = require('../../models/Item');
const User = require('../../models/User');
const ApiError = require('../../utils/ApiError');

const STATUSES = ['open', 'dismissed', 'actioned'];
const TARGET_TYPES = ['item', 'user'];
const ACTIONS = new Map([['flag', 'flagged'], ['remove', 'removed'], ['dismiss', 'dismissed'],
  ['flagged', 'flagged'], ['removed', 'removed'], ['dismissed', 'dismissed']]);

function reportDetails(query) {
  return query.populate('reporter', 'name username').populate('reviewedBy', 'name username')
    .populate('targetItem', 'title category isArchived moderationStatus owner')
    .populate('targetUser', 'name username role status isFlagged');
}

function filterInteger(value, fallback, limit) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) {
    throw ApiError.badRequest('Page and limit must be positive whole numbers');
  }
  return Math.min(Number(value), limit);
}

async function listReports({ status, targetType, page, limit } = {}) {
  if (status && !STATUSES.includes(status)) throw ApiError.badRequest('Invalid report status');
  if (targetType && !TARGET_TYPES.includes(targetType)) throw ApiError.badRequest('Invalid report target type');
  const query = { ...(status && { status }), ...(targetType && { targetType }) };
  const pageNum = filterInteger(page, 1, Number.MAX_SAFE_INTEGER);
  const limitNum = filterInteger(limit, 20, 100);
  const [items, total] = await Promise.all([
    reportDetails(Report.find(query)).sort({ createdAt: -1, _id: -1 })
      .skip((pageNum - 1) * limitNum).limit(limitNum).lean(),
    Report.countDocuments(query),
  ]);
  return { items, total, page: pageNum, totalPages: Math.max(1, Math.ceil(total / limitNum)) };
}

async function createReport({ reporterId, targetType, targetId, reason, details = '', supportTicketId }, session) {
  if (!TARGET_TYPES.includes(targetType) || !mongoose.isObjectIdOrHexString(targetId)) {
    throw ApiError.badRequest('Provide a valid item or user to review');
  }
  if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 150 ||
      typeof details !== 'string' || details.trim().length > 4000) {
    throw ApiError.badRequest('Provide a reason of 1–150 characters and details of up to 4000 characters');
  }
  const Model = targetType === 'item' ? Item : User;
  const target = await Model.exists({ _id: targetId }).session(session || null);
  if (!target) throw ApiError.notFound('Report target not found');

  const [report] = await Report.create([{
    reporter: reporterId, targetType, [targetType === 'item' ? 'targetItem' : 'targetUser']: targetId,
    reason: reason.trim(), details: details.trim(), ...(supportTicketId && { supportTicketId }),
  }], { session });
  return reportDetails(Report.findById(report._id)).session(session || null).lean();
}

async function updateTarget(report, action, adminId, session) {
  if (report.targetType === 'item') {
    const item = await Item.findById(report.targetItem).session(session);
    if (!item) throw ApiError.notFound('Reported item not found');
    if (item.moderationStatus === 'removed' && action === 'flagged') {
      throw ApiError.conflict('A removed listing cannot be flagged again');
    }
    item.moderationStatus = action;
    if (action === 'removed') {
      item.isArchived = true;
      item.archivedAt ??= new Date();
    }
    await item.save({ session });
    return;
  }

  const user = await User.findById(report.targetUser).session(session);
  if (!user) throw ApiError.notFound('Reported user not found');
  if (user.role === 'admin') throw ApiError.conflict('Administrator accounts cannot be moderated here');
  if (action === 'flagged') {
    if (!User.schema.path('isFlagged')) throw new ApiError(503, 'User flagging requires the shared User schema update');
    await User.updateOne({ _id: user._id }, { $set: { isFlagged: true } }, { session });
    return;
  }
  await User.updateOne({ _id: user._id }, {
    $set: { status: 'suspended', suspension: { reason: report.reason, at: new Date(), by: adminId } },
  }, { session });
  // Hide current listings while retaining their records and reservation history.
  await Item.updateMany({ owner: user._id, isArchived: false }, {
    $set: { isArchived: true, archivedAt: new Date() },
  }, { session });
}

async function applyModerationAction({ reportId, adminId, action: requested, adminNotes = '' }) {
  const action = ACTIONS.get(requested);
  if (!mongoose.isObjectIdOrHexString(reportId) || !action) throw ApiError.badRequest('Invalid report or moderation action');
  if (typeof adminNotes !== 'string' || adminNotes.trim().length > 1000) {
    throw ApiError.badRequest('Admin notes may contain up to 1000 characters');
  }

  await mongoose.connection.transaction(async (session) => {
    const report = await Report.findById(reportId).session(session);
    if (!report) throw ApiError.notFound('Report not found');
    if (report.status === 'dismissed' && action === 'dismissed' ||
        report.status === 'actioned' && report.action === action) return;
    const escalate = report.status === 'actioned' && report.action === 'flagged' && action === 'removed';
    if (report.status !== 'open' && !escalate) throw ApiError.conflict('This report already has a final decision');
    if (action !== 'dismissed') await updateTarget(report, action, adminId, session);
    report.action = action === 'dismissed' ? 'none' : action;
    report.status = action === 'dismissed' ? 'dismissed' : 'actioned';
    report.adminNotes = adminNotes.trim();
    report.reviewedBy = adminId;
    report.reviewedAt = new Date();
    await report.save({ session });
  });

  return reportDetails(Report.findById(reportId)).lean();
}

module.exports = { listReports, createReport, applyModerationAction };
