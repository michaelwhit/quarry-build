# packages/policies

Cedar authorization for the api. Role, relationship and section sensitivity (S1 to S5) decide every request. Anything no `permit` covers is denied.

- `cedar/iep.cedarschema`: entities, actions and the request context. Policies are validated against it in strict mode (`validatePolicies()`, run by the tests).
- `cedar/iep.cedar`: the policies. Every policy has an `@id`, and decisions return the ids that fired so the audit log can name them.
- `src/index.ts`: `authorizeRequest(...)`, a thin wrapper over `@cedar-policy/cedar-wasm`. Malformed requests fail closed.
- `test/matrix.test.ts`: the role matrix written out as allow and deny cases per role.

The server resolves each caller's relationship to a student from `caseload_assignment` and passes it in; the client never supplies it. Reading of the matrix where it was ambiguous: general-ed teachers and paraprofessionals read S3 and add data only on goals delegated to them, and have no other write.

Changing a policy is a security-relevant PR: it needs a second reviewer.
