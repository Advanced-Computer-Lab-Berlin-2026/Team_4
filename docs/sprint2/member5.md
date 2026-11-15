# Sprint 2 — Member 5: Borrow lists and reservation lifecycle screens

**Owner:** Member 5 · **Branch:** `aser_sprint2Features` · **Status:** DRAFT for team review (15 Nov 2026)

**Requirements:** 46, 47, 48, 53, 54, 56, 59, 60, 74, 75, 106, plus item tags for Member 7's alternatives (Req 92)

This is the contract other members can code against. Paths, access rules and response shapes are proposals until the team signs them off; after that, changes are announced in the team chat before they're merged. Values marked **(proposed)** are business rules the requirement sheet leaves open (see [§9](#9-decisions)). Anything that depends on another member's contract is marked **(depends on Mx)**.

> **Requirement numbers** follow the Sprint 2 work-division plan (the "ACL Updated Requirements" sheet). In the older sheet the lending dashboard is Req 107; here it is **Req 106**.

Conventions are the same as Sprint 1 ([`docs/API_CONTRACT.md`](../API_CONTRACT.md)):
- **Responses:** success is a JSON object (`{ borrowList }`, `{ reservation }`, `{ items, total, page, limit, pages }`). Errors are `{ message, errors? }` with the right HTTP status.
- **Routes:** mounted automatically from `server/src/routes/<name>.routes.js` at `/api/<kebab-name>`.
- **Access levels:** **member** (role `member`, which includes verified lenders), **lender** (verified lender), **borrower** / **lender of this reservation** (checked on the server), **admin**.
- **Dates:** sent and returned as `YYYY-MM-DD` (UTC). A range is **inclusive**: `2026-12-01` to `2026-12-03` is 3 days, and the item is due back on the 3rd. This matches Member 3's on-time rule; the final date rules belong to Member 1's contract **(depends on M1)**.
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
| 60 | Verified lender | Mark a returned item as in good condition, releasing the deposit | `PATCH /api/reservation-lifecycle/:id/return` with `condition: "good"` |
| 74 | Member | Request an extension to an active reservation's return date | `POST /api/reservation-lifecycle/:id/extension`, `ExtensionRequest` |
| 75 | Verified lender | Approve or reject an extension request | `PATCH /api/reservation-lifecycle/:id/extension/approve` and `/reject` |
| 106 | Verified lender | Personal lending dashboard (items lent, total deposits collected, damage incident rate) | `GET /api/lending-dashboard`, `LenderDashboardPage` |
| (92) | Verified lender | Set attributes on my items so Member 7 can suggest alternatives | `tags` on `POST/PUT /api/items`, Details tab |

**Not mine, but connected:** checkout (Req 49) and cancellation (Req 55) are Member 1's; damage reports (Req 61) and condition photos (Req 79) are Member 3's; late fees (Req 77) and refunds are Member 2's; notifications are Member 9's.

---

## 2. Item tags (support for Req 92)

`Item.tags` already exists in `Item.js` (`[String]`, trimmed, lower case). Sprint 2 makes it editable through the existing Sprint 1 endpoints.

**Rules (proposed):**
- **1 to 10 tags per item.** At least one is **required when creating** an item. When editing, `tags` is optional, but if it is sent it must still contain 1–10 tags.
- **Each tag:** 1–30 characters after trimming. Letters (any language), numbers, spaces and hyphens only.
- Saved in lower case. Duplicates are removed silently (`"Cordless"` and `"cordless"` become one tag).
- Older items with no tags keep working; they just have nothing for Member 7 to match beyond the category.

**Endpoint changes (`/api/items`, Sprint 1, Member 5):**

| Method | Path | Change |
|---|---|---|
| POST | `/api/items` | Multipart: repeat the field once per tag (`tags=cordless`, `tags=18v`). Required (1–10). |
| PUT | `/api/items/:id` | JSON: `{ "tags": ["cordless", "18v"] }`. Optional; if sent, replaces the whole list. |
| GET | `/api/items/mine`, `/api/items/:id` | `item.tags` is included in every response (it already is, as an empty array, for old items). |

**Errors:** `400` with `field: "tags"`, e.g. "Add at least one tag", "You can add up to 10 tags", "Tags can contain letters, numbers, spaces and hyphens (up to 30 characters)".

**UI:** in the Details tab of the item editor, the lender types a tag and presses Enter. Each tag shows as a removable grey badge.

### Archive rule change (Req 15, Sprint 1)

`PATCH /api/items/:id/archive` now returns **`409`** "This item has open bookings. Archive it after they finish." while the item has any reservation in `pending`, `confirmed` or `active`. This stops borrowers from holding bookings for a hidden item. Unarchive is unchanged.

