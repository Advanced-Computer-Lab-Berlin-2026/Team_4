# Member 2 — Payments, wallet, refunds and late fees (Sprint 2)

Owner: Aly (Member 2). Requirements: **50, 51, 52, 77, 78, 81** + atomic ledger, payment idempotency and calculation audit (NFR 14), Stripe-only card capture (NFR 4).

This file is the contract other members code against. Anything marked **(proposed)** still needs team confirmation; once agreed it should be copied into `docs/SPRINT2_CONTRACT.md` (Member 1).

---

## 1. Rules everyone can rely on

| Rule | What it means for you |
|---|---|
| Only Member 2 changes `User.walletBalance` | Never `$inc`/`$set` it yourself. Call a service below. |
| Amounts in **integer minor units** (piastres) | `amountMinor: 2550` = EGP 25.50. Services return minor units; convert with `fromMinor()` only when saving to an existing EGP Number field. |
| Every money call takes an **`idempotencyKey`** | Same key twice ⇒ the operation runs **once**; the second call returns the stored result with `replayed: true`. Same key with *different* inputs ⇒ `409`. Build keys from stable ids, e.g. `deposit:<reservationId>`, `late-fee:<reservationId>`. |
| Services accept an optional **MongoDB `session`** | Pass your session to run the money change inside *your* transaction (e.g. checkout creating reservations). Without one, the service starts its own transaction. |
| The browser never sends totals | Amounts come from server-side data (reservation snapshot, M6 quote, M8 tier price). |
| Every calculation is audited | Each operation writes an `AuditLog` row: action, reservation id, timestamp, inputs, result. |
| Insufficient funds never overdraw | Debits fail with `402 Insufficient wallet balance`; nothing is written. |

---

## 2. Policy values **(proposed defaults — confirm with M1/team)**

Kept in one file (`server/src/services/payments/config.js`) and exposed by `GET /api/payments/policy` so it is visible before payment.

| Setting | Default | Notes |
|---|---|---|
| Full-refund window | `FREE_CANCELLATION_HOURS` = 48 (existing constant) | |
| Refund reference point | reservation `startDate` | Hours between cancellation time and pickup start |
| Refund ≥ 48 h before start | 100 % | |
| Refund < 48 h before start | 50 % | Partial rate |
| Refund after start | 0 % | M1 decides whether cancelling is allowed at all then |
| Cancelled by lender / admin | 100 % | Borrower is never penalised for a lender cancellation |
| Late-fee grace period | 1 hour after `endDate` | |
| Late-fee rate | 10 % of the deposit per **started** day late | |
| Late-fee cap | 100 % of the deposit | |
| Late fee with low wallet | Charge what is available; record the rest as **outstanding**, collected automatically from the next wallet credit. No User schema change. | |
| Receiver of late fees / forfeitures | Lender's wallet | |
| Deposit return after card payment | Credited to the **wallet** (Req 52), not back to the card | |

---

## 3. Service contract (server-side functions other members call)

`require('../services/payments/payment')` — all functions are `async`, take `(input, { session } = {})`, and throw `ApiError` (`400` bad input, `402` insufficient funds, `404` not found, `409` key reused with different inputs / wrong state).

