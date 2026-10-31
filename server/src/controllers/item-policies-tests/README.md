# Item policy regressions

Run from server after npm ci:

```sh
TEST_MONGO_URI='<disposable MongoDB connection>' node src/controllers/item-policies-tests/regressions.cjs
```

Creates and drops an isolated item_policies_test_<pid> database and writes fictional uploads. Use an isolated checkout and a disposable server. Expected: 16 passing groups and exit code 0. Injected errors are intentional. Results go to item-policies-results.json (override REPORT).

Covers ownership, validation, pickup/rules persistence, multiplier permissions, manual viewing/upload/replacement/removal, invalid contents, pre-/post-write failures, and synchronized concurrent manual changes. Images over 25 megapixels, encrypted/unreadable PDFs and incomplete files are rejected. The PDF parser checks structure; it is not a malware scanner.

Browser checks: edit pickup/rules, switch tabs and return; drafts must remain. Select a manual, switch tabs and return; selection must remain. During upload/removal all manual mutation controls must be disabled. Verify saved manuals can be opened from the catalog.
