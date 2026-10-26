// ADMINLENDERAPPLICATIONS ROUTES - Owner: Member 3 - mounted automatically at /api/admin-lender-applications
const router = require('express').Router();
const c = require('../controllers/adminLenderApplications.controller');
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const validate = require('../middleware/validate');
const { body, param } = require('express-validator');

const idParam = param('id').isMongoId().withMessage('Invalid application id');
const decisionRules = [
  idParam,
  body('decision').isIn(['approve', 'reject']).withMessage("Decision must be 'approve' or 'reject'"),
  body('reason')
    .if(body('decision').equals('reject'))
    .isString().withMessage('Please give a reason for the rejection')
    .bail()
    .trim()
    .isLength({ min: 3, max: 500 }).withMessage('Rejection reason must be 3-500 characters'),
];

router.get('/', protect, requireRole('admin'), c.listApplications); // Req 9
router.get('/:id', protect, requireRole('admin'), idParam, validate, c.getApplication); // Req 8
router.get('/:id/documents/:docId', protect, requireRole('admin'), idParam, validate, c.downloadDocument); // Req 8
router.patch('/:id/decision', protect, requireRole('admin'), decisionRules, validate, c.decideApplication); // Req 9

module.exports = router;