---

## 3. Borrow list (Req 46, 47, 48)

### 3.1 Rules (proposed)

- **Who:** any member (including verified lenders), not admins. A suspended account is blocked by the shared `protect` middleware.
- **One list per member.** The `BorrowList` model is already unique per user; it is created on the first add.
- **Any lenders:** a list may mix items from different lenders. Checkout (Member 1, Req 49) still creates one reservation per item.
- **Each item once.** To use different dates, the member changes the entry's dates (Req 48).
- **At most 10 entries.**
- **Dates are required when adding.** Start date is today (UTC) or later; the end date is on or after the start date. The length (`end − start + 1` days) must not exceed the item's `rules.maxBorrowDays` when the item has one.
- **Checks when adding or changing dates:** the item exists, is public (`Item.publicFilter()`), and isn't the member's own item. Availability is **not** checked here: the list is a draft and doesn't hold the item (plan p.22). Checkout re-checks everything. Once Member 1's `getAvailability` exists, entries show a warning if the dates are already booked.
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
  - `400` for invalid or missing dates, a start date in the past, an end date before the start date, or a range longer than the item's maximum.
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
  "_id": "…", "max": 10, "count": 2,
  "entries": [
    {
      "_id": "…", "startDate": "2026-12-01", "endDate": "2026-12-03", "days": 3,
      "item": { "_id": "…", "title": "Cordless drill", "photo": "/uploads/items/…jpg", "depositAmount": 400,
                "category": { "_id": "…", "name": "Power Tools", "slug": "power-tools" },
                "owner": { "_id": "…", "name": "…" }, "pickup": { "location": "…" } },
      "problem": null
    }
  ]
}
```

`problem` is `null` for a valid entry, or one of `"unavailable"` (item archived or removed), `"dates_passed"` (start date is in the past) or `"too_long"` (the lender lowered the item's maximum since it was added), with a readable `problemMessage`. If the item no longer exists, `item` is `null` and `problem` is `"unavailable"`.

### 3.3 Model (`BorrowList.js`, Member 5)

The existing schema stays. Additions: `timestamps` on entries (`addedAt`) and a server-side limit of 10 entries. Dates are stored as UTC midnight.

### 3.4 Service for Member 1's checkout (Req 49)

`services/borrow/borrowList.js`:

| Function | Contract |
|---|---|
| `getCheckoutEntries(userId, { session? })` | Entries without a `problem`, with item ids and dates, ready for checkout |
| `removeEntries(userId, entryIds, { session? })` | Removes only the given entries (the successfully checked-out lines), in the caller's transaction |

Member 1's checkout reads and clears the list only through these two functions, so `BorrowList` keeps a single editor.

---

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
  "startDate": "2026-12-01", "endDate": "2026-12-03", "days": 3,
  "item": { "_id": "…", "title": "…", "photo": "…", "category": { "name": "…" } },
  "borrower": { "_id": "…", "name": "…" }, "lender": { "_id": "…", "name": "…" },
  "deposit": { "amount": 400, "status": "held" },
  "fulfilment": { "method": "pickup|delivery", "deliveryStatus": "none" },
  "pickedUpAt": null, "returnedAt": null, "lateFee": 0,
  "rejectionReason": null,
  "extension": { "status": "none|pending|approved|rejected|expired", "requestedEndDate": null, "decidedAt": null },
  "isOverdue": false,
  "actions": { "approve": false, "reject": false, "pickup": false, "returnGood": false, "returnDamaged": false,
               "requestExtension": false, "cancelExtension": false, "decideExtension": false },
  "createdAt": "…"
}
```

- `actions` says which buttons the **current user** may use right now. The server decides; the page only shows them.
- `extension.status` shows `"expired"` when a request was still pending when the end date passed (see §6). This is computed when read; nothing has to run on a timer.
- `isOverdue` is `true` when the reservation is `active` and the end date has passed.
- `rejectionReason` needs a new field from Member 1 (§10).

---

## 5. Lender actions (Req 56, 59, 60)

| Method | Path | Handler | Access | Req | Description |
|---|---|---|---|---|---|
| GET | `/api/reservation-lifecycle/lending` | `listLending` | lender | 56–60, 75 | Reservations for my items |
| PATCH | `/api/reservation-lifecycle/:id/approve` | `approve` | lender of this reservation | 56 | `pending` → `confirmed` |
| PATCH | `/api/reservation-lifecycle/:id/reject` | `reject` | lender of this reservation | 56 | `pending` → `rejected`, optional reason |
| PATCH | `/api/reservation-lifecycle/:id/pickup` | `pickup` | lender of this reservation | 59 | `confirmed` → `active` |
| PATCH | `/api/reservation-lifecycle/:id/return` | `markReturned` | lender of this reservation | 60 (61) | `active` → `completed` |

