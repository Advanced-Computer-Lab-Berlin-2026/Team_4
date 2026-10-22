// AUTH ROUTES - Owner: Member 1 - mounted automatically at /api/auth
const router = require('express').Router();
const c = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth');
// Add express-validator chains + `validate` (middleware/validate) before the handler as needed.

router.post('/register', c.register); // Req 1
router.post('/login', c.login); // Req 4
router.post('/logout', c.logout); // Req 5
router.get('/me', protect, c.me); // Req 4

module.exports = router;
