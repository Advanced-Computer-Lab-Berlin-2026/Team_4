// FAVORITES ROUTES - Owner: Member 9 - mounted automatically at /api/favorites
const router = require('express').Router();
const c = require('../controllers/favorites.controller');
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
// Add express-validator chains + `validate` (middleware/validate) before the handler as needed.

router.get('/', protect, requireRole('member'), c.listFavorites); // Req 38
router.get('/ids', protect, requireRole('member'), c.listFavoriteIds); // Req 37
router.post('/:itemId', protect, requireRole('member'), c.addFavorite); // Req 37
router.delete('/:itemId', protect, requireRole('member'), c.removeFavorite); // Req 38

module.exports = router;
