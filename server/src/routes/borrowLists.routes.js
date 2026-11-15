// BORROW LISTS ROUTES - Owner: Member 5 - mounted automatically at /api/borrow-lists (Req 46, 47, 48)
const router = require('express').Router();
const { body, param } = require('express-validator');
const c = require('../controllers/borrowLists.controller');
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const validate = require('../middleware/validate');

const isText = (v) => typeof v === 'string';
// Any member may borrow (verified lenders too); admins can't. Dates are checked in the service (real calendar days).
const member = [protect, requireRole('member')];
const dateFields = [
  body('startDate').custom(isText).withMessage('Choose a start date (YYYY-MM-DD)'),
  body('endDate').custom(isText).withMessage('Choose an end date (YYYY-MM-DD)'),
];
const entryIdParam = param('entryId').isMongoId().withMessage('Invalid borrow list entry');

router.get('/mine', ...member, c.getMyList); // Req 46-48
router.post('/mine/entries', ...member,
  body('itemId').custom(isText).withMessage('Choose an item').bail().isMongoId().withMessage('Choose a valid item'),
  ...dateFields, validate, c.addEntry); // Req 46
router.patch('/mine/entries/:entryId', ...member, entryIdParam, ...dateFields, validate, c.updateEntryDates); // Req 48
router.delete('/mine/entries/:entryId', ...member, entryIdParam, validate, c.removeEntry); // Req 47

module.exports = router;
