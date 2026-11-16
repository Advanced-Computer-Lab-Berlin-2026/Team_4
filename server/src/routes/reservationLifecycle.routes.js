// RESERVATION LIFECYCLE ROUTES - Owner: Member 5 - mounted automatically at /api/reservation-lifecycle (Req 53, 54)
const router = require('express').Router();
const { param, query } = require('express-validator');
const c = require('../controllers/reservationLifecycle.controller');
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const validate = require('../middleware/validate');

// Any member (verified lenders too); admins can't. Status and dates are checked in the service.
const member = [protect, requireRole('member')];
const isText = (v) => typeof v === 'string';
const textQuery = (name, label) => query(name).optional().custom(isText).withMessage(`Choose one ${label}`);

router.get('/mine', ...member,
  textQuery('status', 'status'), textQuery('from', '"from" date'), textQuery('to', '"to" date'),
  textQuery('page', 'page'), textQuery('limit', 'page size'),
  validate, c.listMine); // Req 53, 54
router.get('/:id', ...member, param('id').isMongoId().withMessage('Invalid reservation'), validate, c.getOne); // Req 53

module.exports = router;
