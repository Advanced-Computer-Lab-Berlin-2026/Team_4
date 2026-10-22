// ADMINS ROUTES - Owner: Member 1 - mounted automatically at /api/admins
const router = require('express').Router();
const c = require('../controllers/admins.controller');
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
// Add express-validator chains + `validate` (middleware/validate) before the handler as needed.

router.post('/', protect, requireRole('admin'), c.createAdmin); // Req 6

module.exports = router;
