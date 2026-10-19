# `audit` module

The hash-chained audit writer (`PgAuditSink`) and the chain verifier.

- One chain per tenant: `hash = SHA-256(prev_hash || 0x00 || JSON(fields))` (`chain.ts`).
- Writers are serialized per tenant with a Postgres advisory lock, so the chain never forks.
- `audit_event` is append-only at the database (triggers, no UPDATE or DELETE for `iep_app`).
- The auth middleware calls `record` for every authorization decision and fails the request if it rejects.

Not stored yet: the policy ids that decided a request and the request id. They need columns in `audit_event` (a contract change); until then they are in the api log only.
