-- Contract v1.2 (ADR-0026): odeme audit D4, D6 and re-audit, embed.chunks consistency. Additive only.
-- Hand edits after drizzle-kit generate: the two CHECK constraints are NOT VALID (existing rows of a staging
-- database are not re-checked; new and updated rows are), and the trigger section at the end is hand written.
CREATE UNIQUE INDEX "products_code_price_table_uq" ON "products" USING btree ("code","price_table_id");--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_kind" CHECK ("notices"."kind" in ('odeme_7_gun', 'yillik_30_gun', 'odeme_alindi', 'odeme_basarisiz', 'plan_ucretsize_indi', 'fiyat_degisikligi', 'sozlesme', 'fesih_teyidi')) NOT VALID;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_status" CHECK ("payments"."status" in ('hazir', 'bekliyor', 'basarili', 'basarisiz')) NOT VALID;--> statement-breakpoint

-- D6: ledger_transactions is append only, like ledger_entries (corrections are reversal transactions).
CREATE OR REPLACE FUNCTION append_only_table() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append only (% blocked)', TG_TABLE_NAME, TG_OP USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint
CREATE TRIGGER ledger_transactions_no_update BEFORE UPDATE OR DELETE ON ledger_transactions
  FOR EACH ROW EXECUTE FUNCTION append_only_table();--> statement-breakpoint
CREATE TRIGGER ledger_transactions_no_truncate BEFORE TRUNCATE ON ledger_transactions
  FOR EACH STATEMENT EXECUTE FUNCTION append_only_table();--> statement-breakpoint

-- D6: a credit lot is never deleted and only remaining_credits may change (consumption, refund, expiry).
CREATE OR REPLACE FUNCTION credit_lots_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - 'remaining_credits') = (to_jsonb(OLD) - 'remaining_credits') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'credit_lots: only remaining_credits may change (% blocked)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint
CREATE TRIGGER credit_lots_guard BEFORE UPDATE OR DELETE ON credit_lots
  FOR EACH ROW EXECUTE FUNCTION credit_lots_guard();--> statement-breakpoint
CREATE TRIGGER credit_lots_no_truncate BEFORE TRUNCATE ON credit_lots
  FOR EACH STATEMENT EXECUTE FUNCTION credit_lots_guard();--> statement-breakpoint

-- embed.chunks consistency (ADR-0026): chunks exist only for the current records.masked_text. Any change of
-- masked_text, including to NULL (editor queue), deletes the record's chunks in the same transaction; a
-- non-NULL value enqueues embed.chunks (dedupe key embed:<id>, a queued or running job is not duplicated).
CREATE OR REPLACE FUNCTION records_masked_text_sync() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    DELETE FROM chunks WHERE record_id = NEW.id;
  END IF;
  IF NEW.masked_text IS NOT NULL THEN
    INSERT INTO jobs (type, payload, dedupe_key)
    VALUES ('embed.chunks', jsonb_build_object('recordId', NEW.id), 'embed:' || NEW.id::text)
    ON CONFLICT (type, dedupe_key) WHERE dedupe_key IS NOT NULL AND status IN ('queued', 'running') DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE TRIGGER records_masked_text_insert AFTER INSERT ON records
  FOR EACH ROW WHEN (NEW.masked_text IS NOT NULL) EXECUTE FUNCTION records_masked_text_sync();--> statement-breakpoint
CREATE TRIGGER records_masked_text_update AFTER UPDATE OF masked_text ON records
  FOR EACH ROW WHEN (OLD.masked_text IS DISTINCT FROM NEW.masked_text) EXECUTE FUNCTION records_masked_text_sync();
