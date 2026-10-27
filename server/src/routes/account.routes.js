// ACCOUNT ROUTES - Owner: Member 2 - mounted automatically at /api/account
const router = require('express').Router();
const { body } = require('express-validator');
const c = require('../controllers/account.controller');
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const validate = require('../middleware/validate');
const { passwordRule } = require('../utils/validators');

// bcrypt only looks at the first 72 bytes, so longer passwords would be silently truncated.
const maxBcryptBytes = (field) => body(field)
  .custom((v) => typeof v === 'string' && Buffer.byteLength(v, 'utf8') <= 72)
  .withMessage('Password must be at most 72 UTF-8 bytes');

const changePasswordRules = [
  body('currentPassword').isString().notEmpty().withMessage('Current password is required'),
  passwordRule('newPassword'),
  maxBcryptBytes('newPassword'),
];

// Every field is optional (partial update), but if sent it must be a valid value.
const addressField = (key, label, required) => {
  const chain = body(`address.${key}`).optional().isString().withMessage(`${label} must be text`).bail().trim();
  return required ? chain.notEmpty().withMessage(`${label} cannot be empty`) : chain.isLength({ max: 100 });
};
const profileRules = [
  body('phone').optional().isString().bail().trim()
    .matches(/^\+?[0-9\s-]{7,15}$/).withMessage('Invalid phone number'),
  body('address').optional().isObject().withMessage('Address must be an object'),
  addressField('street', 'Street', true),
  addressField('city', 'City', true),
  addressField('state', 'State', false),
  addressField('postalCode', 'Postal code', false),
  addressField('country', 'Country', true),
];

router.put('/password', protect, changePasswordRules, validate, c.changePassword); // Req 10
router.put('/profile', protect, requireRole('member'), profileRules, validate, c.updateProfile); // Req 12
router.get('/wallet', protect, requireRole('member'), c.getWallet); // Req 36

module.exports = router;
