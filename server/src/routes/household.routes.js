// HOUSEHOLD ROUTES - Owner: Member 8 - mounted automatically at /api/household
const router = require('express').Router();
const { body, param } = require('express-validator');
const c = require('../controllers/household.controller');
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const validate = require('../middleware/validate');
const { HOUSEHOLD_RELATIONS } = require('../config/constants');

const validateSendRequest = [
  body('relation')
    .trim()
    .toLowerCase()
    .isIn(HOUSEHOLD_RELATIONS)
    .withMessage(`Relation must be one of: ${HOUSEHOLD_RELATIONS.join(', ')}`),
  body().custom((value, { req }) => {
    const hasContact =
      req.body.email ||
      req.body.phone ||
      req.body.emailOrPhone ||
      req.body.identifier ||
      req.body.contact;
    if (!hasContact || !String(hasContact).trim()) {
      throw new Error('Please provide the member email or phone number.');
    }
    return true;
  }),
  validate,
];

const validateRespondRequest = [
  param('id').isMongoId().withMessage('Invalid household request ID.'),
  body().custom((value, { req }) => {
    const raw = String(req.body.action || req.body.status || req.body.decision || '')
      .trim()
      .toLowerCase();
    if (!['accept', 'accepted', 'decline', 'declined', 'reject', 'rejected'].includes(raw)) {
      throw new Error('Action must be either "accept" or "decline".');
    }
    return true;
  }),
  validate,
];

const validateIdParam = [
  param('id').isMongoId().withMessage('Invalid household link ID.'),
  validate,
];

router.get('/', protect, requireRole('member'), c.listLinks); // Req 26
router.post('/requests', protect, requireRole('member'), validateSendRequest, c.sendRequest); // Req 24
router.patch(
  '/requests/:id/respond',
  protect,
  requireRole('member'),
  validateRespondRequest,
  c.respondToRequest
); // Req 25
router.delete('/:id', protect, requireRole('member'), validateIdParam, c.removeLink); // Req 27

module.exports = router;