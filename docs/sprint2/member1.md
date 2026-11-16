# Member 1 · Reservations, checkout and chat

| Req | User flow |
| --- | --- |
| 45 | Sign in as a member, open **Reserve**, choose an item and dates, then review and submit. The request starts as pending lender approval. |
| 49 | Open **Reserve → Checkout borrow list**. Review the total and submit. Each saved entry becomes a reservation in the same transaction. The borrow list editor belongs to Member 5. |
| 55 | Open **Reservations**, select an upcoming request and confirm cancellation before its pickup date. |
| 68 | Open an upcoming or active reservation as its borrower or lender to read and send messages. Messages refresh every five seconds. |

Reserving uses UTC dates at midnight with an exclusive end date. A March 1–3 reservation lets another borrower start on March 3. Cancellation closes at midnight UTC at the start of the pickup date. Pending, confirmed and active reservations block their agreed interval. Temporary holds block only until their explicit expiry. A borrow-list draft does not hold dates.

Checkout commits all lines together. Quotes are recomputed on submit and rejected when the cart, price or availability changes. The client sends a quotation fingerprint and an operation key. The server stores the key per borrower and returns the original attempt on retries. Card holds expire after 30 minutes. An unfulfillable late card payment is sent for compensation through the payment integration.

## HTTP contract

All endpoints except the signed Stripe callback and readiness check require a signed-in member. Dates in request bodies use `YYYY-MM-DD`. Responses use ISO timestamps and EGP amounts or `amountMinor` where indicated.

| Method | Path | Request and response |
| --- | --- | --- |
| GET | `/api/reservations/availability/:itemId` | Query `startDate,endDate`. Returns `{available,booked}` with date ranges only. |
| GET | `/api/reservations` | Optional `page`. Returns `{items,hasNext}` for the signed-in participant. |
| GET | `/api/reservations/:id` | Returns `{reservation}` to its participants. |
| POST | `/api/reservations/:id/cancel` | Borrower only. Optional `{reason}`. Returns the resulting `{reservation}`. |
| POST | `/api/checkout/quote` | A selection of `{source:"borrowList"}` or `{source:"single",itemId,startDate,endDate,holdId?}`. The service accepts optional `promoCode` and `fulfilment` from the pricing integration. Returns `{quote:{quoteHash,lines,amountMinor,currency,paymentMethods}}`. |
| POST | `/api/checkout` | Same selection plus `quoteHash,method,operationKey`. Returns `{checkout:{id,status,reservationIds,redirectUrl?,failure?}}`. A payment in progress returns 202. |
| GET | `/api/checkout/:id` | Owner polls checkout progress after redirect. Returns `{checkout}`. |
| GET | `/api/reservation-chat/:id/messages` | Participants only. Optional `before` message ID. Returns `{items,hasEarlier}` with up to 50 messages in chronological order. |
| POST | `/api/reservation-chat/:id/messages` | Participants only. Accepts `{text}`, up to 2,000 characters. Returns 201 and `{message}`. |
| POST | `/api/stripe-webhook` | Member 2 verifies the Stripe signature over the raw body and returns an affected checkout ID. The endpoint is unavailable until that service is installed. |
| GET | `/api/health/ready` | 200 when MongoDB is connected and 503 otherwise. Use with the existing liveness endpoint at `/api/health`. |

## Local verification

Point `MONGO_URI` at MongoDB Atlas or a transaction-capable replica set and configure `JWT_SECRET`. Run `npm run seed` to add a zero-deposit demo listing, **ShareShed Demo Hand Trowel**. The seeded borrow list starts empty and can be populated with the Member 5 UI or test fixtures. Listings with a payable balance require Member 2's payment service. The application returns a service-unavailable error until the payment integration is installed.

Run these commands from the repository root. Use a disposable replica set for test data.

```sh
TEST_MONGO_URI='mongodb://localhost:27017/?replicaSet=rs0' npm run test:sprint2 --prefix server
TEST_MONGO_URI='mongodb://localhost:27017/?replicaSet=rs0' node server/test/sprint2/load.js
npm run build --prefix client
```

Sprint 2 tests use Node's built-in `node:test` and `node:assert/strict`. Add each member's suite as `server/test/sprint2/memberN.test.js`. Suites using MongoDB should use a unique disposable database. Run `npm run seed` against a development database for three completed reservation fixtures: an on-time return, a late return and a damaged return with an open report and a held deposit. They are inserted once per database. The open case is a fixture for damage decisions and has no attached photos. To exercise uploads, use a separate reservation whose evidence stage is open.

The load script uses 5,000 listings and 200 concurrent local requests, half browsing and half reserving different items. It checks zero failures and an adjustable 2-second combined p95 budget (`LOAD_P95_MS`). It measures local performance. Configure deployed monitoring against the readiness endpoint to evaluate the 99% business-hours uptime target. Run the server under a service manager with restart on failure and preserve the MongoDB replica-set configuration during recovery.
