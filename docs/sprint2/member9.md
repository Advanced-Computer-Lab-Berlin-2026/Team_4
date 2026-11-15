# Member 9 — Notifications, Preferences, and Referrals

This contract defines the Member 9 API, notification event shape, and policies before implementation. Routes are auto-mounted from `server/src/routes/<name>.routes.js` at `/api/<kebab-name>`.

## API

All authenticated endpoints use the existing cookie-based session. Success and error responses are JSON; errors use `{ "message": "...", "errors": []? }`.

### Notifications — `/api/notifications`

| Method | Path | Access | Request | Response |
|---|---|---|---|---|
| GET | `/` | member | Optional `page` (1-based), `limit` (1–50), `unreadOnly=true` | `{ items: Notification[], total, page, limit, pages }` |
| GET | `/unread-count` | member | — | `{ count }` |
| PATCH | `/:id/read` | member, own notification | — | `{ notification }` |
| PATCH | `/read-all` | member | — | `{ modifiedCount }` |

Notification entity: `{ _id, user, eventKey, type, category, title, message, link, readAt, email: { sent, status, sentAt, failedAt, lastError }, createdAt }`.

### Email preferences — `/api/notification-preferences`

| Method | Path | Access | Request | Response |
|---|---|---|---|---|
| GET | `/` | member | — | `{ preferences: { reservations, promotions, communityNotices } }` |
| PUT | `/` | member | `{ reservations?: boolean, promotions?: boolean, communityNotices?: boolean }` (partial update) | `{ preferences }` |

An opted-out email category never suppresses creation of the in-app notification. Unprovided categories retain their existing value. `system` notifications are email-enabled because the current `User.notificationPrefs` schema exposes only the three listed categories.

### Referrals — `/api/referrals`

| Method | Path | Access | Request | Response |
|---|---|---|---|---|
| GET | `/mine` | member | — | `{ referralCode, referralLink, items: Referral[], total, converted, totalCreditsMinor, currency }` |
| POST | `/capture` | member | `{ code }` | `{ referral }` |
| GET | `/report` | admin | Optional `page`, `limit` (1–50) | `{ items: ReferralReportRow[], total, page, limit, pages, totals: { referralsSent, conversions, creditsIssuedMinor, currency } }` |

Each referral report row includes `{ _id, code, status, referrer: { _id, name, username }, referee: { _id, name, username } | null, creditAmountMinor, currency, createdAt, convertedAt }`. The admin report includes aggregate counts and issued-credit totals; member endpoints only expose the current member's own referrals.

Referral links use `/register?ref=<code>`. Signup must capture the code for the newly created member by invoking the referral capture service (or the authenticated capture endpoint immediately after signup); the existing registration controller is Member 1-owned and is not changed here. A code is case-insensitive and cannot be captured by its owner.

## Event outbox contract

`enqueueEvent(type, aggregateId, recipients, payload, eventKey, session = null)` accepts `recipients` as an array of user IDs and persists:

```json
{
  "type": "confirmed",
  "aggregateId": "Mongo ObjectId",
  "recipients": ["Mongo ObjectId"],
  "payload": {},
  "eventKey": "reservation:ID:confirmed",
  "status": "pending",
  "attempts": 0,
  "availableAt": "date"
}
```

`eventKey` is unique. Duplicate enqueue attempts return the existing event; callers can pass a MongoDB session to commit the outbox insert atomically alongside their domain write. For availability changes, use `favorites.controller.enqueueAvailabilityChanged(itemId, payload, eventKey, session)` so the recipients are snapshotted from favorites in the same session before enqueueing.

Supported `type` values: `confirmed`, `cancelled`, `rejected`, `picked_up`, `returned`, `completed`, `availability_changed`, `damage_decision`, `damage_resolved`, `delivery_status`, `waitlist_promoted`, `membership_changed`, `membership_expiring`, `return_reminder`, and `notice_posted`. Event payloads may supply `title`, `message`, `link`, `category`, and `emailSubject`/`emailText`; missing presentation fields are derived from the event type and aggregate ID. `completed` additionally checks the borrower's first-completion referral eligibility. `availability_changed` targets favorited users, not waitlist subscribers.

Outbox states are `pending`, `processing`, `sent`, and `failed`; failed attempts record `attempts`, `lastError`, `failedAt`, and `updatedAt`. Retries use capped exponential backoff; processing leases allow recovery after a worker restart. Notifications have a unique `{ user, eventKey }` key as a second idempotency guard.

## Frozen reward and reminder policies

* Referral reward: **EGP 100.00** (`10000` minor units), credited once to the referrer only, after the referred member's **first completed reservation**. Referral capture must precede that first completion; accounts with a completed reservation cannot attach a referral code later. Signup, referral capture, and booking do not qualify. Only a distinct member account can be referred. A referee can be linked to one referral and earn no more than one conversion/reward. Self-referrals are rejected at capture and rechecked before credit.
* Wallet integration: call Member 2's `creditReferral({ userId, amountMinor: 10000, currency: 'EGP', reference, idempotencyKey })`. Do not write `User.walletBalance` from Member 9. The wallet-credit service is not present in the inspected repository; the adapter expects `server/src/services/payments/wallet.js` and reports a configuration error until Member 2 provides that interface. No success-shaped mock is used in production.
* Return reminder: one event when an active/confirmed reservation's current `endDate` is within the next **24 hours**. Deterministic key: `reminder:return:<reservationId>:<UTC-end-date>`. Date changes produce a new window key.
* Membership reminder: one event when an active membership's `renewsAt` is within the next **7 days**. Deterministic key: `reminder:membership:<userId>:<UTC-renewal-date>`.
* Both reminder windows are bounded on the lower end (future dates only), polled once per minute, and deduplicated by the durable outbox key across restarts.

## Existing user schema and Member 1 request

The inspected `User.js` already declares `notificationPrefs` (`reservations`, `promotions`, `communityNotices`), `referralCode`, and `referredBy`; no schema edit is requested. Preference updates use scoped atomic `$set` paths. Signup integration requested from Member 1: after account creation, pass an optional `ref` query/body code to the referral capture service, which links the new user to the referral without issuing a credit.

## Email delivery configuration

Email is sent through the existing Nodemailer dependency and configured `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM` environment settings. A missing SMTP configuration is a delivery failure (not console-only success). The worker polls every second, applies bounded SMTP timeouts, retries failed sends, and records send/failure timestamps. Normal delivery is targeted within 60 seconds; actual SMTP availability and latency remain infrastructure-dependent.

## Frontend route handoff

The Member 9 route module exports routes for `/notifications` (member), `/account/notification-preferences` (member), `/referrals` (member), and `/admin/referrals` (admin). The shared route registry and `Navbar.jsx` are Member 1-owned and are intentionally not edited; Member 1 must import these route definitions and place `NotificationBell` in the navbar.
