const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const controller = require('../controllers/reservations.controller');

router.use(protect, requireRole('member'));
router.get('/availability/:itemId', controller.availability);
router.get('/', controller.list);
router.get('/:id', controller.get);
router.post('/:id/cancel', controller.cancel);

module.exports = router;
