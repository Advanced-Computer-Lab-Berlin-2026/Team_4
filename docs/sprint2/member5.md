# Sprint 2 — Member 5: Borrow lists and reservation lifecycle screens

**Owner:** Member 5 · **Branch:** `aser_sprint2Features` · **Status:** updated to Member 1's merged `docs/SPRINT2_CONTRACT.md` (16 Nov 2026)

**Requirements:** 46, 47, 48, 53, 54, 56, 59, 60, 74, 75, 106, plus item tags for Member 7's alternatives (Req 92)

This is the contract other members can code against. Paths, access rules and response shapes are proposals until the team signs them off; after that, changes are announced in the team chat before they're merged. Values marked **(proposed)** are business rules the requirement sheet leaves open (see [§9](#9-decisions)). Anything that depends on another member's contract is marked **(depends on Mx)**.

> **Requirement numbers** follow the Sprint 2 work-division plan (the "ACL Updated Requirements" sheet). In the older sheet the lending dashboard is Req 107; here it is **Req 106**.

Conventions are the same as Sprint 1 ([`docs/API_CONTRACT.md`](../API_CONTRACT.md)):
- **Responses:** success is a JSON object (`{ borrowList }`, `{ reservation }`, `{ items, total, page, limit, pages }`). Errors are `{ message, errors? }` with the right HTTP status.
- **Routes:** mounted automatically from `server/src/routes/<name>.routes.js` at `/api/<kebab-name>`.
- **Access levels:** **member** (role `member`, which includes verified lenders), **lender** (verified lender), **borrower** / **lender of this reservation** (checked on the server), **admin**.
- **Dates:** sent and returned as `YYYY-MM-DD` (UTC). The **end date is the return day and is not counted** (half-open `[startDate, endDate)`, as in `docs/SPRINT2_CONTRACT.md`): `2026-12-01` to `2026-12-03` is **2 days**, and the item is due back at the start of the 3rd. The end date must be after the start date.
- **Money:** EGP as a Number in responses (Sprint 1 convention). Calls to Member 2 use minor units (EGP 100.00 → `10000`) as the plan asks.

---

## 1. Requirements → deliverables

