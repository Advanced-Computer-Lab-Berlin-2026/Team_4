const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const controller = require('../controllers/checkout.controller');

router.use(protect, requireRole('member'));
router.post('/quote', controller.preview);
router.post('/', controller.begin);
router.get('/:id', controller.status);

module.exports = router;
