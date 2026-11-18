# Member 9 — Notifications, Preferences, and Referrals

This contract defines the Member 9 API, notification event shape, and policies. Routes are auto-mounted from `server/src/routes/<name>.routes.js` at `/api/<kebab-name>`.

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
| POST | `/share` | member | `{ shareKey }` (UUID sent after Copy link succeeds) | 204 |
| GET | `/report` | admin | Optional `page`, `limit` (1–50) | `{ items: ReferralReportRow[], total, page, limit, pages, totals: { referralsSent, signups, conversions, creditsIssuedMinor, currency } }` |

Each referral report row includes `{ _id, status, referrer: { _id, name, username }, referee: { _id, name, username } | null, creditAmountMinor, currency, createdAt, convertedAt }`. The admin report counts recorded Copy link actions separately from signups, conversions and credits. The browser cannot observe where the copied link is sent. Member endpoints expose a member’s own referrals.

Referral links use `/register?ref=<code>`. Member 1's signup controller passes the code to the referral service after creating the account. A code is case-insensitive and cannot be captured by its owner.

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

Outbox states are `pending`, `processing`, `sent`, and `failed`; failed attempts record `attempts`, `lastError`, `failedAt`, and `updatedAt`. Retries use capped exponential backoff. The worker renews active leases and recovers stale leases after a restart. Recipient delivery is isolated so a failed address cannot suppress another recipient’s notification. Notifications have a unique `{ user, eventKey }` key as a second idempotency guard. An SMTP acceptance followed by a crash before persistence can still result in a retry.

## Frozen reward and reminder policies

* Referral reward: **EGP 100.00** (`10000` minor units), credited once to the referrer only, after the referred member's **first completed reservation**. Referral capture must precede that first completion; accounts with a completed reservation cannot attach a referral code later. Signup, referral capture, and booking do not qualify. Only a distinct member account can be referred. A referee can be linked to one referral and earn no more than one conversion/reward. Self-referrals are rejected at capture and rechecked before credit.
* Wallet integration: call Member 2's `creditReferral({ userId, amountMinor: 10000, currency: 'EGP', reference, idempotencyKey })`. Do not write `User.walletBalance` from Member 9. Member 2's adapter in `server/src/services/payments/wallet.js` accepts the same MongoDB session as the referral conversion.
* Return reminder: one event for the borrower and lender when an active/confirmed reservation's current `endDate` is within the next **24 hours**. Deterministic key: `reminder:return:<reservationId>:<UTC-end-date>`. Date changes produce a new window key.
* Membership reminder: one event when an active membership's `renewsAt` is within the next **7 days**. Deterministic key: `reminder:membership:<userId>:<UTC-renewal-date>`.
* Both reminder windows are bounded on the lower end (future dates only), polled once per minute, and deduplicated by the durable outbox key across restarts. The worker rechecks the saved deadline and status before sending.

## Signup and preferences

The existing `User.js` fields hold notification preferences, the member’s referral code, and attribution. Preference updates use scoped atomic `$set` paths. Signup links the new user to their referrer. The credit is issued on the first completed reservation.

## Email delivery configuration

Email is sent through the existing Nodemailer dependency and configured `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM` environment settings. A missing SMTP configuration is a delivery failure for notifications. Password-reset codes can use the console in development. The jobs start after database initialization. The worker polls every second, applies bounded SMTP timeouts, retries failed sends, and records send/failure timestamps. Normal delivery is targeted within 60 seconds; actual SMTP availability and latency remain infrastructure-dependent.

## Frontend route handoff

The Member 9 route module exports routes for `/notifications` (member), `/account/notification-preferences` (member), `/referrals` (member), and `/admin/referrals` (admin). The shared route registry discovers the route module and the navbar mounts `NotificationBell` for members.
