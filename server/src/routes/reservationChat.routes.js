const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const controller = require('../controllers/reservationChat.controller');

router.use(protect, requireRole('member'));
router.get('/:id/messages', controller.list);
router.post('/:id/messages', controller.send);

module.exports = router;
