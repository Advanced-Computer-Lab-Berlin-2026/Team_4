// MEMBERSHIPS ROUTES - Owner: Member 8 - mounted automatically at /api/memberships
const router = require('express').Router();
const { body } = require('express-validator');
const c = require('../controllers/memberships.controller');
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const validate = require('../middleware/validate');
const { PAYMENT_METHODS } = require('../services/membership/membership');

const validateSubscribe = [
  body('tierId').isMongoId().withMessage('Choose a membership tier.'),
  body('method').isIn(PAYMENT_METHODS).withMessage('Choose wallet or card payment.'),
  body('operationKey')
    .isString()
    .withMessage('A valid operation key is required.')
    .bail()
    .matches(/^[A-Za-z0-9_-]{8,100}$/)
    .withMessage('A valid operation key is required (8-100 letters, digits, "-" or "_").'),
  validate,
];

router.get('/tiers', c.listTiers); // Req 83
router.get('/me', protect, requireRole('member'), c.getMine); // Req 86
router.post('/subscribe', protect, requireRole('member'), validateSubscribe, c.subscribe); // Req 84, 85
router.post('/cancel', protect, requireRole('member'), c.cancel); // Req 87
router.get('/report', protect, requireRole('admin'), c.report); // Req 108

module.exports = router;
