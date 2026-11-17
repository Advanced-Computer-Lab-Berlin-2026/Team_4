import { lazy } from 'react';

const PromoCodesPage = lazy(() => import('../../pages/admin/AdminPromoCodesPage'));
const PromoUsagePage = lazy(() => import('../../pages/admin/AdminPromoUsagePage'));
const CheckoutPage = lazy(() => import('../../components/sprint2/m6/DeliveryCheckoutPage'));
const DeliveryTrackingPage = lazy(() => import('../../components/sprint2/m6/DeliveryStatusPanel')
  .then(({ DeliveryTrackingPage: Page }) => ({ default: Page })));

export default [
  { path: '/admin/promo-codes', access: 'admin', element: PromoCodesPage },
  { path: '/admin/promo-usage', access: 'admin', element: PromoUsagePage },
  { path: '/checkout/delivery-promos', access: 'member', element: CheckoutPage },
  { path: '/delivery-tracking/:reservationId?', access: 'member', element: DeliveryTrackingPage },
];
