CREATE TABLE "order_legal_document_deliveries" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"provider_message_id" text NOT NULL,
	"delivered_at" timestamp with time zone NOT NULL,
	CONSTRAINT "order_legal_deliveries_message" CHECK (length(trim("order_legal_document_deliveries"."provider_message_id")) > 0)
);
--> statement-breakpoint
CREATE TABLE "order_legal_documents" (
	"order_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"version" text NOT NULL,
	"filled_text" text NOT NULL,
	"sha256" text NOT NULL,
	"source_sha256" text,
	"fields" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_legal_documents_order_id_slug_pk" PRIMARY KEY("order_id","slug"),
	CONSTRAINT "order_legal_documents_slug" CHECK ("order_legal_documents"."slug" in ('on-bilgilendirme', 'mesafeli-satis', 'abonelik')),
	CONSTRAINT "order_legal_documents_hash" CHECK ("order_legal_documents"."sha256" = encode(sha256(convert_to("order_legal_documents"."filled_text", 'UTF8')), 'hex')),
	CONSTRAINT "order_legal_documents_source_hash" CHECK ("order_legal_documents"."source_sha256" is null or "order_legal_documents"."source_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "order_legal_documents_filled" CHECK (length("order_legal_documents"."filled_text") > 0 and position('{{' in "order_legal_documents"."filled_text") = 0 and position('[DOĞRULANACAK' in "order_legal_documents"."filled_text") = 0),
	CONSTRAINT "order_legal_documents_fields" CHECK (jsonb_typeof("order_legal_documents"."fields") = 'object')
);
--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_code_unique";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deletion_request_refund" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "order_legal_document_deliveries" ADD CONSTRAINT "order_legal_document_deliveries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_legal_document_deliveries" ADD CONSTRAINT "order_legal_document_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_legal_documents" ADD CONSTRAINT "order_legal_documents_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_legal_documents" ADD CONSTRAINT "order_legal_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_legal_documents_user_idx" ON "order_legal_documents" USING btree ("user_id","order_id");--> statement-breakpoint
-- ADR-0027. Existing order/subscription foreign keys already reference products.id, not code.
-- DROP CONSTRAINT above uses RESTRICT (the default): unknown code-based dependants stop the migration.
-- No historical row is reassigned, deleted or inferred from the current catalog.
CREATE FUNCTION product_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - 'active' - 'iyzico_plan_ref') = (to_jsonb(OLD) - 'active' - 'iyzico_plan_ref') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'product version is immutable' USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint
CREATE TRIGGER product_version_guard BEFORE UPDATE OR DELETE ON products
  FOR EACH ROW EXECUTE FUNCTION product_version_guard();--> statement-breakpoint

CREATE FUNCTION order_legal_owner_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id uuid; accepted_version text;
BEGIN
  SELECT user_id, consent_versions ->> CASE WHEN NEW.slug = 'on-bilgilendirme' THEN 'preInfo' ELSE 'distance' END
    INTO owner_id, accepted_version FROM orders WHERE id = NEW.order_id FOR UPDATE;
  IF owner_id IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'legal document order ownership mismatch' USING ERRCODE = 'check_violation';
  END IF;
  IF accepted_version IS DISTINCT FROM NEW.version OR length(NEW.version) = 0 THEN
    RAISE EXCEPTION 'legal document version differs from order consent' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER order_legal_owner_guard BEFORE INSERT ON order_legal_documents
  FOR EACH ROW EXECUTE FUNCTION order_legal_owner_guard();--> statement-breakpoint
CREATE TRIGGER order_legal_documents_append_only BEFORE UPDATE OR DELETE ON order_legal_documents
  FOR EACH ROW EXECUTE FUNCTION append_only_table();--> statement-breakpoint
CREATE TRIGGER order_legal_documents_no_truncate BEFORE TRUNCATE ON order_legal_documents
  FOR EACH STATEMENT EXECUTE FUNCTION append_only_table();--> statement-breakpoint

-- A provider receipt is evidence, never a queued notice. Complete frozen documents must already exist.
CREATE FUNCTION order_legal_delivery_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id uuid; product_kind text;
BEGIN
  SELECT o.user_id, p.kind INTO owner_id, product_kind FROM orders o JOIN products p ON p.id = o.product_id
    WHERE o.id = NEW.order_id FOR UPDATE OF o;
  IF owner_id IS DISTINCT FROM NEW.user_id OR NEW.delivered_at > now() THEN
    RAISE EXCEPTION 'invalid legal document delivery' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM order_legal_documents WHERE order_id = NEW.order_id AND slug = 'on-bilgilendirme')
     OR NOT EXISTS (SELECT 1 FROM order_legal_documents WHERE order_id = NEW.order_id AND
       slug = CASE WHEN product_kind = 'abonelik' THEN 'abonelik' ELSE 'mesafeli-satis' END) THEN
    RAISE EXCEPTION 'incomplete frozen document set' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER order_legal_delivery_guard BEFORE INSERT ON order_legal_document_deliveries
  FOR EACH ROW EXECUTE FUNCTION order_legal_delivery_guard();--> statement-breakpoint
CREATE TRIGGER order_legal_deliveries_append_only BEFORE UPDATE OR DELETE ON order_legal_document_deliveries
  FOR EACH ROW EXECUTE FUNCTION append_only_table();--> statement-breakpoint
CREATE TRIGGER order_legal_deliveries_no_truncate BEFORE TRUNCATE ON order_legal_document_deliveries
  FOR EACH STATEMENT EXECUTE FUNCTION append_only_table();--> statement-breakpoint
REVOKE ALL ON order_legal_documents, order_legal_document_deliveries FROM PUBLIC;
