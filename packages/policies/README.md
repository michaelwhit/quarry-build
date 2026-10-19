# packages/policies

Owned by Track 1.

Cedar authorization for the api (architecture section 5.3, security design section 3.3). Role, relationship and section sensitivity (S1 to S5) decide every request. Anything no `permit` covers is denied.

- `cedar/iep.cedarschema`: entities, actions and the request context. Policies are validated against it in strict mode (`validatePolicies()`, run by the tests).
- `cedar/iep.cedar`: the policies. Every policy has an `@id`, and decisions return the ids that fired so the audit log can name them.
- `src/index.ts`: `authorizeRequest(...)`, a thin wrapper over `@cedar-policy/cedar-wasm`. Malformed requests fail closed.
- `test/matrix.test.ts`: the role matrix written out as allow and deny cases per role.

The server resolves each caller's relationship to a student from `caseload_assignment` and passes it in; the client never supplies it. Reading of the matrix where it was ambiguous: general-ed teachers and paraprofessionals read S3 and add data only on goals delegated to them, and have no other write.

Changing a policy is a security-relevant PR: it needs a second reviewer.

## Known gap: sync push is not yet decided by Cedar (recorded 2026-10-18)

`syncPush` is marked `per-item` in `endpoints.ts`, but `modules/sync/push.ts` enforces role,
visible-student scope and delegation at the recording time in SQL instead of calling
`app.authorizeItem` per mutation. The change feed (`/v0/sync/changes`) and the goals read do use
Cedar. Moving push onto `authorizeItem` (so the policy files are the single authority and every
accepted write is audited with its policy id) is backlog item T2-22; until then a change to the
`AddDataPoint` rule needs the matching SQL edit.
