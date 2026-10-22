// NOTICES ROUTES - Owner: Member 9 - mounted automatically at /api/notices
const router = require('express').Router();
const c = require('../controllers/notices.controller');
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
// Add express-validator chains + `validate` (middleware/validate) before the handler as needed.

router.get('/', protect, c.listNotices); // Req 42
router.post('/', protect, requireRole('admin'), c.createNotice); // Req 41

module.exports = router;
