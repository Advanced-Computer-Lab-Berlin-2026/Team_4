// WALLET LEDGER ROUTES - Owner: Member 2 - mounted automatically at /api/wallet-ledger
const router = require('express').Router();
const { query } = require('express-validator');
const c = require('../controllers/walletLedger.controller');
const WalletTransaction = require('../models/WalletTransaction');
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const validate = require('../middleware/validate');

const TYPES = WalletTransaction.schema.path('type').enumValues;

router.get('/', protect, requireRole('member'),
  [query('type').optional().isIn(TYPES).withMessage(`type must be one of: ${TYPES.join(', ')}`)],
  validate, c.listMyLedger); // Req 36/78

module.exports = router;
