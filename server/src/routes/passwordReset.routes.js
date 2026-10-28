// PASSWORDRESET ROUTES - Owner: Member 2 - mounted automatically at /api/password-reset
const router = require('express').Router();
const { body } = require('express-validator');
const c = require('../controllers/passwordReset.controller');
const validate = require('../middleware/validate');
const { passwordRule } = require('../utils/validators');

// Same normalisation as the User model (trim + lowercase), so lookups match what was stored.
const emailRule = () => body('email').isString().bail().trim().toLowerCase()
  .isEmail().withMessage('Enter a valid email address');

const confirmRules = [
  emailRule(),
  body('otp').isString().bail().trim().matches(/^\d{6}$/).withMessage('The code is 6 digits'),
  passwordRule('newPassword'),
  body('newPassword').custom((v) => typeof v === 'string' && Buffer.byteLength(v, 'utf8') <= 72)
    .withMessage('Password must be at most 72 UTF-8 bytes'),
];

router.post('/request', [emailRule()], validate, c.requestOtp); // Req 11
router.post('/confirm', confirmRules, validate, c.confirmReset); // Req 11

module.exports = router;
