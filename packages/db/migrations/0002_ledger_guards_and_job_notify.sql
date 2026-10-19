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
