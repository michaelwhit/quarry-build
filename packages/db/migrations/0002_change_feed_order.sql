-- Change-feed ordering fix.
--
-- nextval() hands out server_seq values in call order, but transactions commit in any order. A
-- device that pulled "everything after seq 100" could miss a row whose seq 99 committed after
-- the pull. Taking one transaction-scoped advisory lock before nextval() makes sequence
-- assignment and commit happen in the same order, because the lock is held until commit: a reader
-- that sees seq N has seen every lower seq. Writers on the change feed serialize on this lock,
-- which is fine at district scale (short transactions, a few hundred writers).
CREATE OR REPLACE FUNCTION app_touch_row() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(7101);
  NEW.server_seq := nextval('change_seq');
  IF TG_OP = 'UPDATE' THEN
    NEW.row_version := OLD.row_version + 1;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION app_seq_on_insert() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(7101);
  NEW.server_seq := nextval('change_seq');
  RETURN NEW;
END
$$;
