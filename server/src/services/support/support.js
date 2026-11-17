const mongoose = require('mongoose');
const SupportTicket = require('../../models/SupportTicket');
const moderationService = require('../moderation/moderation');
const ApiError = require('../../utils/ApiError');

/**
 * Req 109: Member submits a support ticket
 */
async function createTicket({
                                userId,
                                userRole,
                                subject,
                                category,
                                description,
                                relatedTargetType = 'none',
                                relatedTargetId = null,
                            }) {
    if (!subject || !subject.trim()) throw ApiError.badRequest('Subject is required');
    if (!description || !description.trim()) throw ApiError.badRequest('Description is required');

    const validTargetId =
        relatedTargetId && mongoose.Types.ObjectId.isValid(relatedTargetId) ? relatedTargetId : null;

    const ticket = await SupportTicket.create({
        creator: userId,
        subject: subject.trim(),
        category: category || 'other',
        description: description.trim(),
        relatedTargetType: validTargetId ? relatedTargetType : 'none',
        relatedTargetId: validTargetId,
        messages: [
            {
                sender: userId,
                senderRole: userRole || 'member',
                body: description.trim(),
            },
        ],
    });

    return SupportTicket.findById(ticket._id).populate('creator', 'name username email');
}

/**
 * Req 111: Member views their own support tickets only
 */
async function listMyTickets(userId, { status } = {}) {
    const query = { creator: userId };
    if (status && status.trim()) query.status = status.trim();

    const items = await SupportTicket.find(query)
        .populate('resolvedBy', 'name username')
        .sort({ updatedAt: -1 })
        .lean();

    return { items, total: items.length };
}

/**
 * Req 110: Admin lists all support tickets
 */
async function listAllTickets({ status, category, q } = {}) {
    const query = {};
    if (status && status.trim()) query.status = status.trim();
    if (category && category.trim()) query.category = category.trim();
    if (q && q.trim()) {
        query.$or = [
            { subject: { $regex: q.trim(), $options: 'i' } },
            { ticketNumber: { $regex: q.trim(), $options: 'i' } },
        ];
    }

    const items = await SupportTicket.find(query)
        .populate('creator', 'name username email role')
        .populate('resolvedBy', 'name username')
        .sort({ updatedAt: -1 })
        .lean();

    return { items, total: items.length };
}

/**
 * Req 110 & 111: Get single ticket with strict ownership / admin check
 */
async function getTicketById({ ticketId, actorId, actorRole }) {
    if (!mongoose.Types.ObjectId.isValid(ticketId)) {
        throw ApiError.badRequest('Invalid ticket ID');
    }

    const ticket = await SupportTicket.findById(ticketId)
        .populate('creator', 'name username email role')
        .populate('resolvedBy', 'name username')
        .populate('messages.sender', 'name username role')
        .populate('linkedReport');

    if (!ticket) throw ApiError.notFound('Support ticket not found');

    const isOwner = String(ticket.creator?._id || ticket.creator) === String(actorId);
    const isAdmin = actorRole === 'admin';

    if (!isOwner && !isAdmin) {
        throw ApiError.forbidden('You do not have permission to view this support ticket');
    }

    return ticket;
}

/**
 * Append message to ticket thread (owner or admin)
 */
async function addTicketMessage({ ticketId, actorId, actorRole, body }) {
    if (!body || !body.trim()) throw ApiError.badRequest('Message body cannot be empty');

    const ticket = await getTicketById({ ticketId, actorId, actorRole });

    ticket.messages.push({
        sender: actorId,
        senderRole: actorRole,
        body: body.trim(),
    });

    if (actorRole === 'admin' && ticket.status === 'open') {
        ticket.status = 'in_progress';
    }

    await ticket.save();
    return getTicketById({ ticketId, actorId, actorRole });
}

/**
 * Req 110: Admin responds, updates/resolves ticket, and optionally escalates to a moderation Report
 */
async function resolveTicket({
                                 ticketId,
                                 adminId,
                                 status = 'resolved',
                                 resolutionNote = '',
                                 linkReport = null,
                             }) {
    if (!mongoose.Types.ObjectId.isValid(ticketId)) {
        throw ApiError.badRequest('Invalid ticket ID');
    }

    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) throw ApiError.notFound('Support ticket not found');

    if (!['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
        throw ApiError.badRequest('Invalid status value');
    }

    if (resolutionNote && resolutionNote.trim()) {
        ticket.resolutionNote = resolutionNote.trim();
        ticket.messages.push({
            sender: adminId,
            senderRole: 'admin',
            body: `[Resolution Update - ${status.toUpperCase()}]: ${resolutionNote.trim()}`,
        });
    }

    ticket.status = status;
    if (status === 'resolved' || status === 'closed') {
        ticket.resolvedBy = adminId;
        ticket.resolvedAt = new Date();
    }

    let createdReport = null;
    if (linkReport && linkReport.targetType && linkReport.targetId) {
        createdReport = await moderationService.createReport({
            reporterId: ticket.creator,
            targetType: linkReport.targetType,
            targetId: linkReport.targetId,
            reason: linkReport.reason || ticket.subject,
            details: linkReport.details || ticket.description,
            supportTicketId: ticket._id,
        });
        ticket.linkedReport = createdReport._id;
    }

    await ticket.save();

    const updated = await getTicketById({
        ticketId: ticket._id,
        actorId: adminId,
        actorRole: 'admin',
    });

    return { entity: updated, report: createdReport };
}

module.exports = {
    createTicket,
    listMyTickets,
    listAllTickets,
    getTicketById,
    addTicketMessage,
    resolveTicket,
};