// ADMINITEMS ROUTES - Owner: Member 9 - mounted automatically at /api/admin-items
const router = require('express').Router();
const c = require('../controllers/adminItems.controller');
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { query } = require('express-validator');
const validate = require('../middleware/validate');

router.get(
  '/',
  protect,
  requireRole('admin'),
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer').toInt(),
    query('limit').optional().isInt({ min: 1, max: 50 })
      .withMessage('Limit must be an integer between 1 and 50').toInt(),
  ],
  validate,
  c.listAllItems
); // Req 23

module.exports = router;
