-- The audit writer records which policy decided a request and which request it was.
-- Both are opaque ids (policy @id annotations; the api's request uuid), never row content.
-- audit_event stays append-only: adding nullable columns does not touch the immutability triggers.
ALTER TABLE audit_event
  ADD COLUMN policy_id  text,
  ADD COLUMN request_id text;
