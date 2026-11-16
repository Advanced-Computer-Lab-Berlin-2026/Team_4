import { lazy } from 'react';

const ReservePage = lazy(() => import('../../pages/reservations/ReservePage'));
const CheckoutPage = lazy(() => import('../../pages/checkout/CheckoutPage'));
const ReservationChatPage = lazy(() => import('../../pages/reservations/ReservationChatPage'));

export default [
  { path: '/reserve/:itemId?', access: 'member', element: ReservePage },
  { path: '/checkout', access: 'member', element: CheckoutPage },
  { path: '/checkout/status/:checkoutId', access: 'member', element: CheckoutPage },
  { path: '/my-reservations', access: 'member', element: ReservationChatPage },
  { path: '/my-reservations/:reservationId', access: 'member', element: ReservationChatPage },
];
