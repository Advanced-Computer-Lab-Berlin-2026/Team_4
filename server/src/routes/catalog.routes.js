// CATALOG ROUTES - Owner: Member 7 - mounted automatically at /api/catalog
const router = require('express').Router();
const c = require('../controllers/catalog.controller');
router.get('/', c.listItems); // Req 16, 17, 18, 35, 44
router.get('/:id/availability', c.getAvailability); // Req 43
router.get('/:id/alternatives', c.getAlternatives); // Req 92
router.get('/:id', c.getItem); // Req 19, 20, 35

module.exports = router;
