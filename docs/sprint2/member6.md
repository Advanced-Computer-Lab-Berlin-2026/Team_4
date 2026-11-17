# Member 6 · Delivery and deposit promotions

Scope: 69–72 and 102–104. Delivery is configured on a saved listing in **Pickup & rules**. The item’s public detail links members to the shared reservation flow. Admins open promo codes and usage through the admin navigation or **Categories**. The routes use the existing cookie session and standard `{ message }` errors.

## Endpoints

| Method | Path | Access and contract |
| --- | --- | --- |
| GET | `/api/delivery/items/:itemId` | Member. Return `{ item: { id, offered, fee } }` for a public listing or the member’s own listing. |
| PATCH | `/api/delivery/items/:itemId` | Verified owning lender. Submit `{ offered, fee }` with a nonnegative EGP fee to two decimal places. Returns the saved settings. Disabling delivery clears the fee. |
| GET | `/api/delivery/reservations?page=1` | Participant. `{ items, hasNext }` lists the member’s delivery reservations with item title, delivery status and whether they can advance it. |
| GET | `/api/delivery/reservations/:id` | Participant. `{ reservation }` includes the delivery address on the individual record. |
| PATCH | `/api/delivery/reservations/:id` | Verified lender on the reservation. Submit `{ deliveryStatus }` and receive `{ reservation }`. Status advances from `preparing` to `out_for_delivery` to `delivered`. Final handover activates a confirmed reservation within the booked dates. |
| GET | `/api/promo-codes` | Admin. Paginated promo configuration and redemption counts. |
| POST | `/api/promo-codes` | Admin. Submit `code`, `discountType` (`percent` or `fixed`), and `discountValue`. Optional fields are `validFrom`, `validUntil`, `maxRedemptions`, and `onePerMember`. Returns `{ promoCode }`. |
| GET | `/api/promo-codes/usage` | Admin. Paginated redemption history. Filter by `promoCodeId` to view one code. Redeemed amounts come from the reservation’s saved deposit calculation. |

## Checkout and tracking

The shared checkout page sends pickup or delivery, a saved or manually entered address when needed, and an optional promo code. A borrow list can mix pickup and delivery by setting fulfilment for individual quote line IDs. Address, method and promo changes invalidate the displayed quote until the server returns a fresh one.

Pricing applies the category multiplier, membership discount and promo discount in that order, capping reductions at the deposit. The delivery fee is separate. Each discounted reservation consumes one redemption. Quotes reject carts that exceed the promo's count or one-per-member limit, and the booking transaction rechecks eligibility before recording redemption.

The delivery endpoint delegates the transition to M1's reservation command. It advances delivery in order, activates the booking at final handover, and can emit `delivery_status` to M9's outbox in the transaction. The detailed tracking endpoint exposes the address to the borrower and lender. The address is excluded from list and notification payloads.

The Sprint 2 route discovery and reservation/checkout services come from the shared baseline. Paid checkout uses Member 2’s payment module, household discounts use Member 8’s entitlements, and lender approval is part of the shared reservation lifecycle.

## Checks

Run `node --test server/test/sprint2/member6.test.js` from the project root. Set `TEST_MONGO_URI` to a disposable MongoDB replica set to additionally run the full HTTP checkout and delivery scenario. It uses a separate temporary database.
