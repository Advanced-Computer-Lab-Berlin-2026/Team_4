# Member 7 - Sprint 2 contract (availability discovery, alternatives, waitlists)

Requirements: 43, 44, 65, 66, 67, 92. NFR 2 (search < 2 s at 5,000 items) and NFR 15 (accessible browse/calendar).
Errors are always `{ message, errors? }`. Dates are UTC calendar days `YYYY-MM-DD`; ranges are half-open `[start, end)`
(confirmed by SPRINT2_CONTRACT.md: Dec 1 -> Dec 3 is bookable again on Dec 3).

## Endpoints

| Method | Path | Access | Req | Request | Response |
|---|---|---|---|---|---|
| GET | `/api/catalog` | public | 16-18, 35, **44** | `q, category, sort, page, limit`, **`availableFrom` + `availableTo`** | `{ items, total, page, limit, pages }` |
| GET | `/api/catalog/:id/availability` | public | **43** | `from, to` (window, default today..+60 d, max 400 d) | `{ itemId, from, to, booked: [{ start, end, type: 'booked' \| 'held' }] }` - dates only, never who |
| GET | `/api/catalog/:id/alternatives` | public | **92** | `start, end` (required, max 90 d), `limit` (1-12) | `{ items, total }` (ItemCard shape) |
| POST | `/api/waitlists` | member | **65** | `{ itemId, startDate, endDate }` | `201 { entry }`; 409 if dates are free, already queued, or overlapping |
| GET | `/api/waitlists/mine` | member | **66** | optional `?item=<id>` | `{ items: [entry + item{title, photos}], total }` |
| DELETE | `/api/waitlists/:id` | member (owner of entry) | **66** | - | `{ entry }`; leaving an open offer releases the hold and passes it on |

`entry.status`: `waiting` -> `promoted` (offer: `offerExpiresAt`, `holdId`) -> `fulfilled` | `expired`; or `left`.
Public visibility (`Item.publicFilter()`) applies to every query. Alternatives never include unavailable, archived,
removed, or inactive-category items.

## Promotion (Req 67) - follows SPRINT2_CONTRACT.md "1 / 7" and M1's real code
1. Candidates: waiting entries whose dates overlap the freed range, ordered by M8 `waitlistPriority` (1 = top, re-read at
   promotion time so an expired tier loses its benefit), then FIFO.
2. For each candidate, in ONE transaction: `holdForWaitlist({ borrowerId, itemId, startDate, endDate, expiresAt, session })`
   (`services/reservations/reservationCommands.js`, atomic claim through M1's booking locks) -> entry becomes `promoted`
   with `holdId` + `offerExpiresAt` (`WAITLIST_OFFER_HOURS`, default 12) -> `waitlist_promoted` event via M9's
   `enqueueEvent` (same session, key `waitlist_promoted:<entryId>`). If M1 refuses with a 4xx (dates taken, membership
   limit, trust score, own listing, ...) that candidate is skipped and the next one is tried.
3. The offeree books via `/checkout?source=single&itemId=&startDate=&endDate=&holdId=` (`dateUtils.offerUrl`); M1's
   checkout consumes the hold. A booking by the offeree marks the entry `fulfilled`; a lapsed offer becomes `expired`,
   `releaseWaitlistHold` is called and the dates go to the next member. Leaving an open offer does the same.
4. Trigger: `startWaitlistSweeper()` runs every minute (settle offers, offer any freed dates). It starts by itself when
   `routes/waitlists.routes.js` loads and the DB connection opens (disable with `WAITLIST_SWEEPER=off`). M1 may instead call
   it from `startSprint2Jobs`; it is idempotent. `promoteNext(itemId, range, eventKey)` is exported for event-driven use.

## Availability rule (single source)
`services/catalog/availabilityBridge.js` imports `BLOCKING_STATUSES` and `overlapFilter` from M1's
`services/reservations/availability.js` and queries `Reservation` + unexpired `ReservationHold` (bulk for the catalog filter,
per item for the calendar); the join check calls M1's `checkOverlap`. A member's own hold is shown as free to them.

## Event emitted
`waitlist_promoted` - recipients `[userId]`; payload `{ itemId, itemTitle, status:'offered', startDate, endDate, holdId,
offerExpiresAt, trigger }`. M9: add a template; link to `/checkout?source=single&itemId=&startDate=&endDate=&holdId=`.

## What M7 consumes
| From | Used for | If missing |
|---|---|---|
| M1 `availability.js`, `reservationCommands.holdForWaitlist / releaseWaitlistHold` | overlap rule, atomic claim / release | hard dependency (present on `main`) |
| M8 `membership/entitlements.getEntitlements(userId, at)` -> `waitlistPriority` | queue order | reads the tier directly; default 3 |
| M9 `notifications/eventOutbox.enqueueEvent(...)` | promotion notification | console warning, no notification |
| M3 `TrustSummary({ userId })`, M5 `BorrowListButton({ itemId, startDate, endDate })` | ItemDetailsPage slots (`import.meta.glob`) | page renders without them |

## Tests
- `cd server && npm run test:sprint2` - unit tests always run; integration tests (availability / filter / alternatives /
  waitlist with M1's real holds) run with `TEST_MONGO_URI` (disposable replica set); `RUN_PERF=1` adds the NFR 2 proof
  on a throw-away database.
- `cd client && npm run test:sprint2` - calendar, filter, links and route registration.
