// ADMINITEMS ROUTES - Owner: Member 9 - mounted automatically at /api/admin-items
const router = require('express').Router();
const c = require('../controllers/adminItems.controller');
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
// Add express-validator chains + `validate` (middleware/validate) before the handler as needed.

router.get('/', protect, requireRole('admin'), c.listAllItems); // Req 23

module.exports = router;
