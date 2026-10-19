-- Smoke test on a real PostgreSQL + pgvector after infra/scripts/migrate.mjs.
-- Run: psql -v ON_ERROR_STOP=1 -f infra/scripts/db-smoke.sql
-- Every check raises an exception on failure; the transaction is rolled back so nothing persists.
\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN RAISE EXCEPTION 'vector missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN RAISE EXCEPTION 'pg_trgm missing'; END IF;
  RAISE NOTICE 'server %, vector %', current_setting('server_version'),
    (SELECT extversion FROM pg_extension WHERE extname = 'vector');
END $$;

-- vector / halfvec distance and the HNSW index on chunks.embedding
DO $$
DECLARE d float8;
BEGIN
  SELECT '[1,0,0]'::halfvec(3) <=> '[0,1,0]'::halfvec(3) INTO d;
  IF abs(d - 1) > 1e-3 THEN RAISE EXCEPTION 'halfvec cosine distance wrong: %', d; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'chunks_embedding_hnsw_idx' AND indexdef ILIKE '%hnsw%')
    THEN RAISE EXCEPTION 'HNSW index missing'; END IF;
END $$;

-- pg_trgm similarity
DO $$
BEGIN
  IF similarity('Yargıtay kararı', 'Yargıtay kararları') < 0.3 THEN RAISE EXCEPTION 'pg_trgm similarity too low'; END IF;
END $$;

-- turkish text search configuration with stemming, and the generated tsvector column
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'turkish') THEN RAISE EXCEPTION 'turkish ts config missing'; END IF;
  IF NOT to_tsvector('turkish', 'mahkemelerin kararları') @@ plainto_tsquery('turkish', 'karar')
    THEN RAISE EXCEPTION 'turkish stemming did not match'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'chunks' AND column_name = 'tsv' AND is_generated = 'ALWAYS')
    THEN RAISE EXCEPTION 'chunks.tsv generated column missing'; END IF;
END $$;

-- ledger: balanced transaction accepted, update and delete blocked
DO $$
DECLARE a1 uuid; a2 uuid; tx uuid;
BEGIN
  INSERT INTO ledger_accounts (kind, code) VALUES ('promosyon_havuzu', 'smoke:promo') RETURNING id INTO a1;
  INSERT INTO ledger_accounts (kind, code) VALUES ('tuketim', 'smoke:tuketim') RETURNING id INTO a2;
  INSERT INTO ledger_transactions (kind, idempotency_key) VALUES ('tuketim', 'smoke-1') RETURNING id INTO tx;
  INSERT INTO ledger_entries (transaction_id, account_id, side, credits, kind)
    VALUES (tx, a1, 'borc', 5, 'tuketim'), (tx, a2, 'alacak', 5, 'tuketim');
  SET CONSTRAINTS ALL IMMEDIATE;
  BEGIN
    UPDATE ledger_entries SET credits = 1 WHERE transaction_id = tx;
    RAISE EXCEPTION 'ledger update was not blocked';
  EXCEPTION WHEN restrict_violation THEN NULL;
  END;
  BEGIN
    DELETE FROM ledger_entries WHERE transaction_id = tx;
    RAISE EXCEPTION 'ledger delete was not blocked';
  EXCEPTION WHEN restrict_violation THEN NULL;
  END;
END $$;

-- ledger: unbalanced transaction rejected by the deferred constraint trigger
DO $$
DECLARE a1 uuid; tx uuid;
BEGIN
  SELECT id INTO a1 FROM ledger_accounts WHERE code = 'smoke:promo';
  INSERT INTO ledger_transactions (kind, idempotency_key) VALUES ('tuketim', 'smoke-2') RETURNING id INTO tx;
  BEGIN
    INSERT INTO ledger_entries (transaction_id, account_id, side, credits, kind) VALUES (tx, a1, 'borc', 3, 'tuketim');
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'unbalanced transaction was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

ROLLBACK;
\echo db-smoke: all checks passed
