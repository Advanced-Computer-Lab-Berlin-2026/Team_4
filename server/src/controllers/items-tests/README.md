# Listing regressions

From server/, after npm ci, run:

```sh
TEST_MONGO_URI='<disposable MongoDB connection>' node src/controllers/items-tests/regressions.cjs
```

Uses an isolated `items_test_<pid>` database and generated photos; drops that database and removes referenced test photos afterward. Run in an isolated checkout. Never use production credentials. Requires Node >=20.9 (Sharp); Node 24 was tested.

Expected: 17 PASS groups and exit code 0. Injected population/response errors are intentional. The suite covers ownership, validation, image decoding, atomic photo limits, uppercase photo deletion, archive visibility, and preservation of referenced uploads after a post-write failure. JSON results are saved to items-test-results.json or TEST_REPORT_PATH.

Browser regression checks after starting the app:
1. Open a protected listing URL while logged out; log in normally and verify return to the intended page.
2. Open an item from My items, change its title, then press browser Back. Stay must preserve the title; Leave must return to the list. Repeat with an in-app link.
3. Repeat after switching to Pickup & rules: the warning must remain visible.
4. Save edits; Back should then proceed without a warning.
5. Create an item with a valid PNG/JPEG; its edit page should open without a warning. Further edits must warn again.
6. Check reload/close invokes the browser's native unsaved-changes warning (browser-dependent wording).
7. Verify normal logout, protected routes, and warning controls at phone width.

The navigation guard covers unsaved Details fields and selected new-item photos. Photo changes to existing items are saved immediately. It does not implement the other members' tab forms or change logout semantics.
