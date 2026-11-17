const router = require('express').Router();
const c = require('../controllers/analytics.controller');
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');

router.use(protect, requireRole('admin'));

router.get('/usage', c.getUsageReport); // Req 94, 95
router.get('/usage/export', c.exportUsage); // Req 105
router.get('/damage', c.getDamageReport); // Req 96
router.get('/damage/export', c.exportDamage); // Req 105

module.exports = router;