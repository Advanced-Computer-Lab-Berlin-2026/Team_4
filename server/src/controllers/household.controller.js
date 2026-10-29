/**
 * HOUSEHOLD CONTROLLER - Owner: Member 8 (Household Linking)
 * Requirements: 24, 25, 26, 27
 * Mounted at /api/household (see routes/household.routes.js). Conventions: see docs/TEAM_WORKFLOW.md
 */
const mongoose = require('mongoose');
const HouseholdLink = require('../models/HouseholdLink');
const User = require('../models/User');
const { ROLES, USER_STATUS, HOUSEHOLD_RELATIONS } = require('../config/constants');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

const USER_PUBLIC_FIELDS = 'name username email phone address role lenderStatus';

/**
 * Normalize a string for case-insensitive, whitespace-tolerant comparison.
 */
const norm = (val) =>
  String(val || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

/**
 * Compare two User address subdocuments (Req 24: must live at the same address).
 */
function isSameAddress(addrA = {}, addrB = {}) {
  if (!norm(addrA.street) || !norm(addrB.street) || !norm(addrA.city) || !norm(addrB.city)) {
    return false;
  }
  if (norm(addrA.street) !== norm(addrB.street) || norm(addrA.city) !== norm(addrB.city)) {
    return false;
  }
  if (norm(addrA.state) && norm(addrB.state) && norm(addrA.state) !== norm(addrB.state)) {
    return false;
  }
  if (
    norm(addrA.postalCode) &&
    norm(addrB.postalCode) &&
    norm(addrA.postalCode) !== norm(addrB.postalCode)
  ) {
    return false;
  }
  if (norm(addrA.country || 'Egypt') !== norm(addrB.country || 'Egypt')) {
    return false;
  }
  return true;
}

/**
 * GET /api/household - Req 26 - member
 * My links (incoming + outgoing) with status
 */
exports.listLinks = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const filter = {
    $or: [{ requester: userId }, { recipient: userId }],
  };

  if (req.query.status) {
    filter.status = String(req.query.status).toLowerCase();
  }

  const links = await HouseholdLink.find(filter)
    .populate('requester', USER_PUBLIC_FIELDS)
    .populate('recipient', USER_PUBLIC_FIELDS)
    .sort({ createdAt: -1 });

  res.json({
    links,
    items: links,
    total: links.length,
  });
});

/**
 * POST /api/household/requests - Req 24 - member
 * Send request by email/phone + relation
 */
exports.sendRequest = asyncHandler(async (req, res) => {
  const rawContact = String(
    req.body.emailOrPhone || req.body.identifier || req.body.contact || ''
  ).trim();
  const rawEmail = String(
    req.body.email || (rawContact.includes('@') ? rawContact : '')
  )
    .trim()
    .toLowerCase();
  const rawPhone = String(
    req.body.phone || (!rawContact.includes('@') ? rawContact : '')
  ).trim();
  const relation = String(req.body.relation || '')
    .trim()
    .toLowerCase();

  if (!rawEmail && !rawPhone) {
    throw ApiError.badRequest('Please provide an email address or phone number.');
  }

  if (!HOUSEHOLD_RELATIONS.includes(relation)) {
    throw ApiError.badRequest(
      `Relation must be one of: ${HOUSEHOLD_RELATIONS.join(', ')}.`
    );
  }

  // Look up target user by email or phone
  const lookupOr = [];
  if (rawEmail) lookupOr.push({ email: rawEmail });
  if (rawPhone) lookupOr.push({ phone: rawPhone });

  const recipientUser = await User.findOne(
    lookupOr.length === 1 ? lookupOr[0] : { $or: lookupOr }
  );

  if (!recipientUser || recipientUser.role !== ROLES.MEMBER) {
    throw ApiError.notFound('No member account found with that email or phone number.');
  }

  if (recipientUser.status === USER_STATUS.SUSPENDED) {
    throw ApiError.badRequest('Cannot send a household request to a suspended account.');
  }

  if (String(recipientUser._id) === String(req.user._id)) {
    throw ApiError.badRequest('You cannot send a household link request to yourself.');
  }

  // Req 24: Both members must live at the same home address
  if (!isSameAddress(req.user.address, recipientUser.address)) {
    throw ApiError.badRequest(
      'Household links are only allowed between members living at the same home address.'
    );
  }

  // Check if an active (pending/accepted) link already exists between this pair
  const activeKey = [String(req.user._id), String(recipientUser._id)].sort().join('_');
  const existing = await HouseholdLink.findOne({ activeKey });

  if (existing) {
    if (existing.status === 'accepted') {
      throw ApiError.conflict('You are already linked with this household member.');
    }
    throw ApiError.conflict(
      'A pending household link request already exists between you and this member.'
    );
  }

  const link = await HouseholdLink.create({
    requester: req.user._id,
    recipient: recipientUser._id,
    relation,
    status: 'pending',
  });

  await link.populate([
    { path: 'requester', select: USER_PUBLIC_FIELDS },
    { path: 'recipient', select: USER_PUBLIC_FIELDS },
  ]);

  res.status(201).json({
    link,
    message: 'Household link request sent.',
  });
});

/**
 * PATCH /api/household/requests/:id/respond - Req 25 - member
 * Accept or decline an incoming request
 */
exports.respondToRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid household request ID.');
  }

  const rawDecision = String(
    req.body.action || req.body.status || req.body.decision || ''
  )
    .trim()
    .toLowerCase();

  let nextStatus;
  if (rawDecision === 'accept' || rawDecision === 'accepted') {
    nextStatus = 'accepted';
  } else if (
    rawDecision === 'decline' ||
    rawDecision === 'declined' ||
    rawDecision === 'reject' ||
    rawDecision === 'rejected'
  ) {
    nextStatus = 'declined';
  } else {
    throw ApiError.badRequest('Action must be either "accept" or "decline".');
  }

  const link = await HouseholdLink.findById(id);
  if (!link) {
    throw ApiError.notFound('Household link request not found.');
  }

  if (String(link.recipient) !== String(req.user._id)) {
    throw ApiError.forbidden('Only the recipient can accept or decline this request.');
  }

  if (link.status !== 'pending') {
    throw ApiError.badRequest(`This request has already been ${link.status}.`);
  }

  link.status = nextStatus;
  link.respondedAt = new Date();
  await link.save();

  await link.populate([
    { path: 'requester', select: USER_PUBLIC_FIELDS },
    { path: 'recipient', select: USER_PUBLIC_FIELDS },
  ]);

  res.json({
    link,
    message:
      nextStatus === 'accepted'
        ? 'Household link request accepted.'
        : 'Household link request declined.',
  });
});

/**
 * DELETE /api/household/:id - Req 27 - member
 * Unlink (remove an accepted link or cancel a pending request)
 */
exports.removeLink = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid household link ID.');
  }

  const link = await HouseholdLink.findById(id);
  if (!link) {
    throw ApiError.notFound('Household link not found.');
  }

  const userId = String(req.user._id);
  if (String(link.requester) !== userId && String(link.recipient) !== userId) {
    throw ApiError.forbidden('You do not have permission to remove this household link.');
  }

  await link.deleteOne();

  res.json({
    id: link._id,
    message: 'Household link removed.',
  });
});