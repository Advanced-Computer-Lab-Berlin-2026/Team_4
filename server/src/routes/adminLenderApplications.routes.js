// ADMINLENDERAPPLICATIONS ROUTES - Owner: Member 3 - mounted automatically at /api/admin-lender-applications
const router = require('express').Router();
const c = require('../controllers/adminLenderApplications.controller');
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
// Add express-validator chains + `validate` (middleware/validate) before the handler as needed.

router.get('/', protect, requireRole('admin'), c.listApplications); // Req 9
router.get('/:id', protect, requireRole('admin'), c.getApplication); // Req 8
router.get('/:id/documents/:docId', protect, requireRole('admin'), c.downloadDocument); // Req 8
router.patch('/:id/decision', protect, requireRole('admin'), c.decideApplication); // Req 9

module.exports = router;
