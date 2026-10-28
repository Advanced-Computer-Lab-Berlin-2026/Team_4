// ITEMPOLICIES ROUTES - Owner: Member 6 - mounted automatically at /api/item-policies
const router = require('express').Router();
const c = require('../controllers/itemPolicies.controller');
const { protect } = require('../middleware/auth');
const { requireVerifiedLender } = require('../middleware/roles');
const { uploadManualFile } = require('../middleware/upload');
const { param } = require('express-validator');
const validate = require('../middleware/validate');

const itemIdParam = param('itemId').isMongoId().withMessage('Valid item id is required');

router.put('/:itemId/pickup', protect, requireVerifiedLender, itemIdParam, validate, c.setPickup); // Req 30
router.put('/:itemId/rules', protect, requireVerifiedLender, itemIdParam, validate, c.setRules); // Req 31
router.post('/:itemId/manual', protect, requireVerifiedLender, itemIdParam, validate, uploadManualFile, c.uploadManual); // Req 32
router.delete('/:itemId/manual', protect, requireVerifiedLender, itemIdParam, validate, c.removeManual); // Req 32

module.exports = router;
