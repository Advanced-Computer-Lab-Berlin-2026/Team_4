# Member 2 — Payments, wallet, refunds and late fees (Sprint 2)

Owner: Aly (Member 2). Requirements: **50, 51, 52, 77, 78, 81** + atomic ledger, payment idempotency and calculation audit (NFR 14), Stripe-only card capture (NFR 4).

The **official** interface is the "Member 2 payment module" section of [`docs/SPRINT2_CONTRACT.md`](../SPRINT2_CONTRACT.md) (Member 1). This file explains how Member 2 implements it, the extra functions other members use, the HTTP API, policy values and status.

---

## 1. Rules everyone can rely on

| Rule | What it means for you |
|---|---|
| Only Member 2 changes `User.walletBalance` | Never `$inc`/`$set` it yourself. Call a payment function. |
| Amounts in **integer minor units** (piastres) | `amountMinor: 2550` = EGP 25.50. Convert to EGP (`/ 100`) only when saving an existing EGP Number field. |
| Every money call takes an **`idempotencyKey`** | Same key twice ⇒ runs **once**; the second call returns the stored result (`replayed: true`). Same key with *different* inputs ⇒ `409`. |
| Pass your **MongoDB session** as the 2nd argument | `fn(input, session)` runs inside *your* transaction, so the money change commits or rolls back with your writes. Without a session the function starts its own transaction. |
| The browser never sends totals | Amounts come from server data (M1 quote/reservation snapshot, M8 tier price). |
| Every calculation is audited (NFR 14) | One `AuditLog` row per money change: action, reservation id, timestamp (`at`), inputs, result. |
| Insufficient funds never overdraw | Debits fail with **`409 Insufficient wallet balance`**; nothing is written. |

---

## 2. Policy values **(proposed defaults — confirm with the team)**

All in `server/src/services/payments/config.js`; public at `GET /api/payments/policy` so borrowers see them before paying.

