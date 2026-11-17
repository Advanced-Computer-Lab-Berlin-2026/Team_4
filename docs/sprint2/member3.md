# Sprint 2 — Member 3: Damage evidence, disputes, reviews and trust

**Owner:** Member 3 (Mostafa) · **Branch:** `mostafa_sprint2Features` · **Status:** DRAFT for team review

**Requirements:** 61, 62, 63, 64, 79, 80, 89, 90, 91, 97, 98

This is the contract other members can code against. Paths, access rules and response shapes are proposals until the team signs them off. After that, any change to them is announced in the team chat before it's merged. Values marked **(proposed)** are business rules the requirement sheet leaves open (see [§7](#7-decisions-to-confirm)).

Conventions are the same as Sprint 1 ([`docs/API_CONTRACT.md`](../API_CONTRACT.md)):
- **Responses:** success is a JSON object (`{ review }`, `{ items, total, page, limit, pages }`). Errors are `{ message, errors? }` with the right HTTP status.
- **Routes:** mounted automatically from `server/src/routes/<name>.routes.js` at `/api/<kebab-name>`.
- **Access levels:** **public** (anyone), **auth** (any logged-in user), **member**, **lender** (verified lender), **admin**, **participant** (the borrower or lender of that reservation, checked on the server).

---

## 1. Requirements → deliverables

| Req | Who | Requirement | Delivered by |
|---|---|---|---|
| 61 | Verified lender | Report a returned item as damaged, opening a damage report | `POST /api/damage-reports`, `DamageReportPage` |
| 62 | Admin | Review a damage report and decide the amount of deposit to forfeit | `PATCH /api/damage-reports/:id/decision`, `AdminDamageDecisionPage` |
| 63 | Member | Dispute a damage report decision made against me | `POST /api/damage-reports/:id/dispute`, `DamageReportPage` |
| 64 | Admin | Resolve a disputed damage report and record the final outcome | `PATCH /api/damage-reports/:id/resolution`, `AdminDamageDecisionPage` |
| 79 | Verified lender | Upload a condition photo at pickup and at return | `/api/condition-photos`, `ConditionPhotoPanel` |
| 80 | Admin | View the before/after condition photos attached to a damage report | `GET /api/damage-reports/:id` (includes photos), `AdminDamageDecisionPage` |
| 89 | Borrower | Rate and review the lender after a completed reservation | `POST /api/reviews`, `ReviewForm` |
| 90 | Lender | Rate and review the borrower after a completed reservation | `POST /api/reviews`, `ReviewForm` |
| 91 | Member | View a lender's or borrower's trust score and past reviews; also shown on item details | `/api/trust-profiles`, `TrustProfilePage`, `TrustSummary` |
| 97 | Member | View all reviews I have given and received | `GET /api/reviews/mine`, `MyReviewsPage` |
| 98 | System | Recalculate trust after each completed reservation, on-time return or damage report | `services/reviews/trust.js` → `recalculateTrust()` |

---

## 2. Damage reports and disputes (Req 61–64, 80)

### 2.1 Lifecycle

```
          lender reports            admin decides             borrower disputes          admin resolves
(none) ──────────────────▶ open ──────────────────▶ decided ──────────────────▶ disputed ──────────────────▶ resolved
                                                       │
                                                       └── no dispute within 7 days → decision is final (status stays "decided")
```

- **One report per reservation.** This is already enforced by the unique `reservation` index on `DamageReport`.
- **The deposit stays held while a report is `open`.** Member 5's "returned in good condition" action (Req 60) must be refused while a case is open. See `hasOpenDamageCase()` in [§6.1](#61-services-other-members-call).
- **Money moves exactly once per step.** Member 2 settles each step with a unique idempotency key:
  - **Decision:** keep `forfeitAmount` from the held deposit and release the rest to the borrower's wallet. Key: `damage:<reportId>:decision`.
  - **Resolution:** only refund the difference (`decision.forfeitAmount − resolution.finalForfeitAmount`) to the borrower's wallet. Key: `damage:<reportId>:resolution`.
  - **The final amount can only be lower or equal.** `finalForfeitAmount ≤ decision.forfeitAmount`, so a dispute can never cost the borrower more than the original decision.
