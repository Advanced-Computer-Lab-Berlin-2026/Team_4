# Member 8 · Memberships and household benefits

| Req | User flow |
| --- | --- |
| 83 | Sign in as a member and open `/membership`. Basic, Plus and Premium are listed with fee, deposit discount, waitlist priority and reservation limit. |
| 84, 85 | Choose a paid tier, pick wallet or card, and pay. The tier is active for one year from payment. |
| 86 | The top of the **Membership** page shows the current tier, its renewal date, the deposit discount in effect and how many reservations count toward the limit. |
| 87 | Press **Cancel subscription** and confirm. Benefits remain until the renewal date. |
| 88 | Deposit quotes use the strongest discount among the member and their accepted household links. The **Household** page shows which discount applies and where it comes from. |
| 108 | Sign in as an admin and open `/admin/membership-report` for the number and share of members per tier. |

## Entitlement service

`server/src/services/membership/entitlements.js`, loaded automatically by `services/sprint2/bootstrap.js`.

`getEntitlements(userId, at = new Date(), session?)` returns

| Field | Meaning |
| --- | --- |
| `tier` | `{ id, name }` of the member's own effective tier, or `null` if no tier catalogue exists |
| `status` | `none`, `active`, `cancelled` or `expired`, evaluated at `at` |
| `expiresAt` | End of the paid period, or `null` on Basic |
| `discountPercent` | Deposit discount to apply, 0–100. Already includes the household rule |
| `discountSource` | `{ type: 'none' }`, `{ type: 'self', tierName }` or `{ type: 'household', userId, name, tierName }` |
| `waitlistPriority` | Best available own or accepted-household priority, 1 = top |
| `maxConcurrentReservations` | Own tier's limit; `undefined` means uncapped |
| `countedStatuses` | `['pending', 'confirmed', 'active']` |

It reads `User`, `MembershipTier` and `HouseholdLink` only, uses the supplied session for every read, and writes nothing. It does not import checkout or reservation services.

Also exported: `getReservationUsage(userId, session?)` → `{ counted, limit }` (advisory, for display), `COUNTED_RESERVATION_STATUSES`, `DEFAULT_MAX_CONCURRENT_RESERVATIONS`, `BASE_TIER_NAME`, `hasPaidPeriod(membership, at)` and `effectiveStatus(membership, at)`.

Consumers should use `discountPercent` as given and must not look up household links again.

## Policy decisions

**Tiers are data.** Fee, discount, priority and limit come from `MembershipTier` documents. Adding a tier needs no code change. A member with no paid tier is on the tier named `Basic`.

**Reservation limit.** A tier's own `maxConcurrentReservations` applies (Premium: 5). A tier without one gets the platform default of **3**, so Basic and Plus are both 3. The limit always comes from the member's own tier. If no tier document can be resolved at all (an unseeded database) there is no cap.

**What counts toward the limit.** Reservations where the member is the borrower with status `pending`, `confirmed` or `active`, plus the member's unexpired checkout or waitlist holds. `completed`, `cancelled` and `rejected` do not count. Member 1 enforces the limit inside the borrower lock; this service only supplies the number.

**Household discount.**
- Only links with status `accepted` qualify. Pending, declined and removed links give nothing, from the moment the status changes.
- Only direct links count. If A–B and B–C are linked, A gets nothing from C.
- The linked member must be an active member account whose own tier is in its paid period.
- The strongest single discount among the member and their linked members applies. Discounts never add up: Plus (10%) linked to Premium (20%) gets 20%.
- Accepted household links also share the highest waitlist priority (Req 25). Reservation limits, wallets and logins stay with each member.

**Subscribing and renewing.** A period is one calendar year (UTC). There is no automatic charge. Paying for the same tier during a paid period adds a year to the current renewal date. Paying for a different paid tier starts a new year immediately at that tier's full fee; the rest of the old period is not credited. Basic is free and is reached by cancelling or by expiry. An inactive tier (`isActive: false`) cannot be bought, but existing subscribers keep it until their period ends.

**Cancellation.** Status becomes `cancelled`. Discount, priority and limit stay until `renewsAt`, then the member is on Basic. No refund. The member can subscribe again at any time.

**Expiry.** Benefits end at the instant `renewsAt` passes. The check is made on every entitlement read, so no job is needed. The stored status changes to `expired` the next time the member's membership is read. Linked household members lose the tier’s shared benefits at the same instant.

**Existing reservations.** Expiry, cancellation and unlinking never change a reservation that already exists; its deposit keeps the discount it was quoted with. A member who is over a lower limit keeps their bookings and cannot add new ones until they are under it.

**Payment.** Membership fees go only through Member 2's payment service (`docs/sprint2/member2.md`, section 3). Each attempt has the idempotency key `membership:<userId>:<tierId>:<operationKey>`, so a retry with the same `operationKey` is replayed by Member 2 and never charged twice. The membership is updated in the same transaction as the wallet debit, or as the recording of a verified card payment whose amount and currency match the tier. When Member 2 answers `replayed: true` the payment was already applied, and the membership is not activated or extended again. While the payment service or one of its functions is missing (card functions exist only while a Stripe test key is configured), subscribing returns **503** and the membership is unchanged. The catalogue exposes only configured methods. No payment is simulated. Signed Stripe completion activates the tier even if the member never returns to the site. A retry or webhook uses the original saved card terms and cannot charge or extend the same renewal twice.

