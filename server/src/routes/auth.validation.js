// Member 1 — validation shared by registration and admin creation.
const { body } = require('express-validator');
const { passwordRule } = require('../utils/validators');

exports.usernameRule = () => body('username').isString().bail().trim().toLowerCase()
  .matches(/^[a-z0-9_.]{3,30}$/)
  .withMessage('Username must be 3–30 letters, numbers, underscores or periods');
exports.newPasswordRules = () => [passwordRule('password'),
  body('password').custom((value) => typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= 72)
    .withMessage('Password must be at most 72 UTF-8 bytes')];
