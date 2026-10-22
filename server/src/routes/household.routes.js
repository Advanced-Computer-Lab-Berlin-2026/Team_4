// HOUSEHOLD ROUTES - Owner: Member 8 - mounted automatically at /api/household
const router = require('express').Router();
const c = require('../controllers/household.controller');
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
// Add express-validator chains + `validate` (middleware/validate) before the handler as needed.

router.get('/', protect, requireRole('member'), c.listLinks); // Req 26
router.post('/requests', protect, requireRole('member'), c.sendRequest); // Req 24
router.patch('/requests/:id/respond', protect, requireRole('member'), c.respondToRequest); // Req 25
router.delete('/:id', protect, requireRole('member'), c.removeLink); // Req 27

module.exports = router;
