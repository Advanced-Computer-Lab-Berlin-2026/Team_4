const router = require('express').Router();
const controller = require('../controllers/promoCodes.controller');
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');

router.use(protect, requireRole('admin'));
router.get('/', controller.list);
router.post('/', controller.create);
router.get('/usage', controller.usage);

module.exports = router;