**Event.** After a successful subscribe, renew, switch or cancel, `membership_changed` is passed to Member 9's `enqueueEvent` when the outbox is installed: aggregate ID and recipient are the user ID, payload is `{ userId, tierId, tierName, status, renewsAt }`, and the event key is the payment idempotency key or `membership:<userId>:cancel:<renewsAt>`. It is sent after commit and is best effort: a missing or failing outbox never fails the membership change.

## HTTP contract

Mounted at `/api/memberships`. Errors use `{ message, errors? }`.

| Method | Path | Access | Request and response |
| --- | --- | --- | --- |
| GET | `/api/memberships/tiers` | public | Returns `{ items: [{ id, name, annualFee, depositDiscountPercent, waitlistPriority, maxConcurrentReservations, description }], total, paymentMethods }` for active tiers, cheapest first, with the effective limit filled in. |
| GET | `/api/memberships/me` | member | Returns `{ membership: { tier: { id, name }, status, subscribedAt, renewsAt, cancelAtPeriodEnd }, entitlements, usage: { counted, limit } }`. `subscribedAt` and `renewsAt` are `null` outside a paid period. |
| POST | `/api/memberships/subscribe` | member | Body `{ tierId, method: 'wallet' \| 'card', operationKey }`; the key is 8–100 characters of `A–Z a–z 0–9 _ -`. 200 with the same body as `/me` when the tier is active. 202 `{ payment: { state: 'pending', redirectUrl? } }` for a card payment in progress; post the same body again after returning from the provider. 400 invalid input or free tier, 404 unknown or inactive tier, 409 payment refused or not completed, 503 payment service unavailable. |
| POST | `/api/memberships/cancel` | member | No body. Returns the same body as `/me`. 409 if there is no active paid subscription. |
| GET | `/api/memberships/report` | admin | Returns `{ items: [{ tierId, name, members, percent }], total, byStatus: { active, cancelled }, generatedAt }`. Counts active member accounts by effective own tier at request time. Everyone without a paid period is counted under Basic. `byStatus` covers members in a paid period. |

`GET /api/household` (existing) additionally returns `benefit: { discountPercent, source }`, where `source` is the `discountSource` above.

Client routes: `/membership` (member), its notification redirect `/account/membership` (member), and `/admin/membership-report` (admin), declared in `client/src/routes/sprint2/member8.routes.jsx`.

## Needed from other members

| Owner | Request |
| --- | --- |
| 2 | Wallet and card contracts are integrated. Hosted card checkout requires the Stripe test key and signing secret on the shared webhook. |
| 1 | The role-specific navigation and CODEOWNERS entries are present. The existing raw Stripe webhook routes authenticated membership completions. |
| 6 | `depositQuote.js` uses `entitlements.discountPercent` unchanged. |
| 7 | The waitlist uses `entitlements.waitlistPriority`. It is the best priority currently available to the member, including eligible accepted household links. |
| 9 | Handle the `membership_changed` event. The renewal reminder can read `User.membership.renewsAt` for members with status `active`. |

Calls to Member 2, with `key = membership:<userId>:<tierId>:<operationKey>` and `reference = { type: 'membership', id: <userId> }`:

| Function | Input from Member 8 | Treated as already applied when |
| --- | --- | --- |
| `chargeMembership(input, session)` (wallet) | `{ userId, amountMinor, currency: 'EGP', reference, idempotencyKey: key }`, inside the membership transaction | `replayed: true` |
| `startCardPayment(input)` (card) | `{ purpose: 'membership', userId, reference, amountMinor, currency, idempotencyKey: key, title, returnPath: '/membership' }`, outside any transaction | — |
| `getCardPayment(input)` (card) | `{ idempotencyKey: key }`, outside any transaction | — |
| `recordMembershipPayment(input, session)` (card) | `{ userId, amountMinor, currency, reference, paymentReference, idempotencyKey: key + ':record' }`, inside the membership transaction | `replayed: true` |

The record call has its own key because the card payment is already a payment operation under `key`; reusing it would be refused as a different payment. The older `alreadyApplied: true` flag is honoured as well.

No `User.js` change is needed. Membership fields are written only by `services/membership/membership.js`, with field-scoped compare-and-set updates.

## Local verification

Run from the repository root against a disposable replica set or Atlas database.

```sh
TEST_MONGO_URI='mongodb://localhost:27017/?replicaSet=rs0' npm run test:sprint2 --prefix server
npm run test:sprint2 --prefix client
npm run build --prefix client
```

`server/test/sprint2/member8.test.js` covers: default and Premium limits, expired and cancelled tiers, pending / declined / removed / accepted links, no stacking, no transitive links, counted statuses, 503 without the payment service, single charge on retried keys, card confirmation, optional outbox, cancellation and the admin report. One test goes through Member 1's checkout quote end to end: Premium is refused at five counted reservations, Basic at three, and the deposit changes only for an accepted household link. Payment tests use a stand-in that follows Member 2's real rules: it refuses a reference that is not `{ type: 'membership', id }`, answers a reused key with `replayed: true`, and refuses a key reused for a different operation. Tests cover the exact inputs sent, the `:record` key, and that a replayed charge never extends `renewsAt`.

The suite also exercises the real Member 2 wallet service and a signed webhook with the installed Stripe SDK and simulated Checkout responses. Client tests cover payment options, cancellation and resuming the same card attempt.

Manual check: run `npm run seed`, sign in as a demo member and open `/membership` for the tier catalogue and payment options. Open `/household` for the discount banner. As an admin, open `/admin/membership-report`. Use Stripe test credentials for a hosted card check.
