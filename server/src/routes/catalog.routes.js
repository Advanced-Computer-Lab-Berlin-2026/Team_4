// CATALOG ROUTES - Owner: Member 7 - mounted automatically at /api/catalog
const router = require('express').Router();
const c = require('../controllers/catalog.controller');
const { optionalAuth } = require('../middleware/auth');
// All endpoints are public (Req 35). optionalAuth only lets us ignore the caller's OWN waitlist offer when
// computing availability; it never blocks guests.

router.get('/', optionalAuth, c.listItems); // Req 16, 17, 18, 35, 44
router.get('/:id/availability', optionalAuth, c.getAvailability); // Req 43
router.get('/:id/alternatives', optionalAuth, c.getAlternatives); // Req 92
router.get('/:id', c.getItem); // Req 19, 20, 35

module.exports = router;
