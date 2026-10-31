# Admin user management regression checks

From `server/`, after installing dependencies:

```sh
TEST_MONGO_URI='<disposable local or QA replica-set URI>' node src/controllers/admin-users-tests/regressions.cjs
```

The harness uses and drops a separate `admin_users_test_<process id>` database. It runs 15 scenario groups and exits nonzero if any assertion fails. Use an isolated checkout: the private-file cleanup test creates a fictional upload and removes it afterward. Database transactions require Atlas or a replica set.

Coverage includes authorization, public response fields, literal searches, pagination validation, lender filtering, pagination, IDs, status validation, suspension/reinstatement, administrator protections, account deletion, archived listings, household/application/favorite cleanup, rollback, and private-file cleanup after commit. Log messages beginning `Injected` are intentional failures used to verify rollback.

Optional: set `TEST_REPORT_PATH` to save the JSON results.
