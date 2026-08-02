# Search state retention

The production candidate stores canonical request hashes, operation identity,
completed response envelopes, and quota counters. It does not store raw request
bodies or raw network addresses in the state tables. Quota subjects are
namespace-bound SHA-256 values.

The bounded defaults are:

- completed free-search response envelopes: 24 hours;
- expired in-progress leases: one additional hour;
- free-quota counters: two hours.

Run a count-only plan first:

```sh
node scripts/production/search-state-retention.mjs --plan
```

The command reads `CLERVO_DATABASE_URL` and `CLERVO_STATE_NAMESPACE` from the
operator environment but never prints the connection string. Applying deletion
requires both `--apply` and the exact untracked confirmation
`CLERVO_RETENTION_CONFIRM=delete-expired:<namespace>`.

Deletion against production or customer data is an irreversible operation and
requires explicit owner approval for that exact run. The checked-in tests use
only injected state clients and do not connect to or delete from a database.
Reports contain aggregate counts only.
