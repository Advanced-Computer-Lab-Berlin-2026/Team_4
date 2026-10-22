const { body } = require('express-validator');
const { PASSWORD_REGEX, PASSWORD_HINT } = require('../config/constants');

const isStrongPassword = (pw) => typeof pw === 'string' && PASSWORD_REGEX.test(pw);

/**
 * express-validator chain for a password field. Use everywhere a password is set
 * (register, change password, reset password, add admin) so the rule is identical.
 *   router.post('/x', passwordRule('newPassword'), validate, handler)
 */
const passwordRule = (field = 'password') =>
  body(field).custom((v) => {
    if (!isStrongPassword(v)) throw new Error(PASSWORD_HINT);
    return true;
  });

module.exports = { isStrongPassword, passwordRule, PASSWORD_HINT };