- **Who receives the forfeited amount** (the lender as compensation, or the platform) is Member 2's settlement rule. This contract only passes the amount.

### 2.2 Endpoints — `/api/damage-reports` (`damageReports.routes.js`)

| Method | Path | Handler | Access | Req | Description |
|---|---|---|---|---|---|
| POST | `/api/damage-reports` | `createReport` | lender (participant) | 61 | Return an active reservation as damaged and open its report |
| GET | `/api/damage-reports/mine` | `listMyReports` | member | 61, 63 | Reports where I am the reporting lender or the borrower |
| GET | `/api/damage-reports` | `listReports` | admin | 62, 64 | Work queue, filter `?status=open\|decided\|disputed\|resolved`, paginated |
| GET | `/api/damage-reports/:id` | `getReport` | participant or admin | 62, 63, 64, 80 | One report with reservation summary and before/after photo metadata |
| PATCH | `/api/damage-reports/:id/decision` | `decideReport` | admin | 62 | Decide the forfeit amount (`open` → `decided`) |
| POST | `/api/damage-reports/:id/dispute` | `disputeReport` | borrower (participant) | 63 | Dispute the decision (`decided` → `disputed`) |
| PATCH | `/api/damage-reports/:id/resolution` | `resolveReport` | admin | 64 | Record the final outcome (`disputed` → `resolved`) |

**POST `/api/damage-reports`**
- **Request:** `{ reservationId, description }`. `description` must be 10–2000 characters.
- **How it works:** reporting damage *is* the return. The endpoint calls Member 1's `returnDamaged` command, which records the return (`returnedAt`, `completedAt`, `returnCondition: 'damaged'`), applies any late fee, refreshes both parties' trust and emits the completion event, while keeping the deposit held. The open report is inserted in the command's `beforeCommit` callback, in the same transaction, so a return can't be recorded as damaged without its case (docs/SPRINT2_CONTRACT.md, "Member 3 and Member 5 lifecycle").
- **Rules (all checked on the server):**
  - The caller is the reservation's lender and a verified lender.
  - The reservation is `active` (picked up, not yet returned). A reservation that already had a good return is completed and can't be reported.
  - The deposit is still `held`.
- **Response:** `201 { report }` when created. A retry after success returns `200 { report }` with the existing case.
- **Errors:**
  - `403` if the caller isn't a verified lender; `404` if they aren't a participant.
  - `409` if the reservation isn't active or was already completed with a good return.
  - `503` for an overdue return until Member 2's late-fee service exists. Nothing changes in that case.
  - `400` for an invalid body.
- Upload the return photos (§3) **before** reporting: once the report exists, the evidence is locked.

**PATCH `/api/damage-reports/:id/decision`**
- **Request:** `{ forfeitAmount, note }`.
  - `forfeitAmount` is in EGP, from 0 up to the reservation's held `deposit.amount`, rounded to 2 decimals.
  - `note` is required, 3–1000 characters.
  - `0` means "no forfeiture" and releases the whole deposit.
- **Effect:**
  1. Records `decision.{forfeitAmount, note, decidedBy, decidedAt}`.
  2. Calls Member 2's `settleForfeiture` (see §2.1). All steps run in one transaction: if settlement fails, the decision is rolled back and can be retried.
  3. Recalculates the borrower's trust score.
  4. Emits `damage.decided`.
- **Response `200`:** `{ report }`. Returns `501` until Member 2's payment service exists (`services/damage/settlement.js`), so nothing pretends money moved.
- **Errors:**
  - `409` if the report isn't `open`.
  - `400` if the amount is outside 0 to the held deposit.

**POST `/api/damage-reports/:id/dispute`**
- **Request:** `{ reason }`, 10–2000 characters.
- **Rules:** the caller is the borrower, the status is `decided`, the decision forfeited more than 0, and the dispute is within **7 days** of `decision.decidedAt` **(proposed)**. Only one dispute per report.
- **Response `200`:** `{ report }`.
- **Errors:** `403` if the caller isn't the borrower; `409` if the report isn't `decided`, has already been disputed, or the window has closed.

