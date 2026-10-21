-- Contract v1.1 (ADR-0023): Wave 1 requests in docs/istekler. Additive only; no column or row is dropped.
-- Hand edits after drizzle-kit generate: (1) payments_provider_uq is dropped only after its partial
-- replacement payments_charge_uq exists, (2) takedown_requests.target_id is backfilled from record_id
-- before it becomes NOT NULL, (3) role rows are seeded at the end.
-- New enum values are not used inside this migration (ALTER TYPE ... ADD VALUE in a transaction).
CREATE TYPE "public"."kvkk_relation" AS ENUM('kullanici', 'eski_kullanici', 'karar_metninde_adi_gecen', 'diger');--> statement-breakpoint
CREATE TYPE "public"."kvkk_reply_channel" AS ENUM('eposta', 'posta');--> statement-breakpoint
CREATE TYPE "public"."kvkk_request_kind" AS ENUM('islenip_islenmedigi', 'bilgi', 'amac', 'aktarim_bilgisi', 'duzeltme', 'silme', 'ucuncu_kisilere_bildirim', 'itiraz', 'zarar_giderimi');--> statement-breakpoint
CREATE TYPE "public"."kvkk_request_status" AS ENUM('dogrulama_bekliyor', 'alindi', 'inceleniyor', 'kabul_edildi', 'reddedildi');--> statement-breakpoint
CREATE TYPE "public"."takedown_kind" AS ENUM('kisisel_veri', 'telif', 'guncellik');--> statement-breakpoint
CREATE TYPE "public"."takedown_target_type" AS ENUM('record', 'kampus_post', 'kampus_file');--> statement-breakpoint
ALTER TYPE "public"."consent_kind" ADD VALUE 'abonelik_sozlesmesi';--> statement-breakpoint
ALTER TYPE "public"."consent_kind" ADD VALUE 'yillik_taahhutname';--> statement-breakpoint
ALTER TYPE "public"."consent_kind" ADD VALUE 'yz_ucretsiz_katman';--> statement-breakpoint
ALTER TYPE "public"."review_queue_name" ADD VALUE 'kvkk-requests';--> statement-breakpoint
ALTER TYPE "public"."job_type" ADD VALUE 'account.purge';--> statement-breakpoint
CREATE TABLE "two_factors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"verified" boolean DEFAULT true NOT NULL,
	"failed_verification_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kvkk_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"requester_hash" text NOT NULL,
	"requester_name" text,
	"nationality" text,
	"identity_enc" text,
	"address" text,
	"contact_email" text NOT NULL,
	"phone" text,
	"relation" "kvkk_relation" DEFAULT 'kullanici' NOT NULL,
	"kind" "kvkk_request_kind" NOT NULL,
	"detail" text NOT NULL,
	"reply_channel" "kvkk_reply_channel" DEFAULT 'eposta' NOT NULL,
	"status" "kvkk_request_status" DEFAULT 'alindi' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone DEFAULT now() + interval '30 days' NOT NULL,
	"verified_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"decided_by" uuid,
	"response_summary" text,
	"decision_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupon_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coupon_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"ledger_transaction_id" uuid,
	"order_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupon_redemptions_target" CHECK ("coupon_redemptions"."ledger_transaction_id" is not null or "coupon_redemptions"."order_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"ref" text NOT NULL,
	"send_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"job_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "order_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "auth_method" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "two_factor_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "masked_text" text;--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "kampus"."files" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "kampus"."posts" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD COLUMN "wallet_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "checkout_token" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "provider_payment_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "subscription_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "kind" text DEFAULT 'odeme' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refund_ref" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "price_kurus" integer;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "last_payment_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "first_failure_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "failed_retries" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "failed_order_ref" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "pending_price_kurus" integer;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "pending_price_effective_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "takedown_requests" ADD COLUMN "kind" "takedown_kind" DEFAULT 'kisisel_veri' NOT NULL;--> statement-breakpoint
ALTER TABLE "takedown_requests" ADD COLUMN "target_type" "takedown_target_type" DEFAULT 'record' NOT NULL;--> statement-breakpoint
ALTER TABLE "takedown_requests" ADD COLUMN "target_id" uuid;--> statement-breakpoint
UPDATE "takedown_requests" SET "target_id" = "record_id" WHERE "target_id" IS NULL;--> statement-breakpoint
ALTER TABLE "takedown_requests" ALTER COLUMN "target_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "takedown_requests" ADD COLUMN "requester_name" text;--> statement-breakpoint
ALTER TABLE "takedown_requests" ADD COLUMN "rights_info" text;--> statement-breakpoint
ALTER TABLE "takedown_requests" ADD COLUMN "hide_due_at" timestamp with time zone DEFAULT now() + interval '72 hours' NOT NULL;--> statement-breakpoint
ALTER TABLE "takedown_requests" ADD COLUMN "due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "takedown_requests" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "takedown_requests" ADD COLUMN "decision" text;--> statement-breakpoint
ALTER TABLE "takedown_requests" ADD COLUMN "decision_reason" text;--> statement-breakpoint
ALTER TABLE "takedown_requests" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "two_factors" ADD CONSTRAINT "two_factors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kvkk_requests" ADD CONSTRAINT "kvkk_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kvkk_requests" ADD CONSTRAINT "kvkk_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_ledger_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("ledger_transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "two_factors_user_uq" ON "two_factors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "kvkk_requests_open_idx" ON "kvkk_requests" USING btree ("due_at") WHERE "kvkk_requests"."status" in ('dogrulama_bekliyor', 'alindi', 'inceleniyor');--> statement-breakpoint
CREATE INDEX "kvkk_requests_user_idx" ON "kvkk_requests" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_redemptions_uq" ON "coupon_redemptions" USING btree ("coupon_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notices_uq" ON "notices" USING btree ("user_id","kind","ref");--> statement-breakpoint
CREATE INDEX "notices_due_idx" ON "notices" USING btree ("send_at") WHERE "notices"."sent_at" is null;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_transactions_wallet_idx" ON "ledger_transactions" USING btree ("wallet_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_checkout_token_uq" ON "orders" USING btree ("checkout_token") WHERE "orders"."checkout_token" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_charge_uq" ON "payments" USING btree ("provider","provider_payment_id") WHERE "payments"."kind" = 'odeme';--> statement-breakpoint
DROP INDEX "payments_provider_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "payments_refund_uq" ON "payments" USING btree ("provider","refund_ref") WHERE "payments"."kind" = 'iade';--> statement-breakpoint
CREATE INDEX "payments_subscription_idx" ON "payments" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "takedown_requests_open_idx" ON "takedown_requests" USING btree ("hide_due_at") WHERE "takedown_requests"."status" <> 'sonuclandi';--> statement-breakpoint
CREATE INDEX "takedown_requests_target_idx" ON "takedown_requests" USING btree ("target_type","target_id");--> statement-breakpoint
ALTER TABLE "review_queue" ADD CONSTRAINT "review_queue_decision" CHECK ("review_queue"."decision" is null or "review_queue"."decision" in ('onay', 'ret', 'duzelt', 'superseded'));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_kind" CHECK ("payments"."kind" in ('odeme', 'iade'));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_refund_ref" CHECK (("payments"."kind" = 'iade') = ("payments"."refund_ref" is not null));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_owner" CHECK ("payments"."order_id" is not null or "payments"."subscription_id" is not null);--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_channel_env" CHECK (("push_subscriptions"."channel" = 'web_push' and "push_subscriptions"."environment" is null) or ("push_subscriptions"."channel" = 'apns' and "push_subscriptions"."environment" is not null and "push_subscriptions"."environment" in ('production', 'sandbox')));--> statement-breakpoint
ALTER TABLE "takedown_requests" ADD CONSTRAINT "takedown_requests_status" CHECK ("takedown_requests"."status" in ('bekliyor', 'gecici_gizlendi', 'sonuclandi'));--> statement-breakpoint
ALTER TABLE "takedown_requests" ADD CONSTRAINT "takedown_requests_decision" CHECK ("takedown_requests"."decision" is null or "takedown_requests"."decision" in ('kalici_kaldirma', 'ek_maskeleme', 'ret'));--> statement-breakpoint
ALTER TABLE "takedown_requests" ADD CONSTRAINT "takedown_requests_record_target" CHECK (("takedown_requests"."target_type" = 'record') = ("takedown_requests"."record_id" is not null) and ("takedown_requests"."record_id" is null or "takedown_requests"."record_id" = "takedown_requests"."target_id"));--> statement-breakpoint
-- Roles (plan 10.1, 10.9). misafir is implicit and never stored. Existing rows are left as they are.
INSERT INTO "roles" ("id", "description") VALUES
  ('kullanici', 'Kayıtlı kullanıcı'),
  ('ogrenci_dogrulanmis', 'edu.tr adresi doğrulanmış öğrenci'),
  ('plus', 'Ücretli plan'),
  ('akademisyen', 'Akademisyen planı'),
  ('editor', 'Hukukçu editör'),
  ('yonetici', 'Yönetim paneli')
ON CONFLICT ("id") DO NOTHING;
