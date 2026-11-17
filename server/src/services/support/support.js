const mongoose = require('mongoose');
const SupportTicket = require('../../models/SupportTicket');
const moderation = require('../moderation/moderation');
const ApiError = require('../../utils/ApiError');

const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
const CATEGORIES = SupportTicket.schema.path('category').enumValues;
const ESCAPED_REGEX = /[.*+?^$\x7b\x7d()|[\]\\]/g;

function checkedId(id) {
  if (!mongoose.isObjectIdOrHexString(id)) throw ApiError.badRequest('Invalid ticket ID');
  return id;
}

function text(value, label, max, required = true) {
  if (!required && (value == null || value === '')) return '';
  if (typeof value !== 'string' || required && !value.trim() || value.trim().length > max) {
    throw ApiError.badRequest(label + ' must contain ' + (required ? '1–' : 'up to ') + max + ' characters');
  }
  return value.trim();
}

function checkedFilter(value, allowed, label) {
  if (value == null || value === '') return null;
  if (!allowed.includes(value)) throw ApiError.badRequest('Invalid ' + label);
  return value;
}

async function validateRelatedTarget(type, id) {
  if (id == null || id === '') {
    if (type && type !== 'none') throw ApiError.badRequest('Provide a related target ID');
    return { relatedTargetType: 'none' };
  }
  if (!['item', 'user'].includes(type) || !mongoose.isObjectIdOrHexString(id)) {
    throw ApiError.badRequest('Provide a valid related item or user ID');
  }
  const Target = mongoose.model(type === 'item' ? 'Item' : 'User');
  if (!await Target.exists({ _id: id })) throw ApiError.badRequest('Related target does not exist');
  return { relatedTargetType: type, relatedTargetId: id };
}

function threadQuery(query) {
  return query.populate('user', 'name username').populate('resolvedBy', 'name username')
    .populate('replies.author', 'name username role');
}

function view(ticket, thread = false) {
  return {
    _id: ticket._id,
    ticketNumber: String(ticket._id),
    creator: ticket.user,
    subject: ticket.subject,
    description: ticket.message,
    category: ticket.category || 'other',
    status: ticket.status,
    relatedTargetType: ticket.relatedTargetType || 'none',
    relatedTargetId: ticket.relatedTargetId,
    resolutionNote: ticket.resolutionNote,
    resolvedAt: ticket.resolvedAt,
    resolvedBy: ticket.resolvedBy,
    linkedReport: ticket.linkedReport,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    ...(thread && { messages: [
      { _id: 'initial-' + ticket._id, sender: ticket.user, senderRole: 'member', body: ticket.message, createdAt: ticket.createdAt },
      ...(ticket.replies || []).map((reply) => ({
        _id: reply._id, sender: reply.author, senderRole: reply.authorRole || reply.author?.role || 'member',
        body: reply.message, createdAt: reply.at,
      })),
    ] }),
  };
}

async function createTicket({ userId, subject, category = 'other', description, relatedTargetType, relatedTargetId }) {
  if (!CATEGORIES.includes(category)) throw ApiError.badRequest('Invalid ticket category');
  const title = text(subject, 'Subject', 150);
  const message = text(description, 'Description', 4000);
  const target = await validateRelatedTarget(relatedTargetType, relatedTargetId);
  const ticket = await SupportTicket.create({ user: userId, subject: title, message, category, ...target });
  return getTicketById({ ticketId: ticket._id, actorId: userId, actorRole: 'member' });
}

async function listTickets(filter) {
  const items = await SupportTicket.find(filter).select('-replies').populate('user', 'name username')
    .populate('resolvedBy', 'name username').sort({ updatedAt: -1, _id: -1 }).lean();
  return { items: items.map((ticket) => view(ticket)), total: items.length };
}

async function listMyTickets(userId, { status }) {
  const filter = checkedFilter(status, STATUSES, 'ticket status');
  return listTickets({ user: userId, ...(filter && { status: filter }) });
}

