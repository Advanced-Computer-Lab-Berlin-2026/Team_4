const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const controller = require('../controllers/notificationPreferences.controller');

router.get('/', protect, requireRole('member'), controller.get);
router.put('/', protect, requireRole('member'), controller.update);

module.exports = router;
