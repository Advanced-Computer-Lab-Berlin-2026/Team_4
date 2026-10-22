// CATEGORIES ROUTES - Owner: Member 6 - mounted automatically at /api/categories
const router = require('express').Router();
const c = require('../controllers/categories.controller');
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
// Add express-validator chains + `validate` (middleware/validate) before the handler as needed.

router.get('/', c.listCategories); // Req 18, 34
router.get('/:slug', c.getCategory); // Req 34
router.patch('/:id/deposit-multiplier', protect, requireRole('admin'), c.setDepositMultiplier); // Req 40

module.exports = router;
