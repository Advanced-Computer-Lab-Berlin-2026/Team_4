// PAYMENTS ROUTES - Owner: Member 2 - mounted automatically at /api/payments
const router = require('express').Router();
const c = require('../controllers/payments.controller');
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');

router.get('/policy', c.getPolicy); // Req 77/81 - public, visible before payment
router.get('/late-fees', protect, requireRole('member'), c.listMyLateFees); // Req 78

module.exports = router;
