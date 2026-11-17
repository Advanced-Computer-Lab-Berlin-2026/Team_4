# Sprint 2 ownership

Use the updated ShareShed Sprint 2 work division for each member's requirement IDs and file list. Sprint 1 ownership remains the default for legacy feature files. Sprint 2 ownership assigns one editor per shared surface.

| Owner | Files and responsibilities |
| --- | --- |
| 1 | Shared app/startup/config, navigation and route wiring, checkout API and pages, reservation commands and chat. Owns `Reservation.js`, `ChatMessage.js`, `BookingLock.js`, `ReservationHold.js` and `CheckoutAttempt.js`. A checkout attempt stores inventory and orchestration state. |
| 2 | Wallet/Stripe, payment operation, ledger and audit. |
| 3 | Damage decisions, private evidence, reviews and trust. |
| 4 | Moderation, reports, exports and support. |
| 5 | Borrow lists, lender lifecycle screens and listing schema/editor. Uses the reservation command layer. |
| 6 | Delivery, item policy/pricing, promo codes and redemptions. |
| 7 | Item details, catalog availability UI, alternatives and waitlist queue. |
| 8 | Membership, tier policy and household benefits. |
| 9 | Notification outbox, email, reminders and referrals. |

To add a shared dependency, route change or schema field, send the requirement to the file owner. The feature owner implements their feature in their own modules. Imports and callback contracts connect the two without duplicate edits.
