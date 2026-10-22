// ADMINUSERS ROUTES - Owner: Member 4 - mounted automatically at /api/admin-users
const router = require('express').Router();
const c = require('../controllers/adminUsers.controller');
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
// Add express-validator chains + `validate` (middleware/validate) before the handler as needed.

router.get('/', protect, requireRole('admin'), c.listUsers); // Req 28, 29
router.get('/:id', protect, requireRole('admin'), c.getUser); // Req 22
router.patch('/:id/status', protect, requireRole('admin'), c.setUserStatus); // Req 39
router.delete('/:id', protect, requireRole('admin'), c.removeUser); // Req 7

module.exports = router;
