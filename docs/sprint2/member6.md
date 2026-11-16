# Member 6 · Delivery and deposit promotions

Scope: 69–72 and 102–104. Delivery is configured on a saved listing in **Pickup & rules**. The item’s public detail links members to the delivery and promo checkout. Admins open promo codes and redemptions through **Categories**. The routes use the existing cookie session and standard `{ message }` errors.

## Endpoints

| Method | Path | Access and contract |
| --- | --- | --- |
| GET | `/api/delivery/items/:itemId` | Member. Return `{ item: { id, offered, fee } }` for a public listing or the member’s own listing. |
| PATCH | `/api/delivery/items/:itemId` | Verified owning lender. Submit `{ offered, fee }` with a nonnegative EGP fee to two decimal places. Returns the saved settings. Disabling delivery clears the fee. |
| GET | `/api/delivery/reservations?page=1` | Participant. `{ items, hasNext }` lists the member’s delivery reservations with item title, delivery status and whether they can advance it. |
| GET | `/api/delivery/reservations/:id` | Participant. `{ reservation }` includes the delivery address on the individual record. |
| PATCH | `/api/delivery/reservations/:id` | Verified lender on the reservation. Submit `{ deliveryStatus }` and receive `{ reservation }`. Status advances from `preparing` to `out_for_delivery` to `delivered` on a confirmed or active reservation. |
| GET | `/api/promo-codes` | Admin. Paginated promo configuration and redemption counts. |
| POST | `/api/promo-codes` | Admin. Submit `code`, `discountType` (`percent` or `fixed`), and `discountValue`. Optional fields are `validFrom`, `validUntil`, `maxRedemptions`, and `onePerMember`. Returns `{ promoCode }`. |
| GET | `/api/promo-codes/usage` | Admin. Paginated redemption history. Filter by `promoCodeId` to view one code. Redeemed amounts come from the reservation’s saved deposit calculation. |

## Checkout and tracking

The Member 6 checkout calls the shared quote and checkout endpoints. It sends the selected pickup or delivery method, the profile or manually entered address when needed, and the optional promo code. The address is sent in the request body. Item visibility, availability, wallet or card payment, and reservation creation use the shared reservation engine.

The quote applies the category multiplier, the supplied membership discount, then the promo discount. It caps the reduction at the remaining deposit and keeps delivery fees separate. A successful checkout records redemptions in the same transaction as the reservations. The shared checkout prices each line with the same submitted options. A redemption applies to each reservation whose deposit was reduced. Use a per-member code on a single discountable line. Delivery for a borrow list requires all selected items to offer it.

Tracking displays an initial `preparing` for delivery reservations that still carry the schema’s `none` value. Changes use the shared reservation lock when available and update only delivery status. Dispatch follows lender approval. The notification outbox, when installed, receives `delivery_status` with a key unique to the reservation and stage. The delivery address is limited to the reservation participants and excluded from list results and notifications.

The Sprint 2 route discovery and reservation/checkout services come from the shared baseline. Paid checkout uses Member 2’s payment module, household discounts use Member 8’s entitlements, and lender approval is part of the shared reservation lifecycle.

## Checks

Run `node --test server/test/sprint2/member6.test.js` from the project root. Set `TEST_MONGO_URI` to a disposable MongoDB replica set to additionally run the full HTTP checkout and delivery scenario. It uses a separate temporary database.
