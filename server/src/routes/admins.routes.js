const router = require('express').Router();
const c = require('../controllers/admins.controller');
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const validate = require('../middleware/validate');
const { usernameRule, newPasswordRules } = require('./auth.validation');
router.post('/', protect, requireRole('admin'), [usernameRule(), ...newPasswordRules()], validate, c.createAdmin);
module.exports = router;