| Req | Who | Requirement | Delivered by |
|---|---|---|---|
| 46 | Member | Add multiple items to a borrow list for a single pickup trip | `POST /api/borrow-lists/mine/entries`, `BorrowListButton`, `BorrowListPage` |
| 47 | Member | Remove an item from my borrow list | `DELETE /api/borrow-lists/mine/entries/:entryId`, `BorrowListPage` |
| 48 | Member | Change the date range of an item in my borrow list before checkout | `PATCH /api/borrow-lists/mine/entries/:entryId`, `BorrowListPage` |
| 53 | Member | View all my upcoming and past reservations | `GET /api/reservation-lifecycle/mine`, `MyReservationsPage` |
| 54 | Member | Filter my reservations by date or status | same endpoint, `?status=&from=&to=` |
| 56 | Verified lender | Approve or reject an incoming reservation request | `PATCH /api/reservation-lifecycle/:id/approve` and `/reject`, `LenderReservationsPage` |
| 59 | Verified lender | Mark an item as picked up | `PATCH /api/reservation-lifecycle/:id/pickup` |
| 60 | Verified lender | Mark a returned item as in good condition, releasing the deposit | `PATCH /api/reservation-lifecycle/:id/return` (Member 1's `return` command) |
| 74 | Member | Request an extension to an active reservation's return date | `POST /api/reservation-lifecycle/:id/extension`, `ExtensionRequest` |
| 75 | Verified lender | Approve or reject an extension request | `PATCH /api/reservation-lifecycle/:id/extension/approve` and `/reject` |
| 106 | Verified lender | Personal lending dashboard (items lent, total deposits collected, damage incident rate) | `GET /api/lending-dashboard`, `LenderDashboardPage` |
| (92) | Verified lender | Set attributes on my items so Member 7 can suggest alternatives | `tags` on `POST/PUT /api/items`, Details tab |

**Not mine, but connected:** checkout (Req 49) and cancellation (Req 55) are Member 1's; damage reports (Req 61) and condition photos (Req 79) are Member 3's; late fees (Req 77) and refunds are Member 2's; notifications are Member 9's.

---

## 2. Item tags (support for Req 92)

`Item.tags` already exists in `Item.js` (`[String]`, trimmed, lower case). Sprint 2 makes it editable through the existing Sprint 1 endpoints.

**Rules (proposed):**
- **0 to 10 tags per item, optional** on create and edit. When editing, a sent `tags` list replaces the whole list; an empty list clears it.
- **Each tag:** 1–30 characters after trimming. Letters (any language), numbers, spaces and hyphens only.
- Saved in lower case. Duplicates are removed silently (`"Cordless"` and `"cordless"` become one tag).
- Items without tags (including all items created before Sprint 2) work exactly as before; Member 7 matches them by category only.

**Endpoint changes (`/api/items`, Sprint 1, Member 5):**

| Method | Path | Change |
|---|---|---|
| POST | `/api/items` | Multipart: repeat the field once per tag (`tags=cordless`, `tags=18v`). Optional (0–10). |
| PUT | `/api/items/:id` | JSON: `{ "tags": ["cordless", "18v"] }`. Optional; if sent, replaces the whole list (`[]` clears it). |
| GET | `/api/items/mine`, `/api/items/:id` | `item.tags` is included in every response (it already is, as an empty array, for old items). |

**Errors:** `400` with `field: "tags"`, e.g. "You can add up to 10 tags", "Tags can contain letters, numbers, spaces and hyphens (up to 30 characters)".

**UI:** in the Details tab of the item editor, the lender types a tag and presses Enter. Each tag shows as a removable grey badge.

### Archive rule change (Req 15, Sprint 1)

`PATCH /api/items/:id/archive` now returns **`409`** "This item has 2 open bookings (a request, an upcoming or an active booking). Archive it after they finish; you can decline requests in Booking requests." (with the real number) while the item has any reservation in `pending`, `confirmed` or `active`. This stops borrowers from holding bookings for a hidden item. Unarchive is unchanged.

---

## 3. Borrow list (Req 46, 47, 48)

### 3.1 Rules (proposed)

- **Who:** any member (including verified lenders), not admins. A suspended account is blocked by the shared `protect` middleware.
- **One list per member.** The `BorrowList` model is already unique per user; it is created on the first add.
- **Any lenders:** a list may mix items from different lenders. Checkout (Member 1, Req 49) still creates one reservation per item.
- **Each item once.** To use different dates, the member changes the entry's dates (Req 48).
- **At most 10 entries.**
- **Dates are required when adding.** Start date is today (UTC) or later and **within 1 year** from today; the end date is **after** the start date (the shortest borrow is 1 day). The length (`end − start` days) must not exceed the item's `rules.maxBorrowDays` when the item has one, and **at most 365 days** when it has none. Both limits catch typos (e.g. 2062 for 2026) and follow Member 1's booking horizon once his contract sets one.
- **Checks when adding or changing dates:** the item exists, is public (`Item.publicFilter()`), and isn't the member's own item. Availability is **not** checked here: the list is a draft and doesn't hold the item (plan p.22). Checkout re-checks everything. Entries whose dates are already booked are marked `booked` (Member 1's `getAvailability`).
- **Stale entries are kept, not deleted.** When an item is archived or removed, or an entry's start date has passed, the entry stays in the list with a `problem` and is excluded from checkout until the member fixes or removes it.

### 3.2 Endpoints — `/api/borrow-lists` (`borrowLists.routes.js`)

| Method | Path | Handler | Access | Req | Description |
|---|---|---|---|---|---|
| GET | `/api/borrow-lists/mine` | `getMyList` | member | 46–48 | My list with item details and each entry's state |
| POST | `/api/borrow-lists/mine/entries` | `addEntry` | member | 46 | Add an item with dates |
| PATCH | `/api/borrow-lists/mine/entries/:entryId` | `updateEntryDates` | member | 48 | Change one entry's dates |
| DELETE | `/api/borrow-lists/mine/entries/:entryId` | `removeEntry` | member | 47 | Remove one entry |

**POST `/api/borrow-lists/mine/entries`**
- **Request:** `{ itemId, startDate, endDate }`.
- **Response `201`:** `{ borrowList }`.
- **Errors:**
  - `400` for invalid or missing dates, a start date in the past or more than 1 year ahead, an end date before the start date, or a range longer than the item's maximum (or 365 days).
  - `403` if it's your own item, or you are an admin.
  - `404` if the item doesn't exist or isn't available (archived/removed).
  - `409` if the item is already in your list, or the list already has 10 entries.

