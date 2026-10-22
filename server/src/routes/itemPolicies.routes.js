// ITEMPOLICIES ROUTES - Owner: Member 6 - mounted automatically at /api/item-policies
const router = require('express').Router();
const c = require('../controllers/itemPolicies.controller');
const { protect } = require('../middleware/auth');
const { requireVerifiedLender } = require('../middleware/roles');
const { uploadManualFile } = require('../middleware/upload');
// Add express-validator chains + `validate` (middleware/validate) before the handler as needed.

router.put('/:itemId/pickup', protect, requireVerifiedLender, c.setPickup); // Req 30
router.put('/:itemId/rules', protect, requireVerifiedLender, c.setRules); // Req 31
router.post('/:itemId/manual', protect, requireVerifiedLender, uploadManualFile, c.uploadManual); // Req 32
router.delete('/:itemId/manual', protect, requireVerifiedLender, c.removeManual); // Req 32

module.exports = router;