async function listAllTickets({ status, category, q }) {
  const statusFilter = checkedFilter(status, STATUSES, 'ticket status');
  const categoryFilter = checkedFilter(category, CATEGORIES, 'ticket category');
  const search = text(q, 'Search', 150, false);
  const filter = { ...(statusFilter && { status: statusFilter }), ...(categoryFilter && { category: categoryFilter }) };
  if (search) filter.$or = [
    { subject: new RegExp(search.replace(ESCAPED_REGEX, '\\$&'), 'i') },
    ...(mongoose.isObjectIdOrHexString(search) ? [{ _id: search }] : []),
  ];
  return listTickets(filter);
}

async function getTicket({ ticketId, actorId, actorRole, session }) {
  const ticket = await SupportTicket.findOne({
    _id: checkedId(ticketId), ...(actorRole !== 'admin' && { user: actorId }),
  }).session(session || null);
  // The same result for missing or cross-account IDs avoids disclosing the ticket.
  if (!ticket) throw ApiError.notFound('Support ticket not found');
  return ticket;
}

async function getTicketById(params) {
  const ticket = await getTicket(params);
  const dto = await threadQuery(SupportTicket.findById(ticket._id)).session(params.session || null).lean();
  return view(dto, true);
}

async function addTicketMessage({ ticketId, actorId, actorRole, body }) {
  const message = text(body, 'Reply', 4000);
  await mongoose.connection.transaction(async (session) => {
    const ticket = await getTicket({ ticketId, actorId, actorRole, session });
    if (ticket.status === 'closed') throw ApiError.conflict('This support ticket is closed');
    ticket.replies.push({ author: actorId, authorRole: actorRole, message });
    if (actorRole === 'admin' && ticket.status === 'open') ticket.status = 'in_progress';
    await ticket.save({ session });
  });
  return getTicketById({ ticketId, actorId, actorRole });
}

async function resolveTicket({ ticketId, adminId, status = 'resolved', resolutionNote, linkReport }) {
  const selected = checkedFilter(status, STATUSES, 'ticket status');
  if (!selected) throw ApiError.badRequest('Provide a ticket status');
  const note = text(resolutionNote, 'Resolution note', 3950, false);
  if (linkReport != null && (typeof linkReport !== 'object' || Array.isArray(linkReport))) {
    throw ApiError.badRequest('Invalid moderation report link');
  }
  const report = await mongoose.connection.transaction(async (session) => {
    const ticket = await getTicket({ ticketId, actorId: adminId, actorRole: 'admin', session });
    const statusChanged = ticket.status !== selected;
    const noteChanged = Boolean(note && note !== ticket.resolutionNote);
    ticket.status = selected;
    if (noteChanged) {
      ticket.resolutionNote = note;
      ticket.replies.push({ author: adminId, authorRole: 'admin', message: '[Resolution update] ' + note });
    }
    if (statusChanged && ['resolved', 'closed'].includes(selected)) {
      ticket.resolvedBy = adminId;
      ticket.resolvedAt = new Date();
    } else if (statusChanged) {
      ticket.resolvedBy = undefined;
      ticket.resolvedAt = undefined;
      ticket.resolutionNote = undefined;
    }

    let created = null;
    if (linkReport && !ticket.linkedReport) {
      if (!['item', 'user'].includes(ticket.relatedTargetType) || !ticket.relatedTargetId ||
          linkReport.targetType !== ticket.relatedTargetType || String(linkReport.targetId) !== String(ticket.relatedTargetId)) {
        throw ApiError.badRequest('The report must match the support ticket’s related target');
      }
      created = await moderation.createReport({
        reporterId: ticket.user, targetType: ticket.relatedTargetType, targetId: ticket.relatedTargetId,
        reason: linkReport.reason ?? ticket.subject, details: linkReport.details ?? ticket.message,
        supportTicketId: ticket._id,
      }, session);
      ticket.linkedReport = created._id;
    }
    await ticket.save({ session });
    return created;
  });

  return { entity: await getTicketById({ ticketId, actorId: adminId, actorRole: 'admin' }), report };
}

module.exports = { createTicket, listMyTickets, listAllTickets, getTicketById, addTicketMessage, resolveTicket };
