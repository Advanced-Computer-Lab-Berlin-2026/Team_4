const asyncHandler = require('../utils/asyncHandler');
const supportService = require('../services/support/support');

exports.submitTicket = asyncHandler(async (req, res) => {
    const { subject, category, description, relatedTargetType, relatedTargetId } = req.body ?? {};
    const entity = await supportService.createTicket({
        userId: req.user._id, subject, category, description, relatedTargetType, relatedTargetId,
    });
    res.status(201).json({ success: true, entity });
});

exports.getMyTickets = asyncHandler(async (req, res) => {
    const result = await supportService.listMyTickets(req.user._id, req.query);
    res.status(200).json({ success: true, ...result });
});

exports.getAllTickets = asyncHandler(async (req, res) => {
    const result = await supportService.listAllTickets(req.query);
    res.status(200).json({ success: true, ...result });
});

exports.getTicket = asyncHandler(async (req, res) => {
    const entity = await supportService.getTicketById({
        ticketId: req.params.id,
        actorId: req.user._id,
        actorRole: req.user.role,
    });
    res.status(200).json({ success: true, entity });
});

exports.replyTicket = asyncHandler(async (req, res) => {
    const entity = await supportService.addTicketMessage({
        ticketId: req.params.id,
        actorId: req.user._id,
        actorRole: req.user.role,
        body: req.body.body,
    });
    res.status(200).json({ success: true, entity });
});

exports.resolveTicket = asyncHandler(async (req, res) => {
    const result = await supportService.resolveTicket({
        ticketId: req.params.id,
        adminId: req.user._id,
        status: req.body.status,
        resolutionNote: req.body.resolutionNote,
        linkReport: req.body.linkReport,
    });
    res.status(200).json({ success: true, ...result });
});