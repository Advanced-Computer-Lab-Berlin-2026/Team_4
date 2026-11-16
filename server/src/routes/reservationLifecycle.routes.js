// RESERVATION LIFECYCLE ROUTES - Owner: Member 5 - mounted automatically at /api/reservation-lifecycle (Req 53, 54, 56-60; answers: Req 56)
const router = require('express').Router();
const { param, query } = require('express-validator');
const c = require('../controllers/reservationLifecycle.controller');
const { protect } = require('../middleware/auth');
const { requireRole, requireVerifiedLender } = require('../middleware/roles');
const validate = require('../middleware/validate');

// Any member (verified lenders too); admins can't. Status and dates are checked in the service.
const member = [protect, requireRole('member')];
const isText = (v) => typeof v === 'string';
const textQuery = (name, label) => query(name).optional().custom(isText).withMessage(`Choose one ${label}`);

router.get('/mine', ...member,
  textQuery('status', 'status'), textQuery('from', '"from" date'), textQuery('to', '"to" date'),
  textQuery('page', 'page'), textQuery('limit', 'page size'),
  validate, c.listMine); // Req 53, 54
// Verified lenders only: the bookings of their own items. Must come before '/:id'.
router.get('/lending', protect, requireVerifiedLender,
  textQuery('status', 'status'), textQuery('from', '"from" date'), textQuery('to', '"to" date'),
  textQuery('page', 'page'), textQuery('limit', 'page size'), textQuery('item', 'item'), textQuery('needsAction', 'needsAction value'),
  validate, c.listLending); // Req 56-60
router.get('/lending/items', protect, requireVerifiedLender, c.lendingItems);
// Req 56: answer a request. Verified lenders only; Member 1's command checks this is the lender of the booking.
const reservationIdParam = param('id').isMongoId().withMessage('Invalid reservation');
router.patch('/:id/approve', protect, requireVerifiedLender, reservationIdParam, validate, c.approve);
router.patch('/:id/reject', protect, requireVerifiedLender, reservationIdParam, validate, c.reject);
router.get('/:id', ...member, param('id').isMongoId().withMessage('Invalid reservation'), validate, c.getOne); // Req 53

module.exports = router;