**Query for `GET /lending`:** the same `status`, `from`, `to`, `page`, `limit` as `/mine`, plus:
- `item` (an item id): only that item's reservations.
- `needsAction=true`: only pending requests and pending extension requests, oldest first.

**Every action is done through Member 1's `reservationCommands`** with the actor, the expected current state and an operation key, so a double click or a retry never applies twice **(depends on M1)**. Until those commands exist, these endpoints return **`501`** so nothing pretends a booking changed (plan, Stage 0 rule).

**Common errors:** `403` if you aren't the lender of this reservation · `404` not found · `409` if the reservation isn't in the required state (e.g. "This request was already answered") · `400` for an invalid body.

**PATCH `/:id/approve`** — the item must still be public. Member 1's command re-checks the dates.

**PATCH `/:id/reject`**
- **Request:** `{ reason? }`, up to 500 characters. Shown to the borrower.
- Refunding a deposit already paid at checkout is an open question to Member 1/Member 2 (§10).

**PATCH `/:id/pickup`**
- Only while `confirmed`, and only from the **start date to the end date** (inclusive). Earlier → `409` "Pickup can be marked from 1 Dec 2026".
- Condition photos (Member 3) are **optional**; the page reminds the lender to add them.
- Effect: `pickedUpAt` set, status `active`, event `picked_up` to the borrower.

**PATCH `/:id/return`**
- **Request:** `{ condition: "good" | "damaged" }`.
- Only while `active`. An **early return** (before the end date) is allowed.
- **`good` (Req 60):**
  - refused with `409` while Member 3's `hasOpenDamageCase(reservationId)` is `true`;
  - sets `returnedAt`, status `completed`;
  - **releases the deposit** through Member 2, and applies a **late fee** through Member 2 if returned after the end date (Req 77);
  - **recalculates trust** for the borrower and the lender (Member 3);
  - sends `returned` and `completed` events (Member 9).
  - Which of these Member 1's `return` command does itself is an open question (§10). Either way, all of it happens once, with operation keys `reservation:<id>:return`, `reservation:<id>:release`, `reservation:<id>:late-fee`.
- **`damaged` (leads to Req 61):** sets `returnedAt`, status `completed`, and **keeps the deposit held**, as the plan requires (p.22: "completion must not automatically imply release"). The response includes `next: "/damage-reports/new?reservation=<id>"`, Member 3's form. The admin's decision then settles the deposit. A late fee still applies if late.
- **Response `200`:** `{ reservation }`.

---

## 6. Extensions (Req 74, 75)

| Method | Path | Handler | Access | Req | Description |
|---|---|---|---|---|---|
| POST | `/api/reservation-lifecycle/:id/extension` | `requestExtension` | borrower of this reservation | 74 | Ask for a later end date |
| DELETE | `/api/reservation-lifecycle/:id/extension` | `cancelExtension` | borrower of this reservation | 74 | Withdraw a pending request |
| PATCH | `/api/reservation-lifecycle/:id/extension/approve` | `approveExtension` | lender of this reservation | 75 | Apply the new end date |
| PATCH | `/api/reservation-lifecycle/:id/extension/reject` | `rejectExtension` | lender of this reservation | 75 | Keep the original end date |

**Rules (proposed):**
- **Only for `active` reservations** (Req 74), and only **before the end date has passed**. Once overdue, late fees apply instead.
- **One pending request at a time.** After it's answered, cancelled or expired, the borrower may ask again. There is no limit on how many extensions a reservation gets in total.
- **New end date:** later than the current one. The **total** length (start to new end) must respect the item's `maxBorrowDays`, and the extra days must be free (Member 1's `checkOverlap`, excluding this reservation). Both are re-checked when the lender approves, since another booking may have come in **(depends on M1, M6)**.
- **No answer:** a request still pending when the current end date passes is shown as **expired**, and the borrower must return on the original date.
- **No extra cost:** the deposit stays the same; the system has no rental fees.
- **No notifications** for extension events for now. They aren't required by any requirement, and Member 9's event list has no extension types. Requests and answers show on both parties' reservation pages and on the lender's dashboard ("needs my action").

