// WAITLISTS ROUTES - Owner: Member 7 - mounted automatically at /api/waitlists
const router = require('express').Router();
const { body, param, query } = require('express-validator');
const c = require('../controllers/waitlists.controller');
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const validate = require('../middleware/validate');
const member = [protect, requireRole('member')];

router.post(
  '/', member,
  [body('itemId').isMongoId().withMessage('Invalid item'), body('startDate').isString(), body('endDate').isString()],
  validate, c.joinWaitlist, // Req 65
);
router.get('/mine', member, [query('item').optional().isMongoId().withMessage('Invalid item')], validate, c.listMyWaitlists); // Req 66
router.delete('/:id', member, [param('id').isMongoId().withMessage('Invalid waitlist entry')], validate, c.leaveWaitlist); // Req 66

module.exports = router;
