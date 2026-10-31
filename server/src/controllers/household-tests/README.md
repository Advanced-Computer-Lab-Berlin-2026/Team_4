# Household regressions

From server/, with dependencies installed:

```sh
TEST_MONGO_URI='<disposable MongoDB connection>' node src/controllers/household-tests/regressions.cjs
```

Creates and drops household_test_<process id>. Use only a disposable test server. Expected: 13 passing groups and exit code 0. A synchronized read barrier makes competing decisions reproducible. Results are written to member8-results.json; set REPORT to choose another path.

Browser checks: log in normally, request a member using a phone with spaces/hyphens, accept as that member, check linked status and remove the link. Test phone width. With delayed responses and DEV account switching, previous users' links must never reappear. The page resets on identity change and only the latest active refresh can update it.
