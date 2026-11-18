const router = require('express').Router();
const { body } = require('express-validator');
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const validate = require('../middleware/validate');
const controller = require('../controllers/referrals.controller');

router.get('/mine', protect, requireRole('member'), controller.mine);
router.post('/capture', protect, requireRole('member'), [
  body('code').isString().trim().isLength({ min: 1, max: 64 }).withMessage('Referral code is required (up to 64 characters)'),
], validate, controller.capture);
router.post('/share', protect, requireRole('member'), [
  body('shareKey').isUUID().withMessage('A share identifier is required'),
], validate, controller.share);
router.get('/report', protect, requireRole('admin'), controller.report);

module.exports = router;
