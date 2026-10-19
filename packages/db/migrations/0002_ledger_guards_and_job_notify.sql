-- Ledger immutability: entries are never updated or deleted; corrections are reversal entries (plan 9.1).
CREATE OR REPLACE FUNCTION ledger_entries_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is append only (% blocked)', TG_OP USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint
CREATE TRIGGER ledger_entries_no_update BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION ledger_entries_immutable();--> statement-breakpoint
CREATE TRIGGER ledger_entries_no_truncate BEFORE TRUNCATE ON ledger_entries
  FOR EACH STATEMENT EXECUTE FUNCTION ledger_entries_immutable();--> statement-breakpoint

-- Double entry: at commit, every transaction must have equal debit and credit totals.
CREATE OR REPLACE FUNCTION ledger_transaction_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  diff bigint;
BEGIN
  SELECT coalesce(sum(CASE WHEN side = 'borc' THEN credits ELSE -credits END), 0)
    INTO diff FROM ledger_entries WHERE transaction_id = NEW.transaction_id;
  IF diff <> 0 THEN
    RAISE EXCEPTION 'ledger transaction % is unbalanced by %', NEW.transaction_id, diff
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ledger_entries_balanced AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger_transaction_balanced();--> statement-breakpoint

-- Job queue: NOTIFY jobs_<type with dots replaced by underscores> with the job id (plan Ek C.3).
CREATE OR REPLACE FUNCTION jobs_notify() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('jobs_' || replace(NEW.type::text, '.', '_'), NEW.id::text);
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE TRIGGER jobs_notify_insert AFTER INSERT ON jobs
  FOR EACH ROW WHEN (NEW.status = 'queued') EXECUTE FUNCTION jobs_notify();
--> statement-breakpoint
CREATE TRIGGER jobs_notify_requeue AFTER UPDATE OF status ON jobs
  FOR EACH ROW WHEN (NEW.status = 'queued' AND OLD.status IS DISTINCT FROM 'queued')
  EXECUTE FUNCTION jobs_notify();--> statement-breakpoint

-- Consents and audit log are append only. The only allowed UPDATE is the FK action that sets the user
-- column (TG_ARGV[0]) to NULL when the account is deleted; the hash column keeps the proof.
CREATE OR REPLACE FUNCTION append_only_except_user_null() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  col text := TG_ARGV[0];
BEGIN
  IF TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) ->> col) IS NULL
     AND (to_jsonb(OLD) - col) = (to_jsonb(NEW) - col) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% is append only (% blocked)', TG_TABLE_NAME, TG_OP USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint
CREATE TRIGGER consents_append_only BEFORE UPDATE OR DELETE ON consents
  FOR EACH ROW EXECUTE FUNCTION append_only_except_user_null('user_id');--> statement-breakpoint
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION append_only_except_user_null('actor_id');
