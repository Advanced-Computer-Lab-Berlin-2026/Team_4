// DAMAGE REPORTS ROUTES - Owner: Member 3 - mounted automatically at /api/damage-reports
const router = require('express').Router();
const { body, param, query } = require('express-validator');
const c = require('../controllers/damageReports.controller');
const { protect } = require('../middleware/auth');
const { requireRole, requireVerifiedLender } = require('../middleware/roles');
const validate = require('../middleware/validate');

const STATUSES = ['open', 'decided', 'disputed', 'resolved'];
const idParam = param('id').isMongoId().withMessage('Invalid damage report id');
const text = (field, min, max, label) =>
  body(field)
    .isString().withMessage(`${label} is required`)
    .bail()
    .trim()
    .isLength({ min, max }).withMessage(`${label} must be ${min}-${max} characters`);
const amount = (field) =>
  body(field).isFloat({ min: 0 }).withMessage('Amount must be a number of 0 or more').toFloat();

const createRules = [body('reservationId').isMongoId().withMessage('Invalid reservation id'), text('description', 10, 2000, 'Description')];
const decisionRules = [idParam, amount('forfeitAmount'), text('note', 3, 1000, 'Note')];
const disputeRules = [idParam, text('reason', 10, 2000, 'Reason')];
const resolutionRules = [idParam, amount('finalForfeitAmount'), text('note', 3, 1000, 'Note')];

// '/mine' must come before '/:id'
router.post('/', protect, requireVerifiedLender, createRules, validate, c.createReport); // Req 61
router.get('/mine', protect, requireRole('member'), query('role').optional().isIn(['lender', 'borrower']).withMessage("Role must be 'lender' or 'borrower'"), validate, c.listMyReports); // Req 61, 63
router.get('/', protect, requireRole('admin'), query('status').optional().isIn(STATUSES).withMessage(`Status must be one of: ${STATUSES.join(', ')}`), validate, c.listReports); // Req 62, 64
router.get('/:id', protect, idParam, validate, c.getReport); // Req 62, 63, 64, 80
router.patch('/:id/decision', protect, requireRole('admin'), decisionRules, validate, c.decideReport); // Req 62
router.post('/:id/dispute', protect, requireRole('member'), disputeRules, validate, c.disputeReport); // Req 63
router.patch('/:id/resolution', protect, requireRole('admin'), resolutionRules, validate, c.resolveReport); // Req 64

module.exports = router;
