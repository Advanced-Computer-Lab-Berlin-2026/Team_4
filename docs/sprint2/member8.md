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
| `waitlistPriority` | Own tier's priority, 1 = top |
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
- Only the deposit discount is shared. Waitlist priority and the reservation limit are never inherited. Wallets and logins stay separate.

**Subscribing and renewing.** A period is one calendar year (UTC). There is no automatic charge. Paying for the same tier during a paid period adds a year to the current renewal date. Paying for a different paid tier starts a new year immediately at that tier's full fee; the rest of the old period is not credited. Basic is free and is reached by cancelling or by expiry. An inactive tier (`isActive: false`) cannot be bought, but existing subscribers keep it until their period ends.

**Cancellation.** Status becomes `cancelled`. Discount, priority and limit stay until `renewsAt`, then the member is on Basic. No refund. The member can subscribe again at any time.

**Expiry.** Benefits end at the instant `renewsAt` passes. The check is made on every entitlement read, so no job is needed. The stored status changes to `expired` the next time the member's membership is read. Linked household members lose the shared discount at the same instant.

**Existing reservations.** Expiry, cancellation and unlinking never change a reservation that already exists; its deposit keeps the discount it was quoted with. A member who is over a lower limit keeps their bookings and cannot add new ones until they are under it.

**Payment.** Membership fees go only through Member 2's payment service, with the idempotency key `membership:<userId>:<tierId>:<operationKey>`. The membership is updated in the same transaction as the wallet debit, or after a verified card payment whose amount and currency match the tier. A retry with the same `operationKey` never charges or extends twice. While the payment service or one of the operations below is not installed, subscribing returns **503** and the membership is unchanged. A payment is never simulated.

**Event.** After a successful subscribe, renew, switch or cancel, `membership_changed` is passed to Member 9's `enqueueEvent` when the outbox is installed: aggregate ID and recipient are the user ID, payload is `{ userId, tierId, tierName, status, renewsAt }`, and the event key is the payment idempotency key or `membership:<userId>:cancel:<renewsAt>`. It is sent after commit and is best effort: a missing or failing outbox never fails the membership change.

## HTTP contract

Mounted at `/api/memberships`. Errors use `{ message, errors? }`.

| Method | Path | Access | Request and response |
| --- | --- | --- | --- |
| GET | `/api/memberships/tiers` | public | Returns `{ items: [{ id, name, annualFee, depositDiscountPercent, waitlistPriority, maxConcurrentReservations, description }], total }` for active tiers, cheapest first, with the effective limit filled in. |
| GET | `/api/memberships/me` | member | Returns `{ membership: { tier: { id, name }, status, subscribedAt, renewsAt, cancelAtPeriodEnd }, entitlements, usage: { counted, limit } }`. `subscribedAt` and `renewsAt` are `null` outside a paid period. |
| POST | `/api/memberships/subscribe` | member | Body `{ tierId, method: 'wallet' \| 'card', operationKey }`; the key is 8–100 characters of `A–Z a–z 0–9 _ -`. 200 with the same body as `/me` when the tier is active. 202 `{ payment: { state: 'pending', redirectUrl? } }` for a card payment in progress; post the same body again after returning from the provider. 400 invalid input or free tier, 404 unknown or inactive tier, 409 payment refused or not completed, 503 payment service unavailable. |
| POST | `/api/memberships/cancel` | member | No body. Returns the same body as `/me`. 409 if there is no active paid subscription. |
| GET | `/api/memberships/report` | admin | Returns `{ items: [{ tierId, name, members, percent }], total, byStatus: { active, cancelled }, generatedAt }`. Counts active member accounts by effective own tier at request time. Everyone without a paid period is counted under Basic. `byStatus` covers members in a paid period. |

`GET /api/household` (existing) additionally returns `benefit: { discountPercent, source }`, where `source` is the `discountSource` above.

Client routes: `/membership` (member) and `/admin/membership-report` (admin), declared in `client/src/routes/sprint2/member8.routes.jsx`.

## Needed from other members

| Owner | Request |
| --- | --- |
| 2 | In `services/payments/payment.js`: `chargeMembership(input, session)` debits the wallet and writes a `membership` ledger row in the supplied session. It throws a conflict error on insufficient funds and returns `{ reference, alreadyApplied }`, with `alreadyApplied: true` and no new debit when the idempotency key was used before. |
| 2 | `startCardPayment(input)` and `getCardPayment(input)` accept a membership payment: `input.purpose` is `'membership'` and `input.returnPath` is `/membership` instead of the checkout status page. |
| 2 | `recordMembershipPayment(input, session)` writes ledger and audit rows for a verified card payment (`input.paymentReference`) and returns `{ alreadyApplied }` in the same way. |
| 1 | `navLinks.js`: add `{ to: '/membership', label: 'Membership' }` to `memberLinks` and `{ to: '/admin/membership-report', label: 'Memberships' }` to `adminLinks`. Optionally a card on the admin dashboard. |
| 1 | `SPRINT2_CONTRACT.md`: replace the M8 line's `{discountPercent,maxConcurrentReservations, ...}` with the shape above. Add the new Member 8 paths to `CODEOWNERS`. |
| 6 | `depositQuote.js` uses `entitlements.discountPercent` unchanged. |
| 7 | The waitlist uses `entitlements.waitlistPriority`. It is the member's own tier and is not inherited through household links. |
| 9 | Handle the `membership_changed` event. The renewal reminder can read `User.membership.renewsAt` for members with status `active`. |

Payment input sent to Member 2: `{ purpose: 'membership', attemptId, userId, borrowerId, tierId, tierName, amountMinor, currency, reference, idempotencyKey, returnPath }`. `attemptId`, `reference` and `idempotencyKey` hold the same value.

No `User.js` change is needed. Membership fields are written only by `services/membership/membership.js`, with field-scoped compare-and-set updates.

## Local verification

Run from the repository root against a disposable replica set or Atlas database.

```sh
TEST_MONGO_URI='mongodb://localhost:27017/?replicaSet=rs0' npm run test:sprint2 --prefix server
npm run build --prefix client
```

`server/test/sprint2/member8.test.js` covers: default and Premium limits, expired and cancelled tiers, pending / declined / removed / accepted links, no stacking, no transitive links, counted statuses, 503 without the payment service, single charge on retried keys, card confirmation, optional outbox, cancellation and the admin report. One test goes through Member 1's checkout quote end to end: Premium is refused at five counted reservations, Basic at three, and the deposit changes only for an accepted household link. Payment tests use a stand-in for Member 2's service.

The Atlas user in `server/.env` cannot run `dropDatabase`. This suite falls back to dropping its collections. Member 1's suite does not yet, so on Atlas it passes but does not exit; run it with a time limit or use a local replica set. On networks whose DNS refuses Atlas SRV lookups, preload the repository's `dns-fix.js` with `NODE_OPTIONS="--require <repo>/dns-fix.js"`. There is no client test file because the client has no test runner.

Manual check: `npm run seed`, sign in with the DEV button as a member and open `/membership`; subscribing shows the "unavailable" message until Member 2's service is merged. Open `/household` for the discount banner. As admin open `/admin/membership-report`.