| Setting | Default | Notes |
|---|---|---|
| Full-refund window | `FREE_CANCELLATION_HOURS` = 48 | Existing constant; M1 passes it as `freeCancellationHours` |
| Refund reference point | the reservation's pickup date (`pickupDate` = `startDate`, UTC midnight) | Hours between cancellation time and pickup |
| Refund ≥ 48 h before pickup | 100 % of the deposit | |
| Refund < 48 h before pickup | **50 %** of the deposit | M1 forbids cancelling on/after the pickup date |
| Borrower cancels a delivery reservation | Cancellation rule on the deposit only; delivery fee refunded **in full** (agreed with M1) | M1 calls `settleCancellation` with `deliveryMinor` |
| Lender rejects a request | 100 % of deposit **and** delivery fee | M1 calls `refundToWallet` |
| Admin damage decision (Req 62) | The admin's amount is kept (max = held deposit), the rest goes back to the borrower | M3 calls `settleForfeiture` |
| Dispute lowers the amount (Req 64) | Only the difference is refunded to the borrower and taken back from the lender (up to the lender's balance; any gap is recorded in the audit) | M3 calls `refundToWallet` with `reference: 'damage:<reportId>'` |
| A deposit is settled once | A good-condition release and a damage decision can't both happen for one reservation (409) | — |
| Late-fee grace | **60 minutes** after the due time | M1 only calls `applyLateFee` for late returns (`returnTiming.isLateReturn`) |
| Late-fee rate | **10 % of the deposit per started day** late | |
| Late-fee cap | **100 %** of the deposit | |
| Late fee with a low wallet | Charge what is available; record the rest as **outstanding** (`PaymentOperation.outstandingMinor`). Any later wallet credit (refund, returned deposit, reward) collects it automatically, oldest first, in the same transaction (audit action `late_fee_collected`). No User schema change. | ✅ Built |
| Receiver of forfeited deposit / late fee | Lender's wallet (ledger type `lender_payout`); set `forfeitedFundsTo: 'platform'` in `config.js` to keep it instead | **Open** |
| Refunds of card payments | Always to the **wallet** (Req 52) | |

---

## 3. Payment module (`server/src/services/payments/payment.js`)

Member 1's `services/sprint2/bootstrap.js` loads this file automatically. Missing functions make the related feature answer `503` (fails visibly, never fakes success).

### Called by Member 1 (names fixed by `SPRINT2_CONTRACT.md`)

| Function | Called when | Input (main fields) | Returns | Status |
|---|---|---|---|---|
| `chargeWalletCheckout(input, session)` | Checkout paid by wallet (Req 50) | `attemptId, borrowerId, idempotencyKey, amountMinor, currency, expiresAt, lines[{ reservationId, itemId, title, amountMinor, deposit, fulfilment, startDate, endDate }]` | `{ chargedMinor, balanceMinor, operationId, replayed }` | ✅ Done |
| `settleCancellation(input, session)` | Borrower cancels (Req 52, 81) | `reservationId, borrowerId, amountMinor` (deposit, may be 0)`, deliveryMinor` (default 0)`, currency, cancelledAt, pickupDate, freeCancellationHours, idempotencyKey` | `{ refundMinor, deliveryRefundMinor, ratePercent, rule, forfeitedMinor, paidToLenderMinor }` — the rule applies to the deposit only; the delivery fee is always refunded in full | ✅ Done |
| `refundToWallet(input, session)` | Lender rejects (full refund) | `reservationId, userId, reference, currency, idempotencyKey, amountMinor, depositMinor, deliveryMinor` | `{ refundMinor }` | ✅ Done |
| `releaseDeposit(input, session)` | Good return | same fields as `refundToWallet` | `{ releasedMinor }` | ✅ Done |
| `settleForfeiture(input, session)` | M3 damage decision (Req 62) | `reservationId, amountMinor` (to keep, 0 allowed)`, idempotencyKey: 'damage:<reportId>:decision'`; session as 2nd arg **or** inside the input | `{ forfeitedMinor, releasedMinor, paidToLenderMinor }` | ✅ Done |
| `refundToWallet(input, session)` — dispute form | M3 dispute resolution (Req 64) | `userId, amountMinor, reference: 'damage:<reportId>', idempotencyKey: 'damage:<reportId>:resolution'` (no `reservationId`) | `{ refundMinor, takenFromLenderMinor }` | ✅ Done |
| `applyLateFee(input, session)` | Late return (Req 77) | `reservationId, userId, reference, currency, idempotencyKey, returnedAt, endDate` | `{ feeMinor, chargedMinor, outstandingMinor, daysLate }` | ✅ Done |
| `startCardPayment(input)` | Card checkout (Req 51) | checkout payment input | `{ state:'pending', redirectUrl }` (Stripe-hosted page; returns to `/checkout/status/:attemptId`) | ✅ Done |
| `getCardPayment(input)` | Checkout status / reconcile | checkout payment input + `closeExpired` | `{ state:'pending', redirectUrl? }` \| `{ state:'failed' }` \| `{ state:'paid', reference, amountMinor, currency }` — `closeExpired` closes the Stripe page first | ✅ Done |
| `recordCardCheckout(input, session)` | Verified card payment | checkout payment input + `paymentReference` | `{ recordedMinor }` — one audit row per reservation; refuses a reference that is not a verified payment of this checkout | ✅ Done |
| `verifyCheckoutWebhook(rawBody, signature)` | `POST /api/stripe-webhook` (mounted by M1) | raw Stripe event | attempt id or `null`; bad signature → `400` | ✅ Done |
| `refundFailedCheckout(input)` | Paid card checkout that cannot be booked (or Stripe took a different amount) | checkout payment input + `paymentReference` | `{ refundedMinor, refundId }` — refunds the whole Stripe payment to the card, once | ✅ Done |

**Card functions are exported only while Stripe is configured with a TEST key** (`sk_test_…` in `server/.env`). Without a key, M1's quote simply does not offer "card". A live key (`sk_live_…`) is refused (test mode only, NFR 4). All Stripe calls live in `services/payments/stripe.js` (adapter) and `card.js`.

### Extra functions for other members

| Function | For | Input | Returns | Status |
|---|---|---|---|---|
| `charge(input, session)` | Wallet payment (deposit or membership) | `userId, amountMinor, currency, purpose, reference, idempotencyKey` | `{ chargedMinor, balanceMinor, operationId, replayed }` | ✅ Done |
| `chargeMembership(input, session)` | M8 membership paid by **wallet** | `userId, amountMinor, currency, reference:{ type:'membership', id }, idempotencyKey` | same as `charge` | ✅ Done (inputs to confirm with M8) |
| `startCardPayment(input)` — membership | M8 membership paid by **card** | `purpose:'membership', userId, reference:{ type:'membership', id }, amountMinor, currency, idempotencyKey, title?, returnPath?: '/membership'` (only listed return paths are accepted) | `{ state:'pending', redirectUrl }` | ✅ Done (to confirm with M8) |
| `recordMembershipPayment(input, session)` | M8, after `getCardPayment` says `paid` | `userId, amountMinor, currency, reference, paymentReference, idempotencyKey` | `{ chargedMinor, paymentReference }` | ✅ Done (to confirm with M8) |
| `quoteCancellationRefund(input)` | M1 / UI: show the refund before cancelling (no money moves) | `amountMinor, cancelledAt, pickupDate, freeCancellationHours?` | `{ ratePercent, rule, refundMinor, forfeitedMinor, hoursBeforePickup }` | ✅ Done |
| `calculateLateFee(input)` | UI / M5: show the fee a late return would cost (no money moves) | `depositMinor, endDate, returnedAt` | `{ feeMinor, daysLate, minutesLate, capped }` | ✅ Done |
| `creditReferral(input, session)` | M9 referral reward (Req 99). Also exported from `wallet.js`, where M9's code loads it | `userId, amountMinor, currency, reference: 'referral:<referralId>'` (or `referralId`), `idempotencyKey` | `{ creditedMinor, balanceMinor, operationId, replayed }` | ✅ Done |

---

## 4. HTTP API

Responses use `{ entity }` or `{ items, total, page, limit, pages }`; errors are `{ message, errors? }`. Members see only their own data.

| Method | Path | Access | Req | Request | Response | Status |
|---|---|---|---|---|---|---|
| GET | `/api/account/wallet` | member | 36 | — | `{ balance, balanceMinor, currency, outstandingLateFeesMinor }` | ✅ |
| GET | `/api/wallet-ledger` | member | 36/78 | query `page`, `limit`, `type?` | `{ items:[{ _id, type, amount, amountMinor, balanceAfter, balanceAfterMinor, reservation, reference, note, createdAt }], total, page, limit, pages }` | ✅ |
| GET | `/api/payments/late-fees` | member | 78 | query `page`, `limit` | `{ items:[{ _id, reservationId, itemTitle, dueAt, returnedAt, daysLate, lateFeeMinor, chargedMinor, outstandingMinor, chargedAt }], total, page, limit, pages, outstandingTotalMinor }` | ✅ |
| GET | `/api/payments/policy` | public | 77/81 | — | `{ policy:{ currency, cancellation:{ freeCancellationHours, partialRefundPercent }, lateFee:{ graceMinutes, percentOfDepositPerDay, capPercentOfDeposit } } }` | ✅ |
| POST | `/api/stripe-webhook` | Stripe only | 51 | raw signed event | `204` | Mounted by **M1** in `app.js`; calls `verifyCheckoutWebhook`. Member 2 does **not** add a route for it. |

Checkout itself (`POST /api/checkout/quote`, `POST /api/checkout`, `GET /api/checkout/:id`) belongs to M1 and calls the module above.

### Client components

| Component | Props | Used by | Status |
|---|---|---|---|
| `PaymentMethodPicker` | `{ amountMinor, methods, value, onChange, disabled, name? }` — wallet balance, "Wallet" disabled if too low, card note, policy summary | M1 `CheckoutPage` (replace its plain radios), M8 membership | ✅ Built |
| `WalletLedger` | `{ pageSize? }` | Member 2 `WalletPage` | ✅ |

Card payment uses a **Stripe-hosted page** (`redirectUrl`), so no card form is embedded in ShareShed and `StripePaymentForm` is not needed.

Client route (in `client/src/routes/sprint2/member2.routes.jsx`, discovered automatically): `/account/late-fees` → `LateFeesPage` (member).

---

## 5. Data model changes (Member 2 models only)

- **`PaymentOperation`** (new): `idempotencyKey` (unique), `kind`, `purpose`, `user`, `reference{ type, id }`, `amountMinor`, `currency`, `status`, `requestHash`, `result`, `outstandingMinor`, `stripePaymentIntentId`, `stripe{ sessionId, url, expiresAt, returnPath, refundId }`. No card data is ever stored.
- **`WalletTransaction`** (extended): `amountMinor`, `balanceAfterMinor`, `currency`, `operation`, `reference`; new type `lender_payout`. `amount`/`balanceAfter` (EGP) kept.
- **`AuditLog`** (extended): `amountMinor`, `currency`, `operation`, `inputs`, `result`. `details`/`amount` kept.

Reference types: `checkout`, `reservation`, `membership`, `referral`, `manual`. No changes to `User` or `Reservation` are needed.

---

## 6. Needed from others

| From | What | Why | Status |
|---|---|---|---|
| **M1** | `stripe` package, client test runner, "Late fees" nav link, `PaymentMethodPicker` in `CheckoutPage`, `member1.test.js` fix | | ✅ Done (PR #23) |
| **M1** | Delivery fee on borrower cancellation: **decided** — refunded in full before handover; M1 passes `deliveryMinor` | Refund amount | ✅ Agreed with M1 |
| **M3** | Already matches: `settleForfeiture({ reservationId, amountMinor, idempotencyKey, session })` and `refundToWallet({ userId, amountMinor, reference: 'damage:<id>', ... })`. Please also set the reservation's `deposit.status` / `deposit.forfeited` after the decision (Member 2 does not write `Reservation`) | Damage settlement | Matches M3's code |
| **M8** | Confirm the inputs of `chargeMembership`, membership `startCardPayment` and `recordMembershipPayment` (built as proposed in §3; return path `/membership`). Card memberships are confirmed by calling `getCardPayment` on the `/membership` page — the shared webhook only reconciles checkouts | Req 85 | **Built, waiting for M8's contract** |
| **M9** | Already matches: `creditReferral({ userId, amountMinor: 10000, currency, reference: 'referral:<id>', idempotencyKey })` from `wallet.js`. Reward EGP 100 (M9's md) | Req 99 | Matches M9's code |
| Done by M1 | Webhook mounted with raw body; `STRIPE_WEBHOOK_SECRET` in `env.js`; route modules auto-wired; `npm run test:sprint2` | | ✅ |

### Reservation fields Member 2 reads (owned by M1)

`_id`, `borrower`, `lender`, `status`, `startDate`, `endDate`, `returnedAt`, `deposit.amount`, `deposit.status`, `deposit.forfeited`, `payment.method`, `payment.stripePaymentIntentId`, `fulfilment.deliveryFee`, `checkoutAttempt`.

---

## 7. Testing

Server tests: `server/test/sprint2/member2.test.js` (Node's built-in runner). They need a MongoDB **replica set** (Atlas is one) and use their own temporary database:

```bash
cd server
TEST_MONGO_URI="<your Atlas URI>" node --test test/sprint2/member2.test.js
# or all Sprint 2 tests:
TEST_MONGO_URI="<your Atlas URI>" npm run test:sprint2
```

They include end-to-end wallet **and card** checkouts through Member 1's real checkout code. Card tests use a **fake Stripe** (same idempotency and signed-webhook behaviour), so no keys or network are needed.

Client tests: `client/test/sprint2/member2.test.jsx` (Vitest + Testing Library) — picker, wallet page, history filter, late fees, route:

```bash
npm run test:sprint2 --prefix client
```

**Trying a real card payment (test mode only):**
1. Stripe dashboard (Test mode) → Developers → API keys → put the `sk_test_…` key in `server/.env` as `STRIPE_SECRET_KEY` (never commit `.env`).
2. `brew install stripe/stripe-cli/stripe`, `stripe login`, then `stripe listen --forward-to localhost:<PORT>/api/stripe-webhook` (`PORT` from `server/.env`, e.g. 5001 — macOS uses 5000 for AirPlay) → put the printed `whsec_…` in `server/.env` as `STRIPE_WEBHOOK_SECRET`. Restart the server.
3. Check out with **Card**, pay with Stripe's test card `4242 4242 4242 4242` (any future date, any CVC). You return to `/checkout/status/:id`, which shows the confirmed reservation.

**Demo data (dev only):** fills one member's wallet history and a late fee through the real services, so the Wallet and Late fees pages have something to show. Safe to run twice:

```bash
node server/test/sprint2/member2.demo.js member1
```