**PATCH `/api/damage-reports/:id/resolution`**
- **Request:** `{ finalForfeitAmount, note }`. `finalForfeitAmount` must be between 0 and `decision.forfeitAmount`.
- **Effect:**
  1. Records `resolution.*`.
  2. Refunds the difference through Member 2.
  3. Recalculates the borrower's trust score.
  4. Emits `damage.resolved`.
- **Response `200`:** `{ report }`. **Errors:** `409` if the report isn't `disputed`; `400` for an out-of-range amount.

**`report` shape** (as returned by `GET /:id`; list endpoints omit `photos`):

```json
{
  "_id": "…", "status": "open|decided|disputed|resolved", "description": "…",
  "reservation": { "_id": "…", "startDate": "…", "endDate": "…", "returnedAt": "…", "deposit": { "amount": 400, "status": "held" } },
  "item": { "_id": "…", "title": "…" },
  "reportedBy": { "_id": "…", "username": "…", "name": "…" },
  "borrower": { "_id": "…", "username": "…", "name": "…" },
  "decision": { "forfeitAmount": 150, "note": "…", "decidedBy": { "_id": "…", "name": "…" }, "decidedAt": "…" },
  "dispute": { "reason": "…", "at": "…" },
  "resolution": { "finalForfeitAmount": 100, "note": "…", "resolvedBy": { "_id": "…", "name": "…" }, "resolvedAt": "…" },
  "photos": { "pickup": [ /* photo */ ], "return": [ /* photo */ ] },
  "disputeDeadline": "…", "createdAt": "…", "updatedAt": "…"
}
```

**Member 4 (Req 96, 105)** owns the cross-platform damage/dispute *report* and its export. It reads `DamageReport` read-only and links each row to `/admin/damage-reports/:id`. `GET /api/damage-reports` is the decision work queue; Member 4 can reuse it or query the collection directly.

---

## 3. Condition photos (Req 79, 80)

Photos are evidence, so they are handled like the Sprint 1 lender documents:
- **Private storage:** stored under `server/uploads/private/condition-photos/` and never served statically.
- **Access:** streamed only to the reservation's participants and admins.
- **Metadata:** stored on the reservation (`conditionPhotos.pickup[]` / `conditionPhotos.return[]`) as `{ _id, path, takenAt, uploadedBy, originalName, mimeType, size }`. Upload uses Member 1's `uploadConditionPhotos` preset; Member 3 owns the per-stage cap, stage checks, locking, streaming and removing orphaned files if a save fails.

**Rules (proposed):**
- **Files:** JPG/JPEG/PNG only, max **5 MB** each, up to **5** per upload and **10** per stage.
- **Who uploads:** only the reservation's lender.
- **When:**
  - `pickup` photos: while the reservation is `confirmed` or `active`.
  - `return` photos: from `active` until 48 h after `returnedAt`.
- **Locking:** once a damage report exists for the reservation, its photos are **locked**. No more uploads or deletes, so the evidence the admin sees can't change.

### Endpoints — `/api/condition-photos` (`conditionPhotos.routes.js`)

| Method | Path | Handler | Access | Req | Description |
|---|---|---|---|---|---|
| GET | `/api/condition-photos/:reservationId` | `listPhotos` | participant or admin | 79, 80 | `{ photos: { pickup: [photo], return: [photo] }, canUpload: { pickup, return } }` |
| POST | `/api/condition-photos/:reservationId/:stage` | `uploadPhotos` | lender (participant) | 79 | Multipart `photos[]`; `stage` = `pickup` \| `return`. Response `201`: `{ photos }` (all photos for the reservation) |
| GET | `/api/condition-photos/:reservationId/:photoId/file` | `streamPhoto` | participant or admin | 79, 80 | Streams the image (`Content-Type: image/*`) |
| DELETE | `/api/condition-photos/:reservationId/:photoId` | `removePhoto` | lender (participant) | 79 | Remove a photo while its stage is still open and no damage report exists |

**`photo` shape:** `{ "_id": "…", "stage": "pickup|return", "originalName": "…", "mimeType": "image/jpeg", "size": 123456, "uploadedBy": "…", "takenAt": "…" }`

Like Sprint 1's `DocumentPreview`, the client fetches the file as a Blob through the authenticated endpoint. No private file path is ever sent to the browser.

---

## 4. Reviews (Req 89, 90, 97)

