// CATALOG ROUTES - Owner: Member 7 - mounted automatically at /api/catalog
const router = require('express').Router();
const c = require('../controllers/catalog.controller');
// Add express-validator chains + `validate` (middleware/validate) before the handler as needed.

router.get('/', c.listItems); // Req 16, 17, 18, 35
router.get('/:id', c.getItem); // Req 19, 20, 35

module.exports = router;
