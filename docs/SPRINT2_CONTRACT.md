# Sprint 2 integration contract

The Member 1 HTTP endpoints and test commands are in [Member 1](sprint2/member1.md). Use feature-specific backend route files and a default export of route entries in `client/src/routes/sprint2/memberN.routes.jsx`. React pages remain lazy and route declarations are discovered by the shared configuration. Keep paths unique.

| Owner | API and ownership |
| --- | --- |
| 1 | `availability.getAvailability(itemId, range, options?)` and `checkOverlap(itemId, range, excludeReservationId?, options?)` accept UTC date ranges and optional `session`. They include unexpired holds and pending, confirmed and active reservations. |
| 1 / 5 | Use `reservationCommands.transition({actorId,reservationId,action,session?,beforeCommit?})` for confirm/reject/pickup/return. Use `extend({actorId,reservationId,action,endDate?,session?})` for request/approve/reject. The hook runs in the booking transaction once for a committed transition. It may call transactional money and evidence operations and must tolerate a transaction retry. |
| 1 / 3 / 6 | `reservationCommands.withReservation({actorId,reservationId,session?}, callback)` passes the reservation, authenticated actor and session inside the item/borrower lock. A feature callback checks action-specific roles/state and saves only the fields it owns. |
| 1 / 7 | `holdForWaitlist({borrowerId,itemId,startDate,endDate,expiresAt,session?})` claims availability atomically. Pass the resulting hold ID as `holdId` on single-item checkout, with the matching borrower, item and dates. `releaseWaitlistHold({holdId,itemId,borrowerId,session?})` releases a claim. M7 owns queue eligibility, priority and expiry policy. |
| 5 | Checkout reads `BorrowList.entries` and removes only entries that still match the ID, item and dates it checked out. Borrow-list mutations should be field-scoped or use optimistic concurrency. Link the borrow-list page to `/checkout`. |
| 7 | Link item details to `/reserve/:itemId`, or link a waitlist offer directly to `/checkout?source=single&itemId=…&startDate=…&endDate=…&holdId=…`. |

Every writer of reservation status or dates uses the command layer. MongoDB handles lock contention within the transaction. In code with an existing session, call the command before any operation with a dependency on availability and acquire locks in stable order. Quote and availability reads are advisory until the transaction rechecks them. If a transaction can be retried, transactional mutations belong inside the callback and external side effects belong after commit.

## Member 2 payment module

Export the following from `server/src/services/payments/payment.js`.

- `chargeWalletCheckout(input, session)` atomically debits the total and writes ledger/audit rows for the supplied reservation IDs. Throw a validation or conflict error on insufficient funds. Return only once the mutations in the supplied transaction have succeeded.
- `settleCancellation(input, session)` credits the borrower's wallet after applying the cancellation policy, records audit data, and returns `{refundMinor}`. The input includes `reservationId, borrowerId, amountMinor, currency, cancelledAt, pickupDate, freeCancellationHours, idempotencyKey`.
- `startCardPayment(input)` starts or resumes a Stripe-hosted payment using the supplied idempotency key. Return `{state:"pending",redirectUrl}` for an active session. Use `/checkout/status/:attemptId` as the application's return path.
- `getCardPayment(input)` reads authoritative provider state. Return `{state:"pending",redirectUrl?}`, `{state:"failed"}` for definitive nonpayment, or `{state:"paid",reference,amountMinor,currency}`. When `closeExpired` is true, close further attempts definitively before returning failed. Handle late success and provider creation retries using the durable payment operation. A still-unknown result remains pending.
- `recordCardCheckout(input, session)` persists the ledger/audit records for a verified card payment before reservations commit. The input includes `paymentReference` and the reserved line IDs.
- `verifyCheckoutWebhook(rawBody, signature)` verifies a Stripe event and returns an affected checkout attempt ID, or `null` for unrelated events. Use the mounted raw-body route at `/api/stripe-webhook` as the single callback.
- `refundFailedCheckout(input)` compensates the verified provider payment identified by `paymentReference`, including any provider amount mismatch. This operation is retried using the same checkout reference and must be idempotent across instances.

Checkout payment input includes `attemptId, borrowerId, idempotencyKey, amountMinor, currency, expiresAt, lines`. Each line includes the planned `reservationId`. Wallet and cancellation mutations use the caller's MongoDB session. Stripe calls occur outside database transactions. Keep a durable Stripe operation and idempotency keys for initialization, compensation and callback processing. The server reconciles expired attempts and pending compensation in the background.

## Pricing, membership and events

- M6 exposes `validateBooking(actor,item,range,entitlements,{session})` from `policies/bookingPolicy.js` and `quote(item,range,entitlements,promo,fulfilment,{session,borrowerId})` from `pricing/depositQuote.js`. A quote contains `{amountMinor,deposit:{base,categoryMultiplier,tierDiscountPercent,promoDiscount,amount},fulfilment:{method,deliveryFee,deliveryAddress?},promoCode?}`. Deposit and fee fields use EGP. If a code is used, `promotions/promo.js` exposes `redeemCheckoutPromo({promoCodeId,reservationId,borrowerId},session)`, which atomically validates and records redemption. Delivery/promo UI components can call the existing checkout selection contract when their owner is ready.
- M8 exposes `getEntitlements(userId,at,session)` from `membership/entitlements.js`, returning `{discountPercent,maxConcurrentReservations, ...}`. M1 serializes the capacity check across items for each borrower. The baseline uses the stored individual tier and accepts ordinary pickup. Household quotes and delivery/promo selection require their owning integrations.
- M9 exposes `enqueueEvent(type,aggregateId,recipients,payload,eventKey,session)` from `notifications/eventOutbox.js`. Use the supplied session and deduplicate by event key. Events include `reservation_confirmed`, `reservation_cancelled`, `reservation_rejected`, `reservation_picked_up`, `reservation_completed` and `availability_changed`. Payload includes `reservationId,itemId,status,startDate,endDate`. Optional startup functions are `startNotificationWorker()` and `startReminders()` in `server/src/jobs/notificationWorker.js` and `server/src/jobs/reminders.js`. Production email delivery and reminder scheduling belong to Member 9.
