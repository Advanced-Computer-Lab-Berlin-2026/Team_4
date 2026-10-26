/**
 * LENDERAPPLICATIONS CONTROLLER - Owner: Member 3 (Verified-Lender Application & Review)
 * Requirements: 2, 3
 * Mounted at /api/lender-applications (see routes/lenderApplications.routes.js). Conventions: see docs/TEAM_WORKFLOW.md
 *
 * Flow: the draft is created on the first upload (Req 3). The applicant keeps one file per document type
 * (uploading again replaces it), then submits (Req 2) -> status 'pending', user.lenderStatus 'pending'.
 * A rejected application can be edited and resubmitted; pending/approved ones are locked.
 */
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const LenderApplication = require('../models/LenderApplication');
const { fileInfo, absolutePath, removeFile } = require('../middleware/upload');
const { APPLICATION_DOC_TYPES, LENDER_STATUS } = require('../config/constants');

const EDITABLE = ['draft', 'rejected'];

const assertEditable = (application) => {
  if (application && !EDITABLE.includes(application.status)) {
    throw ApiError.conflict(
      application.status === 'approved'
        ? 'You are already a verified lender'
        : 'Your application is under review and can no longer be changed'
    );
  }
};

const findOwnDocument = async (req) => {
  const application = await LenderApplication.findOne({ user: req.user._id });
  const doc = application && application.documents.id(req.params.docId);
  if (!doc) throw ApiError.notFound('Document not found');
  return { application, doc };
};

/**
 * GET /api/lender-applications/mine - Req 2, 3 - member
 * Current user's application (draft/pending/approved/rejected). `application` is null if the user never started one.
 */
exports.getMyApplication = asyncHandler(async (req, res) => {
  const application = await LenderApplication.findOne({ user: req.user._id });
  res.json({ application, lenderStatus: req.user.lenderStatus });
});

/**
 * POST /api/lender-applications/documents - Req 3 - member
 * Upload a document (multipart: type + file). Replaces any existing document of the same type.
 */
exports.uploadDocument = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('Please choose a file to upload');
  const { type } = req.body;
  try {
    if (!APPLICATION_DOC_TYPES.includes(type)) {
      throw ApiError.badRequest(`Document type must be one of: ${APPLICATION_DOC_TYPES.join(', ')}`);
    }
    let application = await LenderApplication.findOne({ user: req.user._id });
    assertEditable(application);
    if (!application) application = new LenderApplication({ user: req.user._id });

    const previous = application.documents.find((d) => d.type === type);
    if (previous) {
      removeFile(previous.path);
      previous.deleteOne();
    }
    const { originalName, storedName, path, mimeType, size, uploadedAt } = fileInfo(req.file);
    application.documents.push({ type, originalName, storedName, path, mimeType, size, uploadedAt });
    await application.save();
    res.status(201).json({ application });
  } catch (err) {
    removeFile(fileInfo(req.file).path); // don't leave orphaned private files on disk
    throw err;
  }
});

/**
 * GET /api/lender-applications/documents/:docId - Req 3 - member
 * Owner previews one of their own documents (streams the file).
 */
exports.previewDocument = asyncHandler(async (req, res) => {
  const { doc } = await findOwnDocument(req);
  res.type(doc.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.originalName || doc.storedName)}"`);
  res.sendFile(absolutePath(doc.path));
});

/**
 * DELETE /api/lender-applications/documents/:docId - Req 3 - member
 * Remove an uploaded document
 */
exports.removeDocument = asyncHandler(async (req, res) => {
  const { application, doc } = await findOwnDocument(req);
  assertEditable(application);
  removeFile(doc.path);
  doc.deleteOne();
  await application.save();
  res.json({ application });
});

/**
 * POST /api/lender-applications/submit - Req 2 - member
 * Submit the application (requires ID + proof of address)
 */
exports.submitApplication = asyncHandler(async (req, res) => {
  const application = await LenderApplication.findOne({ user: req.user._id });
  if (!application) throw ApiError.badRequest('Upload your ID and proof of address before submitting');
  assertEditable(application);

  const missing = APPLICATION_DOC_TYPES.filter((t) => !application.documents.some((d) => d.type === t));
  if (missing.length) {
    const labels = { id_document: 'an ID document', proof_of_address: 'a proof of address' };
    throw ApiError.badRequest(`Please upload ${missing.map((t) => labels[t] || t).join(' and ')}`);
  }

  application.status = 'pending';
  application.submittedAt = new Date();
  application.reviewedBy = undefined;
  application.reviewedAt = undefined;
  application.rejectionReason = undefined;
  await application.save();

  req.user.lenderStatus = LENDER_STATUS.PENDING;
  await req.user.save();

  res.json({ application, lenderStatus: req.user.lenderStatus });
});
