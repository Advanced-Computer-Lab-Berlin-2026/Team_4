// TRUST PROFILES ROUTES - Owner: Member 3 - mounted automatically at /api/trust-profiles
const router = require('express').Router();
const { param } = require('express-validator');
const c = require('../controllers/trustProfiles.controller');
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const validate = require('../middleware/validate');

const userIdParam = param('userId').isMongoId().withMessage('Invalid user id');

// '/me' must come before '/:userId'
router.get('/me', protect, requireRole('member'), c.getMyTrustProfile); // Req 91
router.get('/:userId', userIdParam, validate, c.getTrustProfile); // Req 91 (public)
router.post('/:userId/recalculate', protect, requireRole('admin'), userIdParam, validate, c.recalculate); // Req 98

module.exports = router;
