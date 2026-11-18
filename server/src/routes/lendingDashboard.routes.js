// LENDING DASHBOARD ROUTES - Owner: Member 5 - mounted automatically at /api/lending-dashboard (Req 106)
const router = require('express').Router();
const { query } = require('express-validator');
const c = require('../controllers/lendingDashboard.controller');
const { protect } = require('../middleware/auth');
const { requireVerifiedLender } = require('../middleware/roles');
const validate = require('../middleware/validate');

router.get('/', protect, requireVerifiedLender,
  query('period').optional().custom((v) => typeof v === 'string').withMessage('Choose one period'),
  validate, c.getDashboard); // Req 106

module.exports = router;
