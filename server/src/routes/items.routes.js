// ITEMS ROUTES - Owner: Member 5 - mounted automatically at /api/items
const router = require('express').Router();
const c = require('../controllers/items.controller');
const { protect } = require('../middleware/auth');
const { requireVerifiedLender } = require('../middleware/roles');
const { uploadItemPhotos } = require('../middleware/upload');
// Add express-validator chains + `validate` (middleware/validate) before the handler as needed.

router.get('/mine', protect, requireVerifiedLender, c.listMyItems); // Req 21
router.post('/', protect, requireVerifiedLender, uploadItemPhotos, c.createItem); // Req 13
router.get('/:id', protect, requireVerifiedLender, c.getMyItem); // Req 14
router.put('/:id', protect, requireVerifiedLender, c.updateItem); // Req 14
router.post('/:id/photos', protect, requireVerifiedLender, uploadItemPhotos, c.addPhotos); // Req 13, 14
router.delete('/:id/photos/:photoId', protect, requireVerifiedLender, c.removePhoto); // Req 14
router.patch('/:id/archive', protect, requireVerifiedLender, c.archiveItem); // Req 15
router.patch('/:id/unarchive', protect, requireVerifiedLender, c.unarchiveItem); // Req 15

module.exports = router;
