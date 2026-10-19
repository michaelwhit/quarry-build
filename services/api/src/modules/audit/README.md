# `audit` module

Owned by Track 1. The hash-chained audit writer (`PgAuditSink`) and the chain verifier.

- One chain per tenant: `hash = SHA-256(prev_hash || 0x00 || JSON(fields))` (`chain.ts`).
- Writers are serialized per tenant with a Postgres advisory lock, so the chain never forks.
- `audit_event` is append-only at the database (triggers, no UPDATE or DELETE for `iep_app`).
- The auth middleware calls `record` for every authorization decision and fails the request if it rejects.

Not stored yet: the policy ids that decided a request and the request id. They need columns in `audit_event` (a Track 2 contract change); until then they are in the api log only.

## Known limits (reviewer notes, deferred)

- **Pool sizing:** `record()` holds a connection while it waits on the tenant lock. Build the sink on `createAuditPool(...)`, never the request pool, so a burst of requests cannot exhaust connections and deadlock.
- **Verification is paged** (`verifyTenantChain`, 1000 rows a page), so a large tenant is not held in memory.
- **Tail deletion:** dropping the newest rows leaves a valid chain. Closing this needs the latest hash per tenant anchored somewhere outside the database on a schedule.
- **Forgery:** the hash is unkeyed, so anyone who can INSERT as `iep_app` could append a validly hashed row. An HMAC with a key held outside the database would cover it. Record both this and tail deletion in the threat model.
- **Policy id and request id columns:** added by migration 0003 in PR #4; storing them is a follow-up here once #4 merges.
