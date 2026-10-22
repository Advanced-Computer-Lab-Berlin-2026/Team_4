// ACCOUNT ROUTES - Owner: Member 2 - mounted automatically at /api/account
const router = require('express').Router();
const c = require('../controllers/account.controller');
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
// Add express-validator chains + `validate` (middleware/validate) before the handler as needed.

router.put('/password', protect, c.changePassword); // Req 10
router.put('/profile', protect, requireRole('member'), c.updateProfile); // Req 12
router.get('/wallet', protect, requireRole('member'), c.getWallet); // Req 36

module.exports = router;
