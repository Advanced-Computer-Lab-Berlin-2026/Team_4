// Older Sprint 1 branches do not discover or serve the Sprint 2 route modules.
export const hasSprint2Routes = Object.keys(import.meta.glob('../../../routes/sprint2/member1.routes.jsx')).length > 0;

export const promoCodesPath = hasSprint2Routes ? '/admin/promo-codes' : '/admin/categories?tab=promo-codes';
export const promoUsagePath = hasSprint2Routes ? '/admin/promo-usage' : '/admin/categories?tab=promo-usage';

export function promoUsageFor(promoCodeId) {
  const separator = hasSprint2Routes ? '?' : '&';
  return `${promoUsagePath}${separator}promoCodeId=${encodeURIComponent(promoCodeId)}`;
}