**Rules (proposed):**
- **Who:** only the reservation's borrower or lender may review, and only the other party (`direction` is derived on the server, never sent by the client).
- **When:** only once the reservation status is `completed`, and within **14 days** of completion.
- **How many:** one review per author per reservation. This is already enforced by the unique `{ reservation, reviewer }` index on `Review`.
- **Content:** `rating` is a whole number 1–5. `comment` is optional, up to 1500 characters.
- **No editing or deleting** once posted, so reviews can't be changed after the trust score is calculated.
- **Trust:** posting a review recalculates the reviewee's trust score.

### Endpoints — `/api/reviews` (`reviews.routes.js`)

| Method | Path | Handler | Access | Req | Description |
|---|---|---|---|---|---|
| POST | `/api/reviews` | `createReview` | member (participant) | 89, 90 | `{ reservationId, rating, comment? }` → `201 { review }` |
| GET | `/api/reviews/mine` | `listMyReviews` | member | 97 | `?type=given\|received` (default `received`), paginated |
| GET | `/api/reviews/pending` | `listPendingReviews` | member | 89, 90 | Completed reservations I can still review: `{ items: [{ reservationId, item, otherParty, direction, reviewBy }] }` |
| GET | `/api/reviews/user/:userId` | `listUserReviews` | auth | 91 | Reviews received by a user, newest first, paginated |

**Errors** for `POST`:
- `403` if the caller isn't a participant.
- `409` if the reservation isn't completed, the review window has closed, or the caller has already reviewed it.
- `400` for an invalid rating or comment.

**`review` shape:**

```json
{
  "_id": "…", "reservation": "…", "item": { "_id": "…", "title": "…" },
  "direction": "borrower_to_lender|lender_to_borrower",
  "reviewer": { "_id": "…", "username": "…", "name": "…" },
  "reviewee": { "_id": "…", "username": "…", "name": "…" },
  "rating": 4, "comment": "…", "createdAt": "…"
}
```

---

## 5. Trust (Req 91, 98)

### 5.1 Formula (proposed, to freeze at kickoff)

The trust score is **recalculated from the full history every time** instead of being adjusted step by step. Running it twice for the same event gives the same result, so repeated or retried events can't inflate the score. That covers the plan's "repeated completion events do not inflate trust" acceptance check without a separate deduplication table.

**Inputs for user U:**