**POST `/:id/extension`**
- **Request:** `{ requestedEndDate }`.
- **Response `201`:** `{ reservation }`.
- **Errors:**
  - `409` if the reservation isn't active, the end date has passed, or a request is already pending.
  - `400` if the date isn't later than the current end date, or the total exceeds the item's maximum.
  - `409` if the extra days are already booked.

**PATCH `/:id/extension/approve`** — the end date becomes `requestedEndDate`. Member 9's return reminder then follows the new date automatically. **Errors:** `409` if nothing is pending, it expired, or the days are no longer free.

**PATCH `/:id/extension/reject`** and **DELETE `/:id/extension`** — the request ends; the end date is unchanged. **Errors:** `409` if nothing is pending.

Storing a pending request, cancelling it and rejecting it are changes to `Reservation.extension`. They need Member 1's commands, or his permission for this service to write that field (§10).

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
    { "item": { "_id": "…", "title": "Cordless drill", "isArchived": false }, "timesLent": 9, "activeNow": 1,
      "depositsCollected": 3600, "damageUpheld": 1 }
  ]
}
```

**Definitions (proposed):**
- **Items lent** (requirement wording): `loans.completed` is the number of completed reservations of my items; `loans.activeNow` is the number currently out (`active`). The `items` table breaks both down per item, including archived items.
- **Total deposits collected:** the sum of `deposit.amount` over my items' reservations that took a deposit, so excluding `pending`, `cancelled` and `rejected`. Read from `Reservation`; no other service is needed. **Held now** (small extra line) is the sum for reservations whose `deposit.status` is `held`.
- **Damage incident rate:** upheld damage reports ÷ completed loans. A report counts as upheld when its final amount (`resolution.finalForfeitAmount`, else `decision.forfeitAmount`) is above 0, the same rule Member 3 uses for trust. `0` when there are no completed loans.
- **Period `30d`:** counts reservations completed, or with deposits taken, in the last 30 days. `activeNow`, `heldNow` and `needsAction` are always "right now".

Read-only queries on `Reservation` and `DamageReport`; the plan allows feature services to read other models.

---

## 8. Pages, components and events

### 8.1 Client routes (`client/src/routes/sprint2/member5.routes.jsx`, wired once by Member 1)

| Path | Page | Access |
|---|---|---|
| `/borrow-list` | `BorrowListPage` | member |
| `/reservations` | `MyReservationsPage` (Member 9's notifications already link here) | member |
| `/reservations/:id` | `ReservationDetailsPage` (borrower and lender view) | member |
| `/lender/reservations` | `LenderReservationsPage` | lender |
| `/lender/dashboard` | `LenderDashboardPage` | lender |

All pages follow `docs/UI_README.md`: shared components, a loading/error/empty state for everything, 375 px phone width. Styles go in `client/src/styles/sprint2/member5.module.css`.

### 8.2 Components other members embed

| Component (`client/src/components/sprint2/m5/`) | Embedded by | Props |
|---|---|---|
| `BorrowListButton` | Member 7 — `ItemDetailsPage` | `{ itemId, maxBorrowDays?, onAdded? }` asks for dates and adds the item. Hidden for guests (shows "Log in to borrow"), admins and the item's owner |

### 8.3 Components I embed

| Component | From | Where |
|---|---|---|
| `ConditionPhotoPanel` `{ reservationId }` | Member 3 | `ReservationDetailsPage` (lender: pickup and return) |
| `ReviewForm` `{ reservationId }` | Member 3 | `ReservationDetailsPage` after completion |
| `DeliveryStatusPanel` | Member 6 | `ReservationDetailsPage` when `fulfilment.method` is `delivery` |
| `ItemDeliverySettings` | Member 6 | `ItemEditorPage` (my file) |

### 8.4 Events (through Member 9's `enqueueEvent`)

Names follow Member 9's existing event list. Each is written in the same transaction as the state change, with these keys:

| Event | Key | Recipients | When |
|---|---|---|---|
| `picked_up` | `reservation:<id>:picked_up` | borrower | pickup marked |
| `returned` | `reservation:<id>:returned` | borrower | return marked (good or damaged) |
| `completed` | `reservation:<id>:completed` | borrower, lender (payload `borrowerId` for Member 9's referral check) | reservation completed |

`confirmed` and `rejected` (Req 57/58) come from Member 1's `confirm`/`reject` commands, unless his contract says the caller sends them **(depends on M1)**.

---

## 9. Decisions

None of these are in the requirement sheet. The project description allows the team to choose ("You are allowed to use your imagination").

| # | Decision | Choice |
|---|---|---|
| D1 | Tags | 1–10 per item, required on create; 1–30 characters; letters, numbers, spaces, hyphens |
| D2 | Borrow list | Any lenders; dates required; each item once; max 10; basic checks only; stale entries kept and marked |
| D3 | Who can borrow | Any member including verified lenders; not admins; never your own item |
| D4 | Reservation filters | All, pending, upcoming (= confirmed), active, completed, cancelled, rejected; from–to overlap |
| D5 | Order | Pending/upcoming/active soonest first; past most recent first |
| D6 | Reject reason | Optional, up to 500 characters (needs a field from Member 1) |
| D7 | Pickup window | Confirmed only, from the start date to the end date |
| D8 | Condition photos | Optional, with a reminder |
| D9 | Return | Two choices: good (release) and damaged (keep held, then Member 3's report); early return allowed |
| D10 | Extensions | Active only, before the end date; one pending at a time; unlimited total; borrower can cancel; expires at the end date; no extra cost; no notifications for now |
| D11 | Dashboard | Completed and active loans with a per-item table; total deposits collected plus held now; upheld damage ÷ completed loans; all time or last 30 days |
| D12 | Archive | Blocked while the item has pending, confirmed or active reservations |
| D13 | Dates | Inclusive end date, UTC, start today or later (final rules: Member 1's contract) |

---

## 10. Requests and questions to other members

| To | Request / question | Needed for |
|---|---|---|
| **Member 1** | Exact `reservationCommands` (approve, reject, pickup, return, extension) with actor, expected state, operation key and session | Req 56, 59, 60, 74, 75 |
| **Member 1** | Does `return` also release the deposit, apply the late fee, recalculate trust and send events, or does my service call those after it? | Req 60 |
| **Member 1** | A way for `return` to keep the deposit held for a damaged item | Req 60, 61 |
| **Member 1** | On rejecting a request whose deposit was already paid at checkout: does `reject` trigger Member 2's refund, or should my action call Member 2? | Req 56 |
| **Member 1** | Commands to store, cancel and reject an extension request (the plan lists only `extend`), or permission to write `Reservation.extension` | Req 74, 75 |
| **Member 1** | An optional `rejectionReason` (up to 500 characters) on `Reservation`, set by `reject` | Req 56 |
| **Member 1** | What happens to reservations nobody answers or completes: an unanswered request, a booking never picked up, an item never returned | Req 53, 54, 106 |
| **Member 1** | Checkout uses my `getCheckoutEntries` and `removeEntries` (§3.4) to read and clear the borrow list | Req 46–49 |
| **Member 1** | `getAvailability` / `checkOverlap` for extensions and for warnings in the borrow list | Req 46, 74, 75 |
| **Member 2** | `releaseDeposit` and `applyLateFee` signatures (minor units, idempotency key), if my service calls them | Req 60 |
| **Member 3** | Confirm `hasOpenDamageCase(reservationId)` and `recalculateTrust(userId, { eventKey, session })` as in member3.md §6.1 | Req 60 |
| **Member 6** | `ItemDeliverySettings` props, and whether delivery settings are saved through your endpoint (as with pickup/rules in Sprint 1) or mine | Req 69 (your), item editor (mine) |
| **Member 6** | For a delivered item, does "delivered" also count as picked up, or does the lender still mark pickup? | Req 59 |
| **Member 6** | `validateBooking` so extensions respect `maxBorrowDays` / `minTrustScore` and membership limits | Req 74, 75 |
| **Member 7** | Embed `<BorrowListButton itemId={item._id} />` on `ItemDetailsPage`; read `item.tags` for alternatives (old items may have none) | Req 46, 92 |
| **Member 9** | Event names used here: `picked_up`, `returned`, `completed` (already in your list) | Req 57/58 area |

---

## 11. Acceptance checks

- **Ownership:** a lender can't act on another lender's reservation, and a borrower can't act as the lender. Wrong person → `403`.
- **Lifecycle:** every action needs the right current state (approve/reject only `pending`, pickup only `confirmed` within its dates, return only `active`). Anything else → `409`.
- **No double effects:** double clicks or retries of approve, pickup or return change nothing twice; a good return never releases a deposit twice.
- **Damage:** a good return is refused while a damage case is open; a damaged return keeps the deposit held.
- **Extensions:** extending into someone else's booking fails; only one pending request; overdue reservations can't be extended; an unanswered request is shown as expired after the end date.
- **Borrow list:** your own items, duplicates, an 11th entry, invalid or past dates and archived items are all refused; stale entries are kept and marked.
- **Archive:** an item with open bookings can't be archived.
- **Dashboard:** figures match the reservations and damage reports exactly; other lenders' data never appears.
- **Phone width:** every Member 5 page works at 375 px.
