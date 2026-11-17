# Member 4 · Sprint 2 moderation, reporting and support

**Requirements:** 93, 94, 95, 96, 105, 109, 110, 111.

## Moderation (Req 93)

Admins open `/admin/moderation`. They can log a report by choosing an item or user and supplying its ID. The ID appears at the end of the listing or admin user detail URL. Members can raise an issue from `/support`, select a listing or user report, and provide a related target ID. An admin can select **Create linked Moderation Report** while resolving that ticket. The ticket and report link are saved in one transaction, and a repeated resolution does not create a duplicate report.

`GET /api/moderation/reports` accepts `status=open|actioned|dismissed`, `targetType=item|user`, `page`, and `limit`. `POST /api/moderation/reports` accepts `{ targetType, targetId, reason, details? }`. `PATCH /api/moderation/reports/:id/action` accepts `{ action: 'flag'|'remove'|'dismiss', adminNotes? }`. All routes require an administrator. Listing removal archives the listing and user removal suspends a member and archives their listings. Each action retains reservation and payment history. Flags update `Item.moderationStatus` or the shared `User.isFlagged` marker. That marker requires Member 1's companion patch.

## Analytics and exports (Reqs 94–96, 105)

Admins open `/admin/reports/usage` or `/admin/reports/damage`. `GET /api/analytics/usage` counts each reservation in the month of its UTC **start date**. It accepts `month=YYYY-MM`, `item` (name or ID), `itemId`, `category` (name, slug or ID), and `startDate`/`endDate` (inclusive calendar days). The response contains totals, listing rows and month/category totals. Archived listings remain in reports. The damage report uses report creation date and supports `status=open|decided|disputed|resolved` and `resolution=pending|full_refund|partial_forfeit|full_forfeit|no_deposit`. It displays the original deposit, decision or final forfeiture, refund and dispute history. When the separately owned decision route exists, the listing in each damage row links to that case. Condition photos and private paths are kept out of the reports.

Both endpoints support `/export?format=csv|pdf`, using the same filters and row data as the screen. CSV preserves Unicode and escapes formula-like text. PDF uses the existing standard font and replaces characters outside that font's repertoire with `?`. Use CSV for text that needs full Unicode fidelity.

## Support tickets (Reqs 109–111)

Signed-in members submit via `POST /api/support-tickets` with `{ subject, category, description, relatedTargetType?, relatedTargetId? }`. `GET /api/support-tickets/mine` returns only their own tickets and supports a status filter. The ticket owner and admins can open `GET /api/support-tickets/:id` and reply via `POST /api/support-tickets/:id/messages` with `{ body }`. A closed ticket rejects new replies. Admins list tickets via `GET /api/support-tickets` and update them via `PATCH /api/support-tickets/:id/resolve` with `{ status, resolutionNote?, linkReport? }`. The existing database fields `user`, `message` and `replies` remain canonical.

## Testing

Merge current `main` and the Member 1 companion patch to run the complete integration suite. Use a disposable replica set.

```sh
TEST_MONGO_URI='mongodb://localhost:27017/?replicaSet=rs0' npm run test:sprint2 --prefix server
npm run test:sprint2 --prefix client
npm run build --prefix client
```
