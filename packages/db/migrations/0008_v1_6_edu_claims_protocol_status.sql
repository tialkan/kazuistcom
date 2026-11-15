-- v1.6 (ADR-0038). Additive only: one enum value, one function, one table, two indexes, one trigger and a backfill.
-- Nothing is dropped, renamed or rewritten; edu_verifications rows are read, never changed.

-- Plan 6.1 asks for a protocol for bulk collection (Yargitay, Danistay) and none was applied for yet. The new value
-- is not used in this migration (a value added in a transaction can be used only after it commits).
ALTER TYPE "public"."protocol_status" ADD VALUE 'gerekli_yapilmadi';--> statement-breakpoint
-- The mailbox of an edu.tr address: trimmed, lower case, trailing dots and the +tag of the local part removed. The
-- same rule as kimlik normalizeEduEmail (apps/web/src/server/auth/edu.ts) and its SQL form.
CREATE FUNCTION "edu_mailbox"(email text) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
  AS $$ SELECT regexp_replace(rtrim(lower(btrim(email)), '.'), '\+[^@]*@', '@') $$;--> statement-breakpoint
CREATE TABLE "edu_claims" (
	"email" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	CONSTRAINT "edu_claims_mailbox" CHECK ("edu_claims"."email" = edu_mailbox("edu_claims"."email"))
);
--> statement-breakpoint
CREATE INDEX "edu_claims_user_idx" ON "edu_claims" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "edu_verifications_user_idx" ON "edu_verifications" USING btree ("user_id");--> statement-breakpoint
-- Backfill (docs/istekler/kimlik-edu-tekil.md 4): the oldest verification of a mailbox wins it; the claim keeps the
-- newest verification of that account for the mailbox. Rows of other accounts for the same mailbox stay as they are
-- (nothing is deleted; the decision is Tarik's) and are counted in a warning without any address.
INSERT INTO "edu_claims" ("email", "user_id", "verified_at")
SELECT w.mailbox, w.user_id, max(v.verified_at)
FROM (
  SELECT DISTINCT ON (edu_mailbox(e.email)) edu_mailbox(e.email) AS mailbox, e.user_id
  FROM "edu_verifications" e
  WHERE e.verified_at IS NOT NULL
  ORDER BY edu_mailbox(e.email), e.verified_at, e.created_at, e.id
) w
JOIN "edu_verifications" v
  ON v.user_id = w.user_id AND v.verified_at IS NOT NULL AND edu_mailbox(v.email) = w.mailbox
GROUP BY w.mailbox, w.user_id;--> statement-breakpoint
DO $$
DECLARE
  shared integer;
BEGIN
  SELECT count(*) INTO shared FROM (
    SELECT DISTINCT v.user_id, edu_mailbox(v.email)
    FROM "edu_verifications" v
    JOIN "edu_claims" c ON c.email = edu_mailbox(v.email) AND c.user_id <> v.user_id
    WHERE v.verified_at IS NOT NULL
  ) s;
  IF shared > 0 THEN
    RAISE WARNING 'edu_claims: % account(s) hold a verified edu.tr mailbox that an older account claimed; rows kept (ADR-0038)', shared;
  END IF;
END
$$;--> statement-breakpoint
-- Keeps edu_claims equal to the verified rows of edu_verifications, for every writer. A verified row claims its
-- mailbox for its user; a mailbox that belongs to another account fails the statement with SQLSTATE 23505 and no
-- address in the message. Deleting the last verified row of the owner for a mailbox (account.purge, a users delete
-- that cascades) or clearing its verified_at releases the claim.
CREATE FUNCTION "edu_claims_sync"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  mailbox text;
  newest timestamptz;
  holder uuid;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.verified_at IS NOT NULL THEN
    mailbox := edu_mailbox(OLD.email);
    SELECT max(v.verified_at) INTO newest
    FROM edu_verifications v
    WHERE v.user_id = OLD.user_id AND v.verified_at IS NOT NULL AND edu_mailbox(v.email) = mailbox;
    IF newest IS NULL THEN
      DELETE FROM edu_claims c WHERE c.email = mailbox AND c.user_id = OLD.user_id;
    ELSE
      UPDATE edu_claims c SET verified_at = newest WHERE c.email = mailbox AND c.user_id = OLD.user_id;
    END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.verified_at IS NOT NULL THEN
    mailbox := edu_mailbox(NEW.email);
    INSERT INTO edu_claims AS c (email, user_id, verified_at)
    VALUES (mailbox, NEW.user_id, NEW.verified_at)
    ON CONFLICT (email) DO UPDATE SET verified_at = greatest(c.verified_at, excluded.verified_at)
      WHERE c.user_id = excluded.user_id
    RETURNING c.user_id INTO holder;
    IF holder IS NULL THEN
      RAISE EXCEPTION 'edu.tr mailbox is verified on another account'
        USING ERRCODE = 'unique_violation', CONSTRAINT = 'edu_claims_pkey', TABLE = 'edu_claims';
    END IF;
  END IF;
  RETURN NULL;
END
$$;--> statement-breakpoint
CREATE TRIGGER "edu_verifications_claim"
  AFTER INSERT OR DELETE OR UPDATE OF "user_id", "email", "verified_at" ON "edu_verifications"
  FOR EACH ROW EXECUTE FUNCTION "edu_claims_sync"();