**PATCH `/api/borrow-lists/mine/entries/:entryId`**
- **Request:** `{ startDate, endDate }`. The same date rules as adding.
- **Response `200`:** `{ borrowList }`. **Errors:** `400` invalid dates · `404` entry not in my list.

**DELETE `/api/borrow-lists/mine/entries/:entryId`**
- **Response `200`:** `{ borrowList }`. **Errors:** `404` entry not in my list.

**`borrowList` shape:**

```json
{
  "_id": "…", "max": 10, "count": 2, "capacity": { "limit": 5, "used": 3, "left": 2 },
  "entries": [
    {
      "_id": "…", "startDate": "2026-12-01", "endDate": "2026-12-03", "days": 2,
      "item": { "_id": "…", "title": "Cordless drill", "photo": "/uploads/items/…jpg", "depositAmount": 400,
                "category": { "_id": "…", "name": "Power Tools", "slug": "power-tools" },
                "owner": { "_id": "…", "name": "…" }, "pickup": { "location": "…" } },
      "problem": null
    }
  ]
}
```

`problem` is `null` for a valid entry, or one of `"unavailable"` (item archived or removed), `"dates_passed"` (start date is in the past), `"invalid_dates"` (the end date isn't after the start date, from a list saved before this rule), `"too_long"` (the lender lowered the item's maximum since it was added), `"trust_too_low"` (my trust score is below the item's `minTrustScore`) or `"booked"` (the dates overlap a booking or hold, from Member 1's `getAvailability`), with a readable `problemMessage`. `"unavailable"` also covers a lender who can no longer lend (suspended, not verified or deleted) and, if it ever happens, my own item. `"booked"` ignores my own temporary holds (a checkout of this list still being paid). These are exactly the checks Member 1's checkout makes, so **Check out** is offered only when it can succeed. If the item no longer exists, `item` is `null` and `problem` is `"unavailable"`.

`capacity` is the membership limit on open bookings that Member 1's checkout enforces (`bookingRules.getEntitlements` / `assertCapacity`): `used` counts my pending, confirmed and active bookings plus my temporary holds. It is `null` when my membership has no limit. The page disables **Check out** when the ready entries are more than `left`.

### 3.3 Model (`BorrowList.js`, Member 5)

`{ user (unique), entries: [{ item, startDate, endDate, addedAt }] }` with timestamps. Dates are stored as UTC midnight. At most 10 entries (checked in the service, in one atomic write).

### 3.4 Checkout (Member 1, Req 49)

Member 1's checkout (`services/reservations/checkout.js`) reads `BorrowList` itself and turns **every** entry into a reservation in one transaction. It refuses the whole checkout if any line is invalid (past start, unavailable item, too long, already booked). After success it removes only the entries that still match the checked-out entry id, item and dates, so an entry re-dated meanwhile stays in the list. My service writes are field-scoped (`$push`, `$set` on `entries.$`, `$pull`), as the shared contract asks.

So the borrow-list page:
- links to **`/checkout`** with a **Check out** button;
- disables it while any entry has a `problem`, with "Fix or remove the items that need attention before you check out";
- leaves availability to checkout (the list never holds dates).

---

## 4.---

## 4. My reservations — borrower (Req 53, 54)

Read-only. Lists reservations where I am the **borrower**.

| Method | Path | Handler | Access | Req | Description |
|---|---|---|---|---|---|
| GET | `/api/reservation-lifecycle/mine` | `listMine` | member | 53, 54 | My reservations, filtered and paginated |
| GET | `/api/reservation-lifecycle/:id` | `getOne` | borrower or lender of this reservation | 53, 56–75 | One reservation with everything the details page needs |

**Query for `GET /mine`:**
- `status`: `all` (default) · `pending` · `upcoming` (= `confirmed`) · `active` · `completed` · `cancelled` · `rejected`
- `from`, `to` (`YYYY-MM-DD`, optional): returns reservations whose borrow period **overlaps** the range.
- `page`, `limit` (default 12, max 50).

**Order:** pending, upcoming and active reservations come first, soonest start date first. Completed, cancelled and rejected come after, most recent first.

**Response:** `{ items: [reservation], total, page, limit, pages }`.

**`reservation` shape:**