| Symbol | Meaning |
|---|---|
| `C` | Reservations with status `completed` where U was the borrower or the lender |
| `R` | Completed reservations where U was the borrower (returns U was responsible for) |
| `T` | Of `R`, returns at or before the deadline, `endDate` at 00:00 UTC (Member 1's `returnTiming.isLateReturn`) |
| `D` | Damage reports against U as borrower whose final amount is > 0 (`resolution.finalForfeitAmount`, else `decision.forfeitAmount`). Open reports don't count until they're decided. |
| `avg`, `n` | Average rating and number of reviews U has received |

**Calculation:**

```
onTime     = R > 0 ? T / R : 1                      // 0..1
damageFree = R > 0 ? max(0, 1 − 2·D / R) : 1         // each upheld damage costs twice its share
rating     = n > 0 ? (avg − 1) / 4 : 0.75            // 0..1, neutral-good prior when unrated
perf       = 0.50·onTime + 0.35·damageFree + 0.15·rating
k          = C / (C + 5)                             // confidence: history weighs more as C grows
trust      = round( 50·(1 − k) + 100·perf·k )        // clamp 0..100; new users start at 50 (TRUST_SCORE_DEFAULT)
```

**Why this shape:**
- **Mostly behaviour, not ratings.** On-time returns and damage history make up 85% of the performance part; ratings are 15%, so ratings alone can't drive the score.
- **Confidence grows with history.** The score moves toward the user's actual performance as completed reservations add up. A new user starts at 50; five perfect reservations give 75; twenty give about 90.
- **Lenders who never borrow** are rated on completed reservations and reviews only (`onTime` and `damageFree` default to 1).

**Example scores:**

| Profile | C | R | T | D | Reviews | Score |
|---|---|---|---|---|---|---|
| New account | 0 | 0 | 0 | 0 | — | 50 |
| 5 completed, all on time, no damage, avg 5★ | 5 | 5 | 5 | 0 | 5 × 5★ | 75 |
| 10 completed, 8 on time, 1 damage, avg 4★ | 10 | 10 | 8 | 1 | 10 × 4★ | 70 |
| 4 completed, 1 on time, 2 damages, avg 2★ | 4 | 4 | 1 | 2 | 4 × 2★ | 35 |
| 20 completed, all on time, no damage, avg 5★ | 20 | 20 | 20 | 0 | 20 × 5★ | 90 |

The same recalculation also overwrites the existing `User.stats` counters (`completedReservations`, `onTimeReturns`, `lateReturns`, `damageReports`, `ratingSum`, `ratingCount`) with the recalculated values, using a field-level update of `trustScore` and `stats.*` only. **Req 31** (Member 6's `minTrustScore` rule) keeps reading `user.trustScore` unchanged.

### 5.2 When it runs (Req 98)

| Event | Producer | Recalculated for |
|---|---|---|
| Reservation completed (good return or return with damage case) | Member 1 / Member 5 | Borrower and lender |
| Late fee applied / return recorded | Member 1 / Member 2 | Borrower |
| Damage decision or resolution | Member 3 | Borrower |
| Review created | Member 3 | Reviewee |
| Admin repair (`POST /api/trust-profiles/:userId/recalculate`) | Member 3 | That user |

### 5.3 Endpoints — `/api/trust-profiles` (`trustProfiles.routes.js`)

| Method | Path | Handler | Access | Req | Description |
|---|---|---|---|---|---|
| GET | `/api/trust-profiles/:userId` | `getTrustProfile` | public | 91 | Public summary, also used by `TrustSummary` on item details (which guests can open) |
| GET | `/api/trust-profiles/me` | `getMyTrustProfile` | member | 91 | Own profile |
| POST | `/api/trust-profiles/:userId/recalculate` | `recalculate` | admin | 98 | Manually recalculate a user's trust score (repair tool) |

**`profile` shape.** Only public-safe fields: no email, phone or address.

```json
{
  "user": { "_id": "…", "username": "…", "name": "…", "isVerifiedLender": true, "memberSince": "…" },
  "trustScore": 70,
  "stats": { "completedReservations": 10, "onTimeRate": 0.8, "upheldDamageReports": 1, "ratingAverage": 4.0, "ratingCount": 10 }
}
```

The past reviews for Req 91 come from `GET /api/reviews/user/:userId`. It needs a login, as the requirement is written for members; guests see only the score.

---

## 6. Hand-off interfaces

### 6.1 Services other members call

| Function (file) | Used by | Contract |
|---|---|---|
| `recalculateTrust(userId, { eventKey?, session? })` — `services/reviews/trust.js` | Members 1, 5 | Recalculates from history and saves `trustScore` + `stats`. Safe to call repeatedly. Returns `{ trustScore, stats }`. `eventKey` is only logged. |
| `getTrustSummary(userId)` — `services/reviews/trust.js` | Member 6 (optional), Member 7 | Returns the `profile` object from §5.3 without HTTP |
| `hasOpenDamageCase(reservationId, { session? })` — `services/damage/damage.js` | Member 5 (Req 60) | `true` while a report is `open`. For the UI: Member 1's `return` command already refuses a good return once a case exists. |
| `getEvidence(reservationId, actor)` — `services/damage/conditionPhotos.js` | Member 5 | Photo metadata after the participant/admin check; throws `403` otherwise |

### 6.2 React components other members embed

| Component (`client/src/components/sprint2/m3/`) | Embedded by | Props |
|---|---|---|
| `TrustSummary` | Member 7 — `ItemDetailsPage` (owner's score, Req 91) | `{ userId, compact? }` shows score, rating average, review count and a link to `/users/:userId/trust` |
| `ConditionPhotoPanel` | Member 5 — lender reservation details page | `{ reservationId, onChange? }` shows pickup/return photos, upload and remove controls when allowed (the server decides through `canUpload`) |
| `ReviewForm` | Member 5 — reservation details (after completion) | `{ reservationId, onSuccess? }` with a 1–5 rating and a comment; hides itself if no review is possible |

### 6.3 Client routes (`client/src/routes/sprint2/member3.routes.jsx`, wired once by Member 1)

| Path | Page | Access |
|---|---|---|
| `/damage-reports/new?reservation=:id` | `DamageReportPage` (create) | lender |
| `/damage-reports/:id` | `DamageReportPage` (view, and dispute for the borrower) | member |
| `/admin/damage-reports/:id` | `AdminDamageDecisionPage` (evidence, decision, resolution) | admin |
| `/reviews/mine` | `MyReviewsPage` (given and received tabs, plus pending reviews) | member |
| `/users/:userId/trust` | `TrustProfilePage` (score, stats, reviews received) | auth |

### 6.4 Events for notifications (Member 9)

Emitted through Member 9's `enqueueEvent(type, aggregateId, recipients, payload, eventKey, session)`. Each event is written in the same transaction as the state change.

| Event type | Event key | Recipients |
|---|---|---|
| `damage.reported` | `damage:<id>:reported` | Borrower, admins |
| `damage.decided` | `damage:<id>:decided` | Borrower, lender |
| `damage.disputed` | `damage:<id>:disputed` | Lender, admins |
| `damage.resolved` | `damage:<id>:resolved` | Borrower, lender |
| `review.created` | `review:<id>:created` | Reviewee |

---

## 7. Decisions to confirm

None of these values are in the requirement sheet. They are the proposals used above. Each lives in one config object in Member 3's services, so changing one is a one-line edit.

| # | Decision | Proposal |
|---|---|---|
| D1 | Trust formula weights | §5.1: 50% on-time, 35% damage-free, 15% rating; confidence `C/(C+5)` |
| D2 | When damage is reported | At return time, through Member 1's `returnDamaged` (agreed with Member 1) |
| D3 | Dispute window | 7 days after the decision; one dispute per report |
| D4 | Dispute outcome range | Final amount between 0 and the original decision; only the difference is refunded |
| D5 | Review window | 14 days after completion; no editing or deleting |
| D6 | Condition photo limits | JPG/PNG, 5 MB, 5 per upload, 10 per stage; locked once a damage report exists |
| D7 | Who receives forfeited deposits | Member 2's settlement rule (lender compensation is assumed) |
| D8 | Trust profile visibility | Score public (it's shown on item details for guests); review list for logged-in users |

---

## 8. Requests to other members

| To | Request | Needed for |
|---|---|---|
| **Member 1** | ✅ Done (PR #19 and follow-up): photo metadata and `uploadConditionPhotos`, `completedAt`, the UTC deadline rule, `returnDamaged` with `beforeCommit`, trust recalculation on every return, `node:test` and seed data | Req 61, 79, 80, 89, 90, 98 |
| **Member 2** | `settleForfeiture({ reservationId, amountMinor, idempotencyKey })` keeps at most the held deposit and releases the rest; `refundToWallet({ userId, amountMinor, reference, idempotencyKey })` for dispute differences | Req 62, 64 |
| **Member 4** | Link damage-report rows to `/admin/damage-reports/:id`; read `DamageReport` read-only | Req 96 |
| **Member 5** | For a damaged return, link the lender to `/damage-reports/new?reservation=:id` while the reservation is active (Member 1's `return` already refuses good returns once a case exists; `hasOpenDamageCase()` is there for the UI). Embed `ConditionPhotoPanel` and `ReviewForm` on reservation details | Req 60, 61, 79, 89, 90 |
| **Member 7** | Embed `<TrustSummary userId={item.owner._id} compact />` on `ItemDetailsPage` | Req 91 |
| **Member 9** | Deliver the five events in §6.4 | Notifications |

---

## 9. Acceptance checks (from the work-division plan)

- **Wrong role:** damage actions by the wrong person fail. Only the lender reports, only the borrower disputes, only an admin decides or resolves.
- **Photo access:** only participants and admins can see condition photos; private paths never reach the browser.
- **Forfeit limit:** the amount kept can never exceed the held deposit.
- **Dispute refunds:** a dispute outcome refunds only the difference, exactly once, even on retries.
- **No trust inflation:** repeated completion events, review posts or recalculations don't inflate trust, because the score is recalculated from history.
- **Reviews:** only participants, only after completion, one per author per reservation; reviewing yourself or reviewing twice fails.
- **Phone width:** every Member 3 page works at 375 px.
