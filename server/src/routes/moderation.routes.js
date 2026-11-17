const router = require('express').Router();
const c = require('../controllers/moderation.controller');
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');

router.use(protect, requireRole('admin'));

router.get('/reports', c.getReports);
router.post('/reports', c.createReport);
router.patch('/reports/:id/action', c.reviewReport);

module.exports = router;