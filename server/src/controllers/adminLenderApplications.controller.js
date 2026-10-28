/**
 * ADMINLENDERAPPLICATIONS CONTROLLER - Owner: Member 3 (Verified-Lender Application & Review)
 * Requirements: 8, 9
 * Mounted at /api/admin-lender-applications (see routes/adminLenderApplications.routes.js). Conventions: see docs/TEAM_WORKFLOW.md
 *
 * Drafts are private to the applicant, so admins only ever see submitted applications.
 */
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const LenderApplication = require('../models/LenderApplication');
const mongoose = require('mongoose');
const User = require('../models/User');
const { absolutePath } = require('../middleware/upload');
const { parsePagination, paginated } = require('../utils/pagination');
const { LENDER_STATUS } = require('../config/constants');

const REVIEWABLE = ['pending', 'approved', 'rejected'];
const APPLICANT_FIELDS = 'username name email phone address lenderStatus status trustScore createdAt';

const findSubmitted = async (id) => {
  const application = await LenderApplication.findOne({ _id: id, status: { $in: REVIEWABLE } });
  if (!application) throw ApiError.notFound('Application not found');
  return application;
};

/**
 * GET /api/admin-lender-applications - Req 9 - admin
 * List applications (filter by status). ?status=pending|approved|rejected (omit for all), ?page, ?limit
 */
exports.listApplications = asyncHandler(async (req, res) => {
  const { status } = req.query;
  if (status && !REVIEWABLE.includes(status)) {
    throw ApiError.badRequest(`Status must be one of: ${REVIEWABLE.join(', ')}`);
  }
  const filter = { status: status || { $in: REVIEWABLE } };
  const pg = parsePagination(req.query, { defaultLimit: 20 });

  const [items, total] = await Promise.all([
    LenderApplication.find(filter)
      .sort({ submittedAt: -1 })
      .skip(pg.skip)
      .limit(pg.limit)
      .populate('user', 'username name email')
      .populate('reviewedBy', 'username name'),
    LenderApplication.countDocuments(filter),
  ]);
  res.json(paginated(items, total, pg));
});

/**
 * GET /api/admin-lender-applications/:id - Req 8 - admin
 * One application with applicant info + document list
 */
exports.getApplication = asyncHandler(async (req, res) => {
  const application = await findSubmitted(req.params.id);
  await application.populate([
    { path: 'user', select: APPLICANT_FIELDS },
    { path: 'reviewedBy', select: 'username name' },
  ]);
  res.json({ application });
});

/**
 * GET /api/admin-lender-applications/:id/documents/:docId - Req 8 - admin
 * Stream a private document file to the admin. ?download=1 forces a download instead of inline view.
 */
exports.downloadDocument = asyncHandler(async (req, res) => {
  const application = await findSubmitted(req.params.id);
  const doc = application.documents.id(req.params.docId);
  if (!doc) throw ApiError.notFound('Document not found');

  const disposition = req.query.download ? 'attachment' : 'inline';
  res.type(doc.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(doc.originalName || doc.storedName)}"`);
  res.sendFile(absolutePath(doc.path));
});

/**
 * PATCH /api/admin-lender-applications/:id/decision - Req 9 - admin
 * Body: { decision: 'approve' | 'reject', reason? } (reason required when rejecting).
 * Accept sets user.lenderStatus='verified'; reject sets it to 'rejected'.
 */
exports.decideApplication = asyncHandler(async (req, res) => {
  const { decision, reason } = req.body;
  const application = await mongoose.connection.transaction(async (session) => {
    // A transaction retries write conflicts. Each retry checks the latest pending state.
    const application = await LenderApplication.findOne({
      _id: req.params.id, status: { $in: REVIEWABLE },
    }).session(session);
    if (!application) throw ApiError.notFound('Application not found');
    if (application.status !== 'pending') {
      throw ApiError.conflict(`This application has already been ${application.status}`);
    }
    const approve = decision === 'approve';
    application.status = approve ? 'approved' : 'rejected';
    application.rejectionReason = approve ? undefined : reason.trim();
    application.reviewedBy = req.user._id;
    application.reviewedAt = new Date();
    await application.save({ session });
    const result = await User.updateOne(
      { _id: application.user },
      { lenderStatus: approve ? LENDER_STATUS.VERIFIED : LENDER_STATUS.REJECTED },
      { session }
    );
    if (result.matchedCount !== 1) throw ApiError.notFound('Applicant no longer exists');
    return application;
  });

  await application.populate([
    { path: 'user', select: APPLICANT_FIELDS },
    { path: 'reviewedBy', select: 'username name' },
  ]);
  res.json({ application });
});