| Function | Called by | Input | Returns |
|---|---|---|---|
| `charge` | M1 checkout (wallet deposit), M8 membership (wallet) | `{ userId, amountMinor, currency:'EGP', purpose:'deposit'\|'membership', reference:{ type, id }, idempotencyKey }` | `{ operationId, chargedMinor, balanceMinor, replayed }` |
| `createCardPayment` *(step 4)* | M1 checkout, M8 membership | same as `charge` | `{ operationId, clientSecret, paymentIntentId }` — the client confirms it with `StripePaymentForm` |
| `releaseDeposit` | M5 good return, M3 after a "no damage" decision | `{ reservationId, idempotencyKey }` | `{ releasedMinor, balanceMinor, replayed }` |
| `quoteCancellationRefund` | M1 cancel screen (show before confirming) | `{ reservationId, cancelledAt, cancelledByRole }` | `{ depositMinor, rate, refundMinor, hoursBeforeStart, rule }` (no money moves) |
| `refundToWallet` | M1 cancellation, M1 checkout compensation | `{ reservationId, cancelledAt, cancelledByRole, idempotencyKey }` | `{ refundMinor, rate, rule, balanceMinor, replayed }` |
| `settleForfeiture` | M3 damage decision / dispute revision | `{ reservationId, targetForfeitMinor, idempotencyKey }` | `{ forfeitedTotalMinor, deltaMinor, releasedMinor }` — applies only the **difference** from what was already forfeited; bounded by the held deposit |
| `applyLateFee` | M5 return (called with the return time) | `{ reservationId, returnedAt, idempotencyKey }` | `{ lateFeeMinor, chargedMinor, outstandingMinor, daysLate }` |
| `creditReferral` | M9 first completed reservation | `{ userId, amountMinor, referralId, idempotencyKey }` | `{ creditedMinor, balanceMinor, replayed }` |

Reservation fields (`deposit.status`, `payment.*`, `cancellation.refundAmount`, `lateFee`) are **written by M1's `reservationCommands`** using the values returned above (convert with `fromMinor`). Member 2 never saves a whole reservation.

### Hooks Member 2 needs from others

| From | Hook | When Member 2 calls it |
|---|---|---|
| M1 | `onPaymentSucceeded({ reference, operationId, method }, { session })` | Verified Stripe webhook for a `deposit` payment |
| M8 | `onMembershipPaid({ reference, operationId }, { session })` | Verified Stripe webhook for a `membership` payment |

---

## 4. HTTP API

All responses use `{ entity }` or `{ items, total, page, limit, pages }`; errors are `{ message, errors? }`. Members see only their own data.

| Method | Path | Access | Req | Request | Response |
|---|---|---|---|---|---|
| GET | `/api/account/wallet` | member | 36 | — | `{ balance, balanceMinor, currency, outstandingLateFeesMinor }` (extends Sprint 1) |
| GET | `/api/wallet-ledger` | member | 36/78 | query `page`, `limit`, `type?` | `{ items:[{ _id, type, amount, amountMinor, balanceAfter, balanceAfterMinor, reference, note, createdAt }], total, page, limit, pages }` — own rows, newest first |
| GET | `/api/payments/late-fees` | member | 78 | query `page`, `limit` | `{ items:[{ reservationId, itemTitle, daysLate, lateFeeMinor, chargedMinor, outstandingMinor, chargedAt }], total, page, limit, pages, outstandingTotalMinor }` |
| GET | `/api/payments/policy` | public | 81/77 | — | `{ policy:{ freeCancellationHours, partialRefundPercent, lateFeePercentPerDay, lateFeeCapPercent, graceMinutes } }` |
| GET | `/api/payments/operations/:id` *(step 4)* | member (own) | 51 | — | `{ operation:{ _id, status, purpose, amountMinor } }` — the client polls this after card confirmation; success only after the verified webhook |
| POST | `/api/stripe-webhook` *(step 4)* | Stripe only (signature checked) | 51 | raw Stripe event | `{ received: true }` |

### Client components (imported by other owners)

| Component | Props | Used by |
|---|---|---|
| `PaymentMethodPicker` | `{ amountMinor, value, onChange, disabled }` — shows wallet balance, disables "Wallet" if too low, shows the refund/late-fee policy | M1 `CheckoutPage`, M8 membership |
| `StripePaymentForm` *(step 4)* | `{ clientSecret, operationId, onSuccess, onError }` — Stripe Elements only, card data never touches our server | M1 `CheckoutPage`, M8 membership |
| `WalletLedger` | `{ pageSize? }` | Member 2 `WalletPage` |

