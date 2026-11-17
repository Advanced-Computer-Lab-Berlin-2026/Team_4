const router = require('express').Router();
const c = require('../controllers/supportTickets.controller');
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');

router.use(protect);

router.post('/', c.submitTicket);
router.get('/mine', c.getMyTickets);
router.get('/', requireRole('admin'), c.getAllTickets);
router.get('/:id', c.getTicket);
router.post('/:id/messages', c.replyTicket);
router.patch('/:id/resolve', requireRole('admin'), c.resolveTicket);

module.exports = router;