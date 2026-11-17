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
| `startCardPayment(input)` | Card checkout (Req 51) | checkout payment input | `{ state:'pending', redirectUrl }` | Blocked: `stripe` package |
| `getCardPayment(input)` | Checkout status / reconcile | checkout payment input + `closeExpired` | `{ state:'pending'\|'failed'\|'paid', … }` | Blocked |
| `recordCardCheckout(input, session)` | Verified card payment | checkout payment input + `paymentReference` | — | Blocked |
| `verifyCheckoutWebhook(rawBody, signature)` | `POST /api/stripe-webhook` (mounted by M1) | raw Stripe event | attempt id or `null` | Blocked |
| `refundFailedCheckout(input)` | Paid card checkout that cannot be booked | checkout payment input + `paymentReference` | — | Blocked |

### Extra functions for other members

| Function | For | Input | Returns | Status |
|---|---|---|---|---|
| `charge(input, session)` | M8 membership paid by wallet | `userId, amountMinor, currency, purpose:'membership', reference:{ type:'membership', id }, idempotencyKey` | `{ chargedMinor, balanceMinor, operationId, replayed }` | ✅ Done |
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

- **`PaymentOperation`** (new): `idempotencyKey` (unique), `kind`, `purpose`, `user`, `reference{ type, id }`, `amountMinor`, `currency`, `status`, `requestHash`, `result`, `outstandingMinor`, `stripePaymentIntentId`.
- **`WalletTransaction`** (extended): `amountMinor`, `balanceAfterMinor`, `currency`, `operation`, `reference`; new type `lender_payout`. `amount`/`balanceAfter` (EGP) kept.
- **`AuditLog`** (extended): `amountMinor`, `currency`, `operation`, `inputs`, `result`. `details`/`amount` kept.

Reference types: `checkout`, `reservation`, `membership`, `referral`, `manual`. No changes to `User` or `Reservation` are needed.

---

## 6. Needed from others

| From | What | Why | Status |
|---|---|---|---|
| **M1** | `stripe` package in `server/package.json` | Card payments (Req 51) | **Missing** |
| **M1** | Client test runner (e.g. Vitest + Testing Library + jsdom) | `client/test/sprint2/member2.test.jsx` | **Missing** |
| **M1** | "Late fees" nav link → `/account/late-fees` in `navLinks.js` | Req 78 discoverability | **Missing** |
| **M1** | Use `PaymentMethodPicker` in `CheckoutPage` instead of the plain radios | Shows wallet balance and the policy before payment | Requested |
| **M1** | Update `member1.test.js:214` — it expects wallet checkout to be unavailable "without Member 2"; Member 2's module now exists, so that scenario must pass `deps` with `payment: undefined` (or expect `['wallet']`) | Test now fails by design | Requested |
| **M1** | Delivery fee on borrower cancellation: **decided** — refunded in full before handover; M1 passes `deliveryMinor` | Refund amount | ✅ Agreed with M1 |
| **M3** | Already matches: `settleForfeiture({ reservationId, amountMinor, idempotencyKey, session })` and `refundToWallet({ userId, amountMinor, reference: 'damage:<id>', ... })`. Please also set the reservation's `deposit.status` / `deposit.forfeited` after the decision (Member 2 does not write `Reservation`) | Damage settlement | Matches M3's code |
| **M8** | Agree the inputs of `chargeMembership` (wallet) and `recordMembershipPayment` (verified card payment), and a server-chosen card return path such as `/membership` (SPRINT2_CONTRACT.md). Waiting for M8's contract | Req 85 | **In discussion** |
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

They include end-to-end wallet checkouts through Member 1's real checkout code.

**Demo data (dev only):** fills one member's wallet history and a late fee through the real services, so the Wallet and Late fees pages have something to show. Safe to run twice:

```bash
node server/test/sprint2/member2.demo.js member1
```