Client route (in `client/src/routes/sprint2/member2.routes.jsx`, wired by M1): `/account/late-fees` → `LateFeesPage` (member).

---

## 5. Data model changes (Member 2 models only)

- **`PaymentOperation`** (new): one row per money operation. `idempotencyKey` (unique), `kind`, `purpose`, `user`, `reference`, `amountMinor`, `currency`, `status` (`pending`/`succeeded`/`failed`), `requestHash`, `result`, `stripePaymentIntentId`.
- **`WalletTransaction`** (extended): adds `amountMinor`, `balanceAfterMinor`, `currency`, `operation`, `reference`. Existing `amount`/`balanceAfter` (EGP) kept for compatibility.
- **`AuditLog`** (extended): adds `amountMinor`, `currency`, `operation`, `inputs`, `result`. Existing `details`/`amount` kept.

No changes to `User` or `Reservation` are required.

---

## 6. What Member 2 needs from others

| From | What | Why | Status |
|---|---|---|---|
| **M1** | Stage 0: packages `stripe` (server), `@stripe/stripe-js` + `@stripe/react-stripe-js` (client); in `server/src/app.js` add `app.use('/api/stripe-webhook', express.raw({ type: 'application/json' }))` **before** `express.json`; `STRIPE_WEBHOOK_SECRET` in `config/env.js` and both `.env.example` files; wire `member2.routes.jsx` + a "Late fees" nav link (`/account/late-fees`); a client test runner | Stripe (Req 51), Late fees page, client tests | Requested |
| **M1** | `onPaymentSucceeded({ reference, operationId, method }, { session })` in `reservationCommands` | Verified card payment confirms the reservation | Requested |
| **M1** | `reservationCommands` save Member 2's returned amounts (`deposit.status`, `cancellation.refundAmount`, `lateFee`, `payment.*`) | M1 is the only Reservation writer | Requested |
| **M1** | Cancellation passes `cancelledAt` and `cancelledByRole` (`borrower` / `lender` / `admin`) to `refundToWallet` | Chooses the refund rate | Requested |
| **M1** | Keep the Reservation fields below stable (rename = tell Member 2) | Member 2 reads them | Requested |
| **M6** | Save the deposit quote on `reservation.deposit.amount` (EGP) when the reservation is created | Member 2 charges/refunds this snapshot, never recalculates | Requested |
| **M6 + M1** | Decide whether the delivery fee is paid together with the deposit (then it is refunded with the same %) or separately | Refund amount | **Open decision** |
| **M5** | Call `applyLateFee` and `releaseDeposit` with `returnedAt` on a good return | Days late, deposit release | Requested |
| **M3** | Call `settleForfeiture` with `targetForfeitMinor` (total to keep) | Damage settlement deltas | Requested |
| **M8** | `onMembershipPaid({ reference, operationId }, { session })`; pass `purpose:'membership'` and the membership id as `reference` | Card-paid memberships | Requested |
| **M9** | Decide the referral reward amount; call `creditReferral` with `referralId` | Req 99 | **Open decision** |

### Reservation fields Member 2 reads (owned by M1, read-only for Member 2)

`_id`, `borrower`, `lender`, `status`, `startDate`, `endDate`, `returnedAt`, `deposit.amount`, `deposit.status`, `deposit.forfeited`, `payment.method`, `payment.stripePaymentIntentId`, `fulfilment.deliveryFee`. All exist in `server/src/models/Reservation.js` today; no schema change is needed.

---

## 7. Testing

Server tests: `server/test/sprint2/member2.test.js` (Node's built-in runner, no extra packages). They need a MongoDB **replica set** (Atlas is one):

```bash
TEST_MONGO_URI="<your Atlas URI>" node --test server/test/sprint2/member2.test.js
```

The tests create and drop their own database (`member2_test_<pid>`), so your real data is untouched.