```json
{
  "_id": "…", "status": "pending|confirmed|active|completed|cancelled|rejected",
  "startDate": "2026-12-01", "endDate": "2026-12-03", "days": 2,
  "item": { "_id": "…", "title": "…", "photo": "…", "available": true, "maxBorrowDays": 5, "category": { "name": "…" } },
  "borrower": { "_id": "…", "name": "…" }, "lender": { "_id": "…", "name": "…" }, "role": "borrower|lender",
  "deposit": { "amount": 400, "status": "held" },
  "fulfilment": { "method": "pickup|delivery", "deliveryStatus": "none" },
  "pickedUpAt": null, "returnedAt": null, "completedAt": null, "returnCondition": null, "hasDamageCase": false, "lateFee": 0,
  "rejectionReason": null, "cancellation": null,
  "extension": { "requestId": null, "status": "none|pending|approved|rejected|cancelled|expired", "requestedEndDate": null, "decidedAt": null },
  "flags": { "approvalOverdue": false, "pickupMissed": false, "returnOverdue": false },
  "actions": { "approve": false, "reject": false, "pickup": false, "returnGood": false, "reportDamage": false,
               "requestExtension": false, "cancelExtension": false, "decideExtension": false, "approveExtension": false },
  "createdAt": "…"
}
```

