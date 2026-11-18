// WAITLISTS ROUTES - Owner: Member 7 - mounted automatically at /api/waitlists
const router = require('express').Router();
const mongoose = require('mongoose');
const { body, param, query } = require('express-validator');
const c = require('../controllers/waitlists.controller');
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const validate = require('../middleware/validate');
const { startWaitlistSweeper } = require('../services/waitlists/waitlist');

// Background expiry + promotion starts once the database connection is open (routes are auto-mounted at startup, so no
// change to M1's server.js / bootstrap is needed). Set WAITLIST_SWEEPER=off to disable (tests do).
if (process.env.WAITLIST_SWEEPER !== 'off') {
  const start = () => startWaitlistSweeper();
  if (mongoose.connection.readyState === 1) start(); else mongoose.connection.once('open', start);
}

const member = [protect, requireRole('member')];

router.post(
  '/', member,
  [body('itemId').isMongoId().withMessage('Invalid item'), body('startDate').isString(), body('endDate').isString()],
  validate, c.joinWaitlist, // Req 65
);
router.get('/mine', member, [query('item').optional().isMongoId().withMessage('Invalid item')], validate, c.listMyWaitlists); // Req 66
router.delete('/:id', member, [param('id').isMongoId().withMessage('Invalid waitlist entry')], validate, c.leaveWaitlist); // Req 66

module.exports = router;
