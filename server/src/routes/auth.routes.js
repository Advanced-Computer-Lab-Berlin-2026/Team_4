// Member 1 — mounted at /api/auth.
const router = require('express').Router();
const { body } = require('express-validator');
const c = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { usernameRule, newPasswordRules } = require('./auth.validation');

router.post('/register', [
  usernameRule(), ...newPasswordRules(),
  body('name').isString().bail().trim().isLength({ min: 1, max: 100 }).withMessage('Name is required (up to 100 characters)'),
  body('email').isString().bail().trim().toLowerCase().isEmail().withMessage('Enter a valid email address'),
  body('phone').isString().bail().trim().matches(/^\+?[0-9\s-]{7,15}$/).withMessage('Enter a valid phone number'),
  body('address').isObject({ strict: true }).withMessage('Home address is required'),
  ...['street', 'city'].map((field) => body(`address.${field}`).isString().bail().trim().notEmpty().withMessage(`${field} is required`)),
  ...['state', 'postalCode', 'country'].map((field) => body(`address.${field}`).optional().isString().bail().trim()),
], validate, c.register);
router.post('/login', [usernameRule(),
  body('password').isString().bail().notEmpty().withMessage('Password is required'),
], validate, c.login);
router.post('/logout', c.logout);
router.get('/me', protect, c.me);
module.exports = router;
