CREATE TABLE "refund_request_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"original_paid_kurus" integer NOT NULL,
	"original_credits" integer NOT NULL,
	"unused_credits" integer NOT NULL,
	"approved_amount_kurus" integer NOT NULL,
	"hold_operation_id" text NOT NULL,
	"provider_refund_ref" text NOT NULL,
	"state" text DEFAULT 'hazir' NOT NULL,
	"provider_result_ref" text,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"resolution_reason" text,
	"updated_by" uuid NOT NULL,
	"state_reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refund_request_items_hold_operation_id_unique" UNIQUE("hold_operation_id"),
	CONSTRAINT "refund_request_items_provider_refund_ref_unique" UNIQUE("provider_refund_ref"),
	CONSTRAINT "refund_request_items_positive" CHECK ("refund_request_items"."original_paid_kurus" > 0 and "refund_request_items"."original_credits" > 0 and "refund_request_items"."unused_credits" > 0 and "refund_request_items"."unused_credits" <= "refund_request_items"."original_credits" and "refund_request_items"."approved_amount_kurus" > 0),
	CONSTRAINT "refund_request_items_cap" CHECK ("refund_request_items"."approved_amount_kurus" <= "refund_request_items"."original_paid_kurus" and "refund_request_items"."approved_amount_kurus" <= ceil("refund_request_items"."original_paid_kurus"::numeric * "refund_request_items"."unused_credits" / "refund_request_items"."original_credits")),
	CONSTRAINT "refund_request_items_state" CHECK ("refund_request_items"."state" in ('hazir','bekliyor','basarili','basarisiz')),
	CONSTRAINT "refund_request_items_reference" CHECK ("refund_request_items"."provider_refund_ref" = 'silme:' || "refund_request_items"."id"::text and length(trim("refund_request_items"."hold_operation_id")) > 0),
	CONSTRAINT "refund_request_items_reason" CHECK (length(trim("refund_request_items"."state_reason")) between 10 and 2000),
	CONSTRAINT "refund_request_items_resolution" CHECK (("refund_request_items"."resolved_by" is null and "refund_request_items"."resolved_at" is null and "refund_request_items"."resolution_reason" is null) or ("refund_request_items"."resolved_by" is not null and "refund_request_items"."resolved_at" is not null and "refund_request_items"."resolution_reason" is not null and length(trim("refund_request_items"."resolution_reason")) between 10 and 2000))
);
--> statement-breakpoint
ALTER TABLE "refund_requests" ADD COLUMN "decision_reason" text;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD COLUMN "decision_key" text;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD COLUMN "decision_hash" text;--> statement-breakpoint
ALTER TABLE "refund_request_items" ADD CONSTRAINT "refund_request_items_request_id_refund_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."refund_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_request_items" ADD CONSTRAINT "refund_request_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_request_items" ADD CONSTRAINT "refund_request_items_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_request_items" ADD CONSTRAINT "refund_request_items_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "refund_request_items_order_uq" ON "refund_request_items" USING btree ("request_id","order_id");--> statement-breakpoint
CREATE INDEX "refund_request_items_state_idx" ON "refund_request_items" USING btree ("request_id","state");--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_decision" CHECK (("refund_requests"."decision_reason" is null and "refund_requests"."decision_key" is null and "refund_requests"."decision_hash" is null) or ("refund_requests"."decision_reason" is not null and "refund_requests"."decision_key" is not null and "refund_requests"."decision_hash" is not null and "refund_requests"."decided_by" is not null and "refund_requests"."decided_at" is not null and "refund_requests"."status" in ('onaylandi','reddedildi','tamamlandi') and length(trim("refund_requests"."decision_reason")) between 10 and 2000 and length("refund_requests"."decision_key") between 1 and 200 and "refund_requests"."decision_hash" ~ '^[0-9a-f]{64}$')) NOT VALID;
--> statement-breakpoint
CREATE FUNCTION refund_request_decision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.decision_reason IS NOT NULL THEN
      RAISE EXCEPTION 'create an undecided request before review' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.decision_reason IS NOT NULL THEN
      RAISE EXCEPTION 'refund decision is immutable' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.decision_reason IS NOT NULL THEN
    IF (to_jsonb(OLD) - 'status') IS DISTINCT FROM (to_jsonb(NEW) - 'status') THEN
      RAISE EXCEPTION 'refund decision is immutable' USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status = 'onaylandi' AND NEW.status = 'tamamlandi') THEN
      RAISE EXCEPTION 'invalid refund request transition' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.decision_reason IS NOT NULL THEN
    IF OLD.status <> 'bekliyor' OR OLD.reason IS NULL OR OLD.reason NOT LIKE 'hesap_silme:%' OR NEW.status NOT IN ('onaylandi','reddedildi') THEN
      RAISE EXCEPTION 'invalid deletion refund decision' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.decision_reason IS NOT NULL AND NEW.status = 'tamamlandi' AND
     (NOT EXISTS (SELECT 1 FROM refund_request_items WHERE request_id = NEW.id) OR
      EXISTS (SELECT 1 FROM refund_request_items WHERE request_id = NEW.id AND state <> 'basarili')) THEN
    RAISE EXCEPTION 'refund request still has unresolved items' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.decision_reason IS NOT NULL AND NEW.status = 'tamamlandi' AND NEW.amount_kurus IS DISTINCT FROM
      (SELECT sum(approved_amount_kurus) FROM refund_request_items WHERE request_id = NEW.id) THEN
    RAISE EXCEPTION 'refund request total does not match successful items' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER refund_request_decision_guard BEFORE INSERT OR UPDATE OR DELETE ON refund_requests
  FOR EACH ROW EXECUTE FUNCTION refund_request_decision_guard();--> statement-breakpoint
