// PASSWORDRESET ROUTES - Owner: Member 2 - mounted automatically at /api/password-reset
const router = require('express').Router();
const c = require('../controllers/passwordReset.controller');
// Add express-validator chains + `validate` (middleware/validate) before the handler as needed.

router.post('/request', c.requestOtp); // Req 11
router.post('/confirm', c.confirmReset); // Req 11

module.exports = router;
