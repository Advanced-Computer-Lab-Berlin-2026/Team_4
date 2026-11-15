const router = require('express').Router();
const { body } = require('express-validator');
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const validate = require('../middleware/validate');
const controller = require('../controllers/referrals.controller');

router.get('/mine', protect, requireRole('member'), controller.mine);
router.post('/capture', protect, requireRole('member'), [
  body('code').isString().trim().notEmpty().withMessage('Referral code is required'),
], validate, controller.capture);
router.get('/report', protect, requireRole('admin'), controller.report);

module.exports = router;