CREATE TRIGGER refund_requests_no_truncate BEFORE TRUNCATE ON refund_requests
  FOR EACH STATEMENT EXECUTE FUNCTION append_only_table();--> statement-breakpoint

CREATE FUNCTION refund_request_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE request_owner uuid; request_status text; decision_actor uuid; paid bigint; exposure bigint;
        allocated bigint; actual_credits integer; remaining integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'refund item allocation is immutable' USING ERRCODE = 'restrict_violation';
  END IF;
  SELECT user_id, status, decided_by INTO request_owner, request_status, decision_actor
    FROM refund_requests WHERE id = NEW.request_id AND decision_reason IS NOT NULL FOR UPDATE;
  IF request_status <> 'onaylandi' OR request_owner IS NULL THEN
    RAISE EXCEPTION 'refund request must be approved' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM 1 FROM orders WHERE id = NEW.order_id AND user_id = request_owner FOR UPDATE;
    IF NOT FOUND OR NEW.state <> 'hazir' OR NEW.updated_by <> decision_actor OR NEW.resolved_by IS NOT NULL OR NEW.provider_result_ref IS NOT NULL THEN
      RAISE EXCEPTION 'refund item ownership or initial state mismatch' USING ERRCODE = 'check_violation';
    END IF;
    SELECT l.original_credits, l.remaining_credits INTO actual_credits, remaining FROM credit_lots l
      JOIN wallets w ON w.id = l.wallet_id JOIN orders o ON o.id = NEW.order_id
      JOIN products p ON p.id = o.product_id
      WHERE w.user_id = request_owner AND l.source = 'paket' AND p.kind = 'paket'
        AND l.origin_ref = 'order:' || NEW.order_id::text;
    IF actual_credits IS DISTINCT FROM NEW.original_credits OR NEW.unused_credits IS DISTINCT FROM remaining THEN
      RAISE EXCEPTION 'refund item original credit evidence mismatch' USING ERRCODE = 'check_violation';
    END IF;
    SELECT coalesce(sum(amount_kurus),0) INTO paid FROM payments WHERE order_id = NEW.order_id
      AND provider = 'iyzico' AND kind = 'odeme' AND status = 'basarili';
    SELECT coalesce(sum(amount_kurus),0) INTO exposure FROM payments WHERE order_id = NEW.order_id
      AND provider = 'iyzico' AND kind = 'iade' AND status IN ('hazir','bekliyor','basarili');
    SELECT coalesce(sum(i.approved_amount_kurus),0) INTO allocated FROM refund_request_items i
      WHERE i.order_id = NEW.order_id AND NOT EXISTS (SELECT 1 FROM payments p
        WHERE p.provider = 'iyzico' AND p.kind = 'iade' AND p.refund_ref = i.provider_refund_ref
          AND p.status IN ('hazir','bekliyor','basarili'));
    IF NEW.original_paid_kurus <> paid OR NEW.approved_amount_kurus <> least(ceil(paid::numeric * NEW.unused_credits / NEW.original_credits), greatest(0, paid-exposure-allocated)) THEN
      RAISE EXCEPTION 'refund item does not match original refundable cap' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF (to_jsonb(OLD) - ARRAY['state','provider_result_ref','resolved_by','resolved_at','resolution_reason','updated_by','state_reason','updated_at'])
       IS DISTINCT FROM
       (to_jsonb(NEW) - ARRAY['state','provider_result_ref','resolved_by','resolved_at','resolution_reason','updated_by','state_reason','updated_at']) THEN
      RAISE EXCEPTION 'refund item allocation is immutable' USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.state = 'basarili' AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
      RAISE EXCEPTION 'successful refund item is terminal' USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.state IS DISTINCT FROM OLD.state AND NOT (
      (OLD.state IN ('hazir','basarisiz') AND NEW.state = 'bekliyor') OR
      (OLD.state = 'bekliyor' AND NEW.state IN ('basarili','basarisiz'))
    ) THEN
      RAISE EXCEPTION 'invalid refund item transition' USING ERRCODE = 'check_violation';
    END IF;
    IF ROW(NEW.resolved_by,NEW.resolved_at,NEW.resolution_reason) IS DISTINCT FROM
       ROW(OLD.resolved_by,OLD.resolved_at,OLD.resolution_reason) THEN
      IF NOT ((OLD.state = 'basarisiz' AND NEW.state = 'bekliyor' AND NEW.resolved_by IS NULL
               AND NEW.resolved_at IS NULL AND NEW.resolution_reason IS NULL) OR
              (OLD.state = 'bekliyor' AND NEW.state IN ('basarili','basarisiz') AND
               NEW.resolved_by = NEW.updated_by AND NEW.resolved_by IS NOT NULL AND
               NEW.resolved_at IS NOT NULL AND NEW.resolution_reason IS NOT NULL)) THEN
        RAISE EXCEPTION 'invalid manual refund resolution metadata' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    IF NEW.state = 'basarili' AND NOT EXISTS (SELECT 1 FROM payments WHERE order_id = NEW.order_id
      AND provider = 'iyzico' AND kind = 'iade' AND refund_ref = NEW.provider_refund_ref
      AND status = 'basarili' AND amount_kurus = NEW.approved_amount_kurus) THEN
      RAISE EXCEPTION 'successful refund payment evidence missing' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER refund_request_item_guard BEFORE INSERT OR UPDATE OR DELETE ON refund_request_items
  FOR EACH ROW EXECUTE FUNCTION refund_request_item_guard();--> statement-breakpoint
