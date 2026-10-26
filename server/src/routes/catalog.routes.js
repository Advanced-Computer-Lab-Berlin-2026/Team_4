// CATALOG ROUTES - Owner: Member 7 - mounted automatically at /api/catalog
const router = require('express').Router();
const c = require('../controllers/catalog.controller');
// Both endpoints are public (Req 35: guests can browse) - no protect middleware on purpose.

router.get('/', c.listItems); // Req 16, 17, 18, 35
router.get('/:id', c.getItem); // Req 19, 20, 35

module.exports = router;