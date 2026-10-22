/**
 * Shared constants. Add to this file only via a small PR announced to the team.
 */
module.exports = {
  CURRENCY: 'EGP',
  ROLES: { MEMBER: 'member', ADMIN: 'admin' },
  // "Verified Lender" = role 'member' + lenderStatus 'verified'
  LENDER_STATUS: { NONE: 'none', PENDING: 'pending', VERIFIED: 'verified', REJECTED: 'rejected' },
  USER_STATUS: { ACTIVE: 'active', SUSPENDED: 'suspended' },

  APPLICATION_STATUS: ['draft', 'pending', 'approved', 'rejected'],
  APPLICATION_DOC_TYPES: ['id_document', 'proof_of_address'],

  HOUSEHOLD_RELATIONS: ['spouse', 'child', 'parent'],
  HOUSEHOLD_STATUS: ['pending', 'accepted', 'declined'],

  MODERATION_STATUS: ['ok', 'flagged', 'removed'],

  // Allowed upload types (Req 3: PDF, JPEG, JPG, PNG)
  ALLOWED_DOC_MIME: ['application/pdf', 'image/jpeg', 'image/png'],
  ALLOWED_IMAGE_MIME: ['image/jpeg', 'image/png'],
  ALLOWED_EXT: ['.pdf', '.jpg', '.jpeg', '.png'],

  // Password policy (Req 10): >= 8 chars, 1 upper, 1 lower, 1 digit, 1 special
  PASSWORD_REGEX: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/,
  PASSWORD_HINT: 'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number and a special character.',

  TRUST_SCORE_DEFAULT: 50,

  // ---- Sprint 2 enums (declared now so the schema is stable) ----
  RESERVATION_STATUS: ['pending', 'confirmed', 'active', 'completed', 'cancelled', 'rejected'],
  DEPOSIT_STATUS: ['none', 'held', 'released', 'partially_forfeited', 'forfeited', 'refunded'],
  DELIVERY_STATUS: ['none', 'preparing', 'out_for_delivery', 'delivered'],
  FREE_CANCELLATION_HOURS: 48,
};
