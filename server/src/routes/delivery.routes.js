const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { requireRole, requireVerifiedLender } = require('../middleware/roles');
const delivery = require('../controllers/delivery.controller');

router.use(protect, requireRole('member'));
router.get('/items/:itemId', delivery.getItem);
router.patch('/items/:itemId', requireVerifiedLender, delivery.setItem);
router.get('/reservations', delivery.listReservations);
router.get('/reservations/:id', delivery.getReservation);
router.patch('/reservations/:id', requireVerifiedLender, delivery.setReservation);

module.exports = router;