CREATE TRIGGER refund_request_items_no_truncate BEFORE TRUNCATE ON refund_request_items
  FOR EACH STATEMENT EXECUTE FUNCTION append_only_table();--> statement-breakpoint

CREATE FUNCTION refund_request_review_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'refund_requests' THEN
    IF OLD.decision_reason IS NULL AND NEW.decision_reason IS NOT NULL THEN
      INSERT INTO audit_log(actor_id,actor_hash,action,subject_type,subject_id,reason,diff)
      VALUES(NEW.decided_by,encode(sha256(convert_to(NEW.decided_by::text,'UTF8')),'hex'),
        'billing.deletion_refund.decision','refund_request',NEW.id::text,NEW.decision_reason,
        jsonb_build_object('status',NEW.status,'amountKurus',NEW.amount_kurus,'decisionHash',NEW.decision_hash));
    END IF;
  ELSE
    IF TG_OP = 'UPDATE' THEN
      IF to_jsonb(NEW) IS NOT DISTINCT FROM to_jsonb(OLD) THEN RETURN NULL; END IF;
    END IF;
    INSERT INTO audit_log(actor_id,actor_hash,action,subject_type,subject_id,reason,diff)
    VALUES(NEW.updated_by,encode(sha256(convert_to(NEW.updated_by::text,'UTF8')),'hex'),
      'billing.deletion_refund.item','refund_request_item',NEW.id::text,NEW.state_reason,
      jsonb_build_object('requestId',NEW.request_id,'orderId',NEW.order_id,'state',NEW.state,
        'amountKurus',NEW.approved_amount_kurus,'providerResultRef',NEW.provider_result_ref,
        'resolvedBy',NEW.resolved_by,'resolutionReason',NEW.resolution_reason));
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE TRIGGER refund_request_review_audit AFTER UPDATE ON refund_requests
  FOR EACH ROW EXECUTE FUNCTION refund_request_review_audit();--> statement-breakpoint
CREATE TRIGGER refund_request_item_audit AFTER INSERT OR UPDATE ON refund_request_items
  FOR EACH ROW EXECUTE FUNCTION refund_request_review_audit();
--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION append_only_table();
