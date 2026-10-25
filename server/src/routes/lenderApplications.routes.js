// LENDERAPPLICATIONS ROUTES - Owner: Member 3 - mounted automatically at /api/lender-applications
const router = require('express').Router();
const c = require('../controllers/lenderApplications.controller');
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { uploadLenderDoc } = require('../middleware/upload');
const validate = require('../middleware/validate');
const { param } = require('express-validator');

const docIdParam = param('docId').isMongoId().withMessage('Invalid document id');

router.get('/mine', protect, requireRole('member'), c.getMyApplication); // Req 2, 3
router.post('/documents', protect, requireRole('member'), uploadLenderDoc, c.uploadDocument); // Req 3
router.get('/documents/:docId', protect, requireRole('member'), docIdParam, validate, c.previewDocument); // Req 3
router.delete('/documents/:docId', protect, requireRole('member'), docIdParam, validate, c.removeDocument); // Req 3
router.post('/submit', protect, requireRole('member'), c.submitApplication); // Req 2

module.exports = router;