- `actions` says which buttons the **current user** may use right now. The server decides; the page only shows them.
- `extension.status` and `flags` come from Member 1's `returnTiming.lifecycleFlags(reservation)`: a pending request whose deadline passed shows as `"expired"`; `approvalOverdue` (pending at the start date), `pickupMissed` (confirmed, never picked up by the end date), `returnOverdue` (active after the deadline). They are labels only: the stored status doesn't change (shared contract).
- `extension.requestId` is sent back when cancelling, approving or rejecting a request.
- `item.available` is `false` when the item is archived or removed (its public page doesn't exist); `item` is `null` if it was deleted.
- `actions.reject` also needs the deposit to be still held (or no deposit), like Member 1's `reject`.
- `actions.approveExtension` (lender) is only `true` when Member 1's extension approval would work: the item still public, the borrower's trust score high enough, the new total within `maxBorrowDays`, and the extra days free. `decideExtension` alone means the lender may still decline. `actions.reportDamage` needs the deposit still held (Member 1's `returnDamaged`). `hasDamageCase` says a damage report exists for this booking.
- `actions.approve` also needs what Member 1's `confirm` re-checks (including that the dates don't overlap another booking or hold): the item still public, the borrower's trust score at least the item's `minTrustScore`, and the length within the item's `maxBorrowDays`.
- `role` is the current user's side of this booking. `cancellation` is `{ at, reason }` for a cancelled booking, else `null`.
- People are shown by name only (no email, phone or address). If the item was deleted, `item` is `null`.
- **Errors:** `400` with the field for an unknown `status` (the filter word is `upcoming`, not `confirmed`), an invalid `from`/`to` date, or `to` before `from` · `401` not logged in · `403` admin · `404` not my booking (also for someone else's, so it isn't revealed).
- `rejectionReason`, `completedAt` and `returnCondition` are Member 1's `Reservation` fields.

**Overlap with Member 1's pages:** Member 1's `GET /api/reservations` and `/my-reservations` page list a member's reservations (no filters) for chat and cancellation (Req 55, 68). Req 53/54 (view all, filter by date or status) are mine, so `/reservations` is the filtered list and its rows open Member 1's `/my-reservations/:id` for chat and cancellation (see §10).

---

## 5. Lender actions (Req 56, 59, 60)

| Method | Path | Handler | Access | Req | Description |
|---|---|---|---|---|---|
| GET | `/api/reservation-lifecycle/lending` | `listLending` | lender | 56–60, 75 | Reservations for my items |
| PATCH | `/api/reservation-lifecycle/:id/approve` | `approve` | lender of this reservation | 56 | `pending` → `confirmed` |
| PATCH | `/api/reservation-lifecycle/:id/reject` | `reject` | lender of this reservation | 56 | `pending` → `rejected`, optional reason |
| PATCH | `/api/reservation-lifecycle/:id/pickup` | `pickup` | lender of this reservation | 59 | `confirmed` → `active` |
| PATCH | `/api/reservation-lifecycle/:id/return` | `markReturned` | lender of this reservation | 60 | `active` → `completed` (good condition) |

**Query for `GET /lending`:** the same `status`, `from`, `to`, `page`, `limit` as `/mine`, plus:
- `item` (one of my item ids): only that item's reservations. Another lender's item id simply matches nothing.
- `needsAction=true`: only what waits for my answer (pending requests, and active bookings with an extension request that hasn't expired), **oldest request first**. Combines with the other filters.

**Response:** `{ items: [reservation], total, page, limit, pages, waiting: { requests, extensions } }`. `waiting` counts everything waiting for my answer across all my items, whatever the filters (for the page's banner). Each `reservation` has the §4 shape with `role: "lender"`.

| Method | Path | Handler | Access | Description |
|---|---|---|---|---|
| GET | `/api/reservation-lifecycle/lending/items` | `lendingItems` | lender | `{ items: [{ _id, title, isArchived, bookings }] }`: my items that have at least one booking (archived included), for the item filter |

**Page:** `/lender/reservations` ("Booking requests"): a banner when something waits, tabs (Needs my answer, All and the six statuses), an item filter and the date filter, the same cards as `/reservations` from the lender's side. Linked from a **Booking requests** button on **My items** (`/lender/items`), since the menu is Member 1's.

**Every action calls Member 1's command once and returns the document it gives back** (shared contract): `reservationCommands.transition({ actorId, reservationId, action, expectedStatus, reason?, session? })` with `confirm` (the **Approve** button), `reject`, `pickup` or `return`. The command checks that the actor is the verified lender of this reservation, the state and the dates, and does all side effects in its own transaction. My controller repeats none of them.

**Errors:** the command's own: `403` not the lender · `404` not found · `409` wrong state (e.g. "Invalid reservation status for this action", "Pickup must be within the booked date range", "A damage case owns settlement for this reservation") · `400` invalid body.

**PATCH `/:id/reject`** — `{ reason? }`, up to 500 characters, shown to the borrower. The command refunds the held deposit and any charged delivery fee in full through Member 2.

**PATCH `/:id/pickup`** — only while `confirmed` and within the booked interval (the command decides). The page shows **Mark as picked up** on the details page and on the Booking requests card, and "You can mark it picked up from …" before the start date. **Deliveries have no pickup step:** Member 1's `pickup` refuses them, and the booking becomes active when Member 6's delivery tracking (`/delivery-tracking/:id`) marks it **delivered**. For a delivery the details page shows a **Delivery · <stage>** box ("Bring the item to <borrower>, then mark it as delivered.") with **Update delivery**, a link to that page; `actions.pickup` is `false` for deliveries. Condition photos (Member 3) are optional; the page reminds the lender to add them.

**PATCH `/:id/return`** — good return (Req 60). The command refuses it while a damage case is open, stamps `returnedAt` and `completedAt`, **releases the deposit**, applies any late fee (Member 2), recalculates trust for both people (Member 3) and queues the completion events (Member 9). An early return is allowed.

**Return page (Req 60):** **Returned in good condition** on the details page and the Booking requests card, with a confirm box naming the deposit going back and, when Member 2's module is installed, the late fee (`reservation.lateFeeIfReturnedNow`, from his `calculateLateFee`; `null` until then, `0` within his 60-minute grace or without a deposit). Until Member 2 merges, a return with a deposit or a late return is answered `503` by Member 1's command and the page shows that message.

**Damaged return (Req 61, Member 3):** not an endpoint of mine. While the reservation is `active`, the lender's page shows **Report damage**, a link to Member 3's form `/damage-reports/new?reservation=<id>`, only once that route is registered in the app (so it is never a broken link). Submitting that form records the return (`returnDamaged`) and opens the case in one transaction; the deposit stays held for the admin's decision.

**Unanswered and stuck reservations:** nothing changes them automatically (shared contract). Pages show `flags`; a lender can still reject an overdue pending request, and an overdue active reservation can still be returned (late fee applies).

---

## 6. Extensions (Req 74, 75)

| Method | Path | Handler | Access | Req | Description |
|---|---|---|---|---|---|
| POST | `/api/reservation-lifecycle/:id/extension` | `requestExtension` | borrower of this reservation | 74 | Ask for a later return date |
| DELETE | `/api/reservation-lifecycle/:id/extension` | `cancelExtension` | borrower of this reservation | 74 | Withdraw a pending request |
| PATCH | `/api/reservation-lifecycle/:id/extension/approve` | `approveExtension` | lender of this reservation | 75 | Apply the new return date |
| PATCH | `/api/reservation-lifecycle/:id/extension/reject` | `rejectExtension` | lender of this reservation | 75 | Keep the original return date |

All four call Member 1's `reservationCommands.extend({ actorId, reservationId, action, endDate?, requestId?, session? })` with `request`, `cancel`, `approve` or `reject`.

**Rules (Member 1's command):**
- Only for `active` reservations, and only before the return deadline. Once overdue, late fees apply instead.
- One pending request at a time. After it is answered, cancelled or expired, the borrower may ask again; no limit in total.
- The new return date must be later than the current one. Approval rechecks availability and the item's rules (including `maxBorrowDays`) atomically and only then moves the return date.
- Cancel, approve and reject send the current `requestId` (from `reservation.extension.requestId`); an old one gets `409` "This extension request is no longer current".
- No answer: a request still pending at the original return deadline shows as **expired**; the borrower returns on the original date.
- No extra cost; no notifications for extensions (none in Member 9's event list).

**POST `/:id/extension`** — `{ requestedEndDate }` (`YYYY-MM-DD`). **Response `201`:** `{ reservation }`. Before calling Member 1's `extend`, two early checks answer at once: the new **total** length must fit the item's `maxBorrowDays` (`400` on `requestedEndDate`), and the extra days must be free (`409` "Someone has booked part of these extra days", Member 1's `getAvailability` with this booking excluded). His command re-checks both on approval.

**Pages:** the borrower's details page has **Need it longer?** (a date field from the day after the current return date, a live "+N days" line, **Ask for more time**; while pending, the asked date and **Withdraw request**; afterwards the last answer). The lender sees **Request for more time** with **Approve new date** / **Decline** on the details page and on the Booking requests card. Member 1's `extend` has no reason field for extensions.
**DELETE `/:id/extension`**, **PATCH `/:id/extension/approve`**, **PATCH `/:id/extension/reject`** — `{ requestId }`. **Response `200`:** `{ reservation }`.
**Errors** (from the command): `409` not active, deadline passed, a request already pending, nothing pending, request no longer current, or days already booked · `400` not later than the current date, or longer than the item allows.

---

## 7. Lending dashboard (Req 106)

| Method | Path | Handler | Access | Req | Description |
|---|---|---|---|---|---|
| GET | `/api/lending-dashboard` | `getDashboard` | lender | 106 | My lending figures |

**Query:** `period` = `all` (default) or `30d`.

**Response:**

```json
{
  "period": "all",
  "loans": { "completed": 23, "activeNow": 2 },
  "deposits": { "totalCollected": 9200, "heldNow": 800, "currency": "EGP" },
  "damage": { "upheld": 1, "completedLoans": 23, "rate": 0.043 },
  "needsAction": { "requests": 1, "extensions": 0 },
  "items": [
    { "item": { "_id": "…", "title": "Cordless drill", "isArchived": false, "photo": "…" }, "timesLent": 9, "activeNow": 1,
      "depositsCollected": 3600, "damageUpheld": 1 }
  ]
}
```

**Definitions (proposed):**
- **Items lent** (requirement wording): `loans.completed` is the number of completed reservations of my items; `loans.activeNow` is the number currently out (`active`). The `items` table breaks both down per item, including archived items.
- **Total deposits collected:** the sum of `deposit.amount` over my items' reservations that took a deposit, so excluding `pending`, `cancelled` and `rejected`. Read from `Reservation`; no other service is needed. **Held now** (small extra line) is the sum for reservations whose `deposit.status` is `held`.
- **Damage incident rate:** upheld damage reports ÷ completed loans, rounded to 3 decimals. A report counts as upheld when it is `decided` or `resolved` **and** its final amount (`resolution.finalForfeitAmount`, else `decision.forfeitAmount`) is above 0, the same rule Member 3 uses for trust. Open and disputed cases don't count until they are settled. `0` when there are no completed loans.
- **Items table:** every item of mine that has at least one booking (archived included), most lent first. `item` is `null` for a deleted item. Unbooked items aren't listed.
- **Period `30d`:** loans completed in the last 30 days and deposits of bookings made in the last 30 days. Damage counts only for the loans completed in that period, so the rate compares the same loans and never exceeds 100%. `activeNow`, `heldNow` and `needsAction` are always "right now". Any other `period` → `400`.
- **Access:** verified lenders only (`403` otherwise); only my own items' figures.

**Page:** `/lender/dashboard`: an "All time | Last 30 days" switch, five figure cards, a "Waiting for your answer" box linking to Booking requests, and the per-item table (each row opens that item's bookings). Linked from **Dashboard** buttons on My items and Booking requests.

Read-only queries on `Reservation` and `DamageReport`; the plan allows feature services to read other models.

---

## 8. Pages, components and events

### 8.1 Client routes (`client/src/routes/sprint2/member5.routes.jsx`, found automatically by `routeConfig.jsx`)

| Path | Page | Access |
|---|---|---|
| `/borrow-list` | `BorrowListPage` | member |
| `/reservations` | `MyReservationsPage`: filtered list (Req 53/54); a row opens the details below | member |
| `/reservations/:id` | `ReservationDetailsPage` (borrower and lender view, lifecycle buttons); links to Member 1's `/my-reservations/:id` for chat and cancellation | member |
| `/lender/reservations` | `LenderReservationsPage` ("Booking requests"; linked from My items) | lender |
| `/lender/dashboard` | `LenderDashboardPage` | lender |

All pages follow `docs/UI_README.md`: shared components, a loading/error/empty state for everything, 375 px phone width. Styles go in `client/src/styles/sprint2/member5.module.css`.

### 8.2 Components other members embed

| Component (`client/src/components/sprint2/m5/`) | Embedded by | Props |
|---|---|---|
| `BorrowListButton` | Member 7 — `ItemDetailsPage` (next to Member 1's `/reserve/:itemId` link) | `{ itemId, ownerId?, maxBorrowDays?, onAdded? }` asks for dates and adds the item. Guests see "Log in to borrow"; admins and the item's owner (matched by `ownerId`) see nothing. If the item is already in the list it shows its dates and a link to `/borrow-list` |

### 8.3 Components I embed

| Component | From | Where |
|---|---|---|
| `ConditionPhotoPanel` `{ reservationId, onChange? }` | Member 3 (`components/sprint2/m3/`) | `ReservationDetailsPage` (lender: pickup and return); the server decides when uploads are allowed |
| `ReviewForm` `{ reservationId, onSuccess? }` | Member 3 (`components/sprint2/m3/`) | `ReservationDetailsPage` after completion; hides itself when no review is possible |
| `DeliveryStatusPanel` `{ reservationId, onChange? }` | Member 6 (`components/sprint2/m6/`) | `ReservationDetailsPage` when `fulfilment.method` is `delivery` |

Delivery settings (`ItemDeliverySettings`) are **not** mine to embed: Member 6 shows them inside his own **Pickup & rules** tab of the item editor and saves them through `PATCH /api/delivery/items/:itemId`.

### 8.4 Events

I send **no events myself**. Member 1's commands queue them in the same transaction as the change (`reservation_confirmed`, `reservation_rejected`, `reservation_picked_up`, `reservation_completed`, `availability_changed`, …), so my controllers must not repeat them (shared contract).

---

## 9. Decisions

None of these are in the requirement sheet. The project description allows the team to choose ("You are allowed to use your imagination").

| # | Decision | Choice |
|---|---|---|
| D1 | Tags | Optional, up to 10 per item; 1–30 characters; letters, numbers, spaces, hyphens |
| D2 | Borrow list | Any lenders; dates required; each item once; max 10; basic checks only; stale entries kept and marked (checkout waits until they are fixed); start within 1 year, length at most 365 days when the item sets no maximum |
| D3 | Who can borrow | Any member including verified lenders; not admins; never your own item |
| D4 | Reservation filters | All, pending, upcoming (= confirmed), active, completed, cancelled, rejected; from–to overlap |
| D5 | Order | Pending/upcoming/active soonest first; past most recent first |
| D6 | Reject reason | Optional, up to 500 characters (Member 1's `rejectionReason`) |
| D7 | Pickup window | Confirmed only, within the booked interval (Member 1's command decides) |
| D8 | Condition photos | Optional, with a reminder |
| D9 | Return | Two choices: **Returned in good condition** (Member 1's `return`, releases the deposit) and **Report damage** (link to Member 3's form, which records the return and keeps the deposit held); early return allowed |
| D10 | Extensions | Through Member 1's `extend`: active only, before the return deadline; one pending at a time; unlimited total; borrower can cancel; expires at the original deadline; no extra cost; no notifications for now |
| D11 | Dashboard | Completed and active loans with a per-item table; total deposits collected plus held now; upheld damage ÷ completed loans; all time or last 30 days |
| D12 | Archive | Blocked while the item has pending, confirmed or active reservations |
| D13 | Dates | UTC; the end date is the return day and isn't counted (Dec 1–3 = 2 days), as in Member 1's contract; start today or later |

---

## 10. Requests and questions to other members

**Answered by Member 1's merged contract (16 Nov 2026):** the lifecycle commands and what `return` does, the damaged return through Member 3's form, the refund on reject, the extension commands with `requestId`, `rejectionReason`, stuck reservations (`lifecycleFlags`), the date rule (end date not counted), events (sent by the commands), and checkout reading the borrow list itself. Member 2's and Member 3's side effects are called by the commands, so I need nothing from them for Req 56–60.

**Answered by the other members' contracts (16 Nov 2026):**
- **Member 3** (`docs/sprint2/member3.md`): the damage form is `/damage-reports/new?reservation=<id>`; `hasOpenDamageCase(reservationId)` is in `services/damage/damage.js` (Member 1's `return` already refuses while a case exists).
- **Member 6** (`docs/sprint2/member6.md`): delivery settings are in his **Pickup & rules** tab and saved through his endpoint. Since Member 1's update of 17 Nov, marking a delivery **delivered** (Member 1's `advanceDelivery`) also makes the booking active, and `pickup` refuses deliveries, so for deliveries the lender uses the delivery page instead of **Mark as picked up**.
- **Member 2** (`docs/sprint2/member2.md`): `refundToWallet` (full deposit and delivery fee on a declined request), `releaseDeposit` and `applyLateFee` are in `services/payments/payment.js`, the file Member 1's commands load, so they connect once merged. The late fee starts immediately after the due time (10 % of the deposit per started day, capped at 100 %); `calculateLateFee` lets my return screen show the fee before the lender confirms.

**Still open:**

| To | Request / question | Needed for |
|---|---|---|
| **Member 1** | Add a **Borrow list** link (`/borrow-list`) to the member menu in `navLinks.js` (shared, his file). Without it the page is only reachable from the item page's button. (**Reservations** → `/reservations` and **Booking requests** were added on 17 Nov.) | Req 46–48 |
| **Member 1** | Lender menu: add **Dashboard** (`/lender/dashboard`) to `lenderLinks` in `navLinks.js` (**Booking requests** is there since 17 Nov). Today lenders reach the dashboard only through the buttons on My items and Booking requests. | Req 106 |
| **Member 7** | Embed `<BorrowListButton itemId={item._id} ownerId={item.owner?._id} maxBorrowDays={item.rules?.maxBorrowDays} />` on `ItemDetailsPage` (import from `components/sprint2/m5/BorrowListButton`); read `item.tags` for alternatives (old items may have none) | Req 46, 92 |

---

## 11. Acceptance checks

- **Ownership:** a lender can't act on another lender's reservation, and a borrower can't act as the lender. Wrong person → `403`.
- **Lifecycle:** every action needs the right current state (approve/reject only `pending`, pickup only `confirmed` within its dates, return only `active`); Member 1's command returns `409` otherwise and my endpoints pass it through.
- **No double effects:** double clicks or retries of approve, pickup or return change nothing twice; a good return never releases a deposit twice; my code repeats none of the command's side effects (payments, trust, events).
- **Damage:** a good return is refused while a damage case is open; **Report damage** opens Member 3's form only while the reservation is active.
- **Extensions:** extending into someone else's booking fails; only one pending request; overdue reservations can't be extended; an unanswered request is shown as expired after the end date.
- **Borrow list:** your own items, duplicates, an 11th entry, invalid or past dates, an end date not after the start, and archived items are all refused; stale entries are kept and marked, and **Check out** stays disabled until they are fixed or removed.
- **Archive:** an item with open bookings or an unexpired booking hold can't be archived.
- **Dashboard:** figures match the reservations and damage reports exactly; other lenders' data never appears.
- **Phone width:** every Member 5 page works at 375 px.

The shared **Reserve** page offers the borrow-list form. Reservation details show Member 6's delivery panel directly, and Booking requests links to the delivery tracking page. The ordinary pickup action remains available for pickup bookings.
