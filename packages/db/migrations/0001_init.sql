CREATE SCHEMA "kampus";
--> statement-breakpoint
CREATE TYPE "public"."consent_kind" AS ENUM('aydinlatma', 'acik_riza_analitik', 'acik_riza_pazarlama', 'kullanim_kosullari', 'on_bilgilendirme', 'mesafeli_sozlesme', 'cayma_istisnasi', 'yz_aktarim');--> statement-breakpoint
CREATE TYPE "public"."authority_class" AS ENUM('baglayici_norm', 'baglayici_karar', 'yuksek_emsal', 'emsal', 'emsal_sinirli', 'idari_karar', 'doktrin', 'karsilastirmali');--> statement-breakpoint
CREATE TYPE "public"."citation_edge_kind" AS ENUM('atif', 'bozma', 'onama', 'ayni_yonde', 'aksi_yonde');--> statement-breakpoint
CREATE TYPE "public"."outcome" AS ENUM('bozma', 'onama', 'kabul', 'ret', 'ihlal', 'ihlal_yok');--> statement-breakpoint
CREATE TYPE "public"."protocol_status" AS ENUM('gerekmez', 'basvuruldu', 'imzalandi', 'reddedildi', 'canli_federasyon');--> statement-breakpoint
CREATE TYPE "public"."record_status" AS ENUM('yururlukte', 'degisti', 'yururlukten_kalkti', 'bozuldu', 'onandi', 'kesinlesti', 'bilinmiyor');--> statement-breakpoint
CREATE TYPE "public"."record_type" AS ENUM('mevzuat', 'karar', 'kurul_karari', 'makale', 'kitap', 'tez', 'ab_hukuku');--> statement-breakpoint
CREATE TYPE "public"."review_queue_name" AS ENUM('anonymization', 'citations', 'cards', 'journal-rules', 'takedowns', 'kampus-reports');--> statement-breakpoint
CREATE TYPE "kampus"."post_kind" AS ENUM('makale', 'tez', 'bildiri', 'poster', 'not');--> statement-breakpoint
CREATE TYPE "kampus"."request_status" AS ENUM('bekliyor', 'kabul', 'ret');--> statement-breakpoint
CREATE TYPE "public"."entry_side" AS ENUM('borc', 'alacak');--> statement-breakpoint
CREATE TYPE "public"."ledger_account_kind" AS ENUM('kullanici_cuzdani', 'ertelenmis_gelir', 'promosyon_havuzu', 'tuketim', 'iade', 'rezervasyon');--> statement-breakpoint
CREATE TYPE "public"."lot_source" AS ENUM('promosyon', 'abonelik', 'paket', 'iap');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('acik', 'tuketildi', 'cozuldu');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'done', 'failed', 'dead');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('ingest.fetch', 'ingest.parse', 'anon.run', 'embed.chunks', 'citations.extract', 'rules.extract', 'docx.validate', 'kampus.summarize', 'kampus.poster', 'billing.monthly_grant', 'billing.reconcile', 'notify.send', 'kalemcik.daily', 'mevzuat.rg_daily', 'live.fetch');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "edu_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passkeys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL,
	"device_type" text,
	"backed_up" boolean DEFAULT false NOT NULL,
	"transports" text,
	"aaguid" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "passkeys_credential_id_unique" UNIQUE("credential_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" text NOT NULL,
	"granted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"name" text,
	"image" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_hash" text,
	"action" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text,
	"reason" text,
	"diff" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"user_hash" text NOT NULL,
	"kind" "consent_kind" NOT NULL,
	"version" text NOT NULL,
	"granted" boolean NOT NULL,
	"context" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"target_profession" text,
	"avatar" text,
	"tone" text,
	"plan" text DEFAULT 'ucretsiz' NOT NULL,
	"edu_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anonymization_spans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" uuid NOT NULL,
	"policy_version" text NOT NULL,
	"entity" text NOT NULL,
	"mask" text NOT NULL,
	"char_start" integer NOT NULL,
	"char_end" integer NOT NULL,
	"detector" text NOT NULL,
	"score" real,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"section" text,
	"text" text NOT NULL,
	"tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('turkish', "text")) STORED,
	"embedding" halfvec(1024),
	"embedding_model" text,
	"char_start" integer NOT NULL,
	"char_end" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "citation_edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_record_id" uuid NOT NULL,
	"to_record_id" uuid,
	"to_raw" text NOT NULL,
	"kind" "citation_edge_kind" DEFAULT 'atif' NOT NULL,
	"confidence" real NOT NULL,
	"confirmed" boolean DEFAULT false NOT NULL,
	"extractor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"query_hash" text NOT NULL,
	"results" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "norm_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_norm" text NOT NULL,
	"to_norm" text NOT NULL,
	"relation" text NOT NULL,
	"note" text,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "norm_refs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" uuid NOT NULL,
	"kanun_no" text NOT NULL,
	"madde" text NOT NULL,
	"fikra" text,
	"bent" text,
	"target_record_id" uuid,
	"char_start" integer,
	"char_end" integer
);
--> statement-breakpoint
CREATE TABLE "record_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" uuid NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"amended_by" text,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "record_type" NOT NULL,
	"title" text NOT NULL,
	"court" text,
	"chamber" text,
	"esas_no" text,
	"karar_no" text,
	"decision_date" date,
	"authority_class" "authority_class" NOT NULL,
	"authority_confirmed" boolean DEFAULT false NOT NULL,
	"jurisdiction" text DEFAULT 'TR' NOT NULL,
	"norm_refs" jsonb,
	"status" "record_status" DEFAULT 'bilinmiyor' NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"amended_by" text,
	"license_basis" text NOT NULL,
	"protocol_status" "protocol_status" DEFAULT 'gerekmez' NOT NULL,
	"live_only" boolean DEFAULT false NOT NULL,
	"outcome" "outcome",
	"anonymized" boolean DEFAULT false NOT NULL,
	"anonymization_version" text,
	"source_url" text NOT NULL,
	"source_key" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"text" text NOT NULL,
	"title_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('turkish', coalesce("title", ''))) STORED,
	"openalex_cited_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"queue" "review_queue_name" NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"decision" text,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources_raw" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"url" text NOT NULL,
	"object_key" text NOT NULL,
	"sha256" text NOT NULL,
	"content_type" text,
	"fetched_at" timestamp with time zone NOT NULL,
	"record_id" uuid
);
--> statement-breakpoint
CREATE TABLE "works" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" uuid,
	"openalex_id" text,
	"doi" text,
	"title" text NOT NULL,
	"authors" jsonb,
	"year" integer,
	"venue" text,
	"csl" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "works_openalex_id_unique" UNIQUE("openalex_id"),
	CONSTRAINT "works_doi_unique" UNIQUE("doi")
);
--> statement-breakpoint
CREATE TABLE "guide_progress" (
	"user_id" uuid NOT NULL,
	"guide_id" text NOT NULL,
	"completed_steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guide_progress_user_id_guide_id_pk" PRIMARY KEY("user_id","guide_id")
);
--> statement-breakpoint
CREATE TABLE "library_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"record_id" uuid NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "institution_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_rule_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journal_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"rules" jsonb NOT NULL,
	"source_url" text,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"issn" text,
	"eissn" text,
	"publisher" text,
	"url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"kind" text NOT NULL,
	"cron" text,
	"next_at" timestamp with time zone,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_rule_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_rule_id" uuid NOT NULL,
	"rule_key" text NOT NULL,
	"excerpt" text NOT NULL,
	"page" integer
);
--> statement-breakpoint
CREATE TABLE "template_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"institution_id" uuid,
	"source_object_key" text,
	"rules" jsonb NOT NULL,
	"model" text,
	"approved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "writing_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"words" integer NOT NULL,
	"source" text DEFAULT 'manuel' NOT NULL,
	"note" text,
	"logged_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "writing_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"target_words" integer DEFAULT 0 NOT NULL,
	"current_words" integer DEFAULT 0 NOT NULL,
	"deadline" date,
	"template_rule_id" uuid,
	"journal_rule_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"due" timestamp with time zone NOT NULL,
	"stability" real NOT NULL,
	"difficulty" real NOT NULL,
	"elapsed_days" integer DEFAULT 0 NOT NULL,
	"scheduled_days" integer DEFAULT 0 NOT NULL,
	"reps" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"state" integer DEFAULT 0 NOT NULL,
	"last_review" timestamp with time zone,
	"last_rating" integer
);
--> statement-breakpoint
CREATE TABLE "card_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"front" text NOT NULL,
	"back" text,
	"choices" jsonb,
	"answer" text,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deck_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"source_record_id" uuid,
	"approved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"subject" text,
	"hmgs" boolean DEFAULT false NOT NULL,
	"owner_id" uuid,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decks_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "exam_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"answers" jsonb NOT NULL,
	"score" real NOT NULL,
	"by_subject" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"card_ids" jsonb NOT NULL,
	"duration_minutes" integer NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kampus"."files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"scan_status" text DEFAULT 'bekliyor' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kampus"."follows" (
	"follower_id" uuid NOT NULL,
	"followee_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_follower_id_followee_id_pk" PRIMARY KEY("follower_id","followee_id")
);
--> statement-breakpoint
CREATE TABLE "kampus"."fulltext_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"requester_id" uuid NOT NULL,
	"message" text,
	"status" "kampus"."request_status" DEFAULT 'bekliyor' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kampus"."posters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kampus"."posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"kind" "kampus"."post_kind" NOT NULL,
	"title" text NOT NULL,
	"abstract" text,
	"file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kampus"."profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"institution" text,
	"bio" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kampus"."reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kampus"."summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" uuid NOT NULL,
	"text" text NOT NULL,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"credits" integer,
	"percent_off" integer,
	"max_redemptions" integer,
	"redeemed" integer DEFAULT 0 NOT NULL,
	"valid_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "credit_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid NOT NULL,
	"source" "lot_source" NOT NULL,
	"original_credits" integer NOT NULL,
	"remaining_credits" integer NOT NULL,
	"expires_at" timestamp with time zone,
	"origin_ref" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_lots_promo_expiry" CHECK (("credit_lots"."source" = 'promosyon') = ("credit_lots"."expires_at" is not null)),
	CONSTRAINT "credit_lots_nonneg" CHECK ("credit_lots"."remaining_credits" >= 0 and "credit_lots"."remaining_credits" <= "credit_lots"."original_credits")
);
--> statement-breakpoint
CREATE TABLE "iap_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"transaction_id" text NOT NULL,
	"original_transaction_id" text NOT NULL,
	"product_id" text NOT NULL,
	"environment" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"signed_payload" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"operation" text NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid,
	"user_id" uuid NOT NULL,
	"number" text NOT NULL,
	"kind" text DEFAULT 'satis' NOT NULL,
	"total_kurus" integer NOT NULL,
	"provider_ref" text,
	"pdf_object_key" text,
	"issued_at" timestamp with time zone NOT NULL,
	CONSTRAINT "invoices_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "ledger_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "ledger_account_kind" NOT NULL,
	"wallet_id" uuid,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"side" "entry_side" NOT NULL,
	"credits" integer NOT NULL,
	"lot_id" uuid,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_positive" CHECK ("ledger_entries"."credits" > 0)
);
--> statement-breakpoint
CREATE TABLE "ledger_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"reverses_transaction_id" uuid,
	"memo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_transactions_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"coupon_id" uuid,
	"amount_kurus" integer NOT NULL,
	"status" text DEFAULT 'bekliyor' NOT NULL,
	"idempotency_key" text NOT NULL,
	"consent_versions" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_payment_id" text NOT NULL,
	"amount_kurus" integer NOT NULL,
	"status" text NOT NULL,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"operations" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_tables_version_unique" UNIQUE("version")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"kind" text NOT NULL,
	"price_table_id" uuid NOT NULL,
	"price_kurus" integer NOT NULL,
	"credits" integer,
	"monthly_credits" integer,
	"apple_product_id" text,
	"iyzico_plan_ref" text,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "products_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "refund_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"order_id" uuid,
	"subscription_id" uuid,
	"reason" text,
	"amount_kurus" integer,
	"status" text DEFAULT 'bekliyor' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid NOT NULL,
	"operation_id" text NOT NULL,
	"estimated_credits" integer NOT NULL,
	"actual_credits" integer,
	"status" "reservation_status" DEFAULT 'acik' NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '5 minutes' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"provider_ref" text NOT NULL,
	"status" text NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"canceled_at" timestamp with time zone,
	"grants_delivered" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"balance_snapshot" bigint DEFAULT 0 NOT NULL,
	"snapshot_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"signature_valid" boolean NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"suite" text NOT NULL,
	"git_commit" text,
	"metrics" jsonb NOT NULL,
	"passed" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"rollout_percent" integer DEFAULT 0 NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "job_type" NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_by" text,
	"locked_at" timestamp with time zone,
	"result" jsonb,
	"error" text,
	"dedupe_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_prefs" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"email" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"web_push" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"apns" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day" date NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"operation" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	"abstentions" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"endpoint" text NOT NULL,
	"keys" jsonb,
	"environment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "takedown_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" uuid,
	"reason" text NOT NULL,
	"contact_email" text NOT NULL,
	"status" text DEFAULT 'bekliyor' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edu_verifications" ADD CONSTRAINT "edu_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anonymization_spans" ADD CONSTRAINT "anonymization_spans_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anonymization_spans" ADD CONSTRAINT "anonymization_spans_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citation_edges" ADD CONSTRAINT "citation_edges_from_record_id_records_id_fk" FOREIGN KEY ("from_record_id") REFERENCES "public"."records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citation_edges" ADD CONSTRAINT "citation_edges_to_record_id_records_id_fk" FOREIGN KEY ("to_record_id") REFERENCES "public"."records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "norm_mappings" ADD CONSTRAINT "norm_mappings_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "norm_refs" ADD CONSTRAINT "norm_refs_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "norm_refs" ADD CONSTRAINT "norm_refs_target_record_id_records_id_fk" FOREIGN KEY ("target_record_id") REFERENCES "public"."records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_versions" ADD CONSTRAINT "record_versions_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_queue" ADD CONSTRAINT "review_queue_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources_raw" ADD CONSTRAINT "sources_raw_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_progress" ADD CONSTRAINT "guide_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_rule_versions" ADD CONSTRAINT "journal_rule_versions_journal_id_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."journals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_rule_versions" ADD CONSTRAINT "journal_rule_versions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_project_id_writing_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."writing_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_rule_evidence" ADD CONSTRAINT "template_rule_evidence_template_rule_id_template_rules_id_fk" FOREIGN KEY ("template_rule_id") REFERENCES "public"."template_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_rules" ADD CONSTRAINT "template_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_rules" ADD CONSTRAINT "template_rules_institution_id_institution_profiles_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institution_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_logs" ADD CONSTRAINT "writing_logs_project_id_writing_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."writing_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_projects" ADD CONSTRAINT "writing_projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_projects" ADD CONSTRAINT "writing_projects_template_rule_id_template_rules_id_fk" FOREIGN KEY ("template_rule_id") REFERENCES "public"."template_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_projects" ADD CONSTRAINT "writing_projects_journal_rule_version_id_journal_rule_versions_id_fk" FOREIGN KEY ("journal_rule_version_id") REFERENCES "public"."journal_rule_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_reviews" ADD CONSTRAINT "card_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_reviews" ADD CONSTRAINT "card_reviews_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_versions" ADD CONSTRAINT "card_versions_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_versions" ADD CONSTRAINT "card_versions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_source_record_id_records_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "public"."records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kampus"."files" ADD CONSTRAINT "files_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "kampus"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kampus"."follows" ADD CONSTRAINT "follows_follower_id_profiles_id_fk" FOREIGN KEY ("follower_id") REFERENCES "kampus"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kampus"."follows" ADD CONSTRAINT "follows_followee_id_profiles_id_fk" FOREIGN KEY ("followee_id") REFERENCES "kampus"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kampus"."fulltext_requests" ADD CONSTRAINT "fulltext_requests_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "kampus"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kampus"."fulltext_requests" ADD CONSTRAINT "fulltext_requests_requester_id_profiles_id_fk" FOREIGN KEY ("requester_id") REFERENCES "kampus"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kampus"."posters" ADD CONSTRAINT "posters_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "kampus"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kampus"."posts" ADD CONSTRAINT "posts_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "kampus"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kampus"."posts" ADD CONSTRAINT "posts_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "kampus"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kampus"."profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kampus"."reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kampus"."summaries" ADD CONSTRAINT "summaries_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "kampus"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_lots" ADD CONSTRAINT "credit_lots_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iap_transactions" ADD CONSTRAINT "iap_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_lot_id_credit_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."credit_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_tables" ADD CONSTRAINT "price_tables_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_price_table_id_price_tables_id_fk" FOREIGN KEY ("price_table_id") REFERENCES "public"."price_tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_prefs" ADD CONSTRAINT "notification_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "takedown_requests" ADD CONSTRAINT "takedown_requests_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "takedown_requests" ADD CONSTRAINT "takedown_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_uq" ON "accounts" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_uq" ON "sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "audit_log_subject_idx" ON "audit_log" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "consents_user_kind_idx" ON "consents" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "anonymization_spans_record_idx" ON "anonymization_spans" USING btree ("record_id","policy_version");--> statement-breakpoint
CREATE UNIQUE INDEX "chunks_record_seq_uq" ON "chunks" USING btree ("record_id","seq");--> statement-breakpoint
CREATE INDEX "chunks_tsv_idx" ON "chunks" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX "chunks_embedding_hnsw_idx" ON "chunks" USING hnsw ("embedding" halfvec_cosine_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "citation_edges_uq" ON "citation_edges" USING btree ("from_record_id","to_raw","kind");--> statement-breakpoint
CREATE INDEX "citation_edges_to_idx" ON "citation_edges" USING btree ("to_record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "live_cache_uq" ON "live_cache" USING btree ("source","query_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "norm_mappings_uq" ON "norm_mappings" USING btree ("from_norm","to_norm");--> statement-breakpoint
CREATE INDEX "norm_refs_lookup_idx" ON "norm_refs" USING btree ("kanun_no","madde");--> statement-breakpoint
CREATE UNIQUE INDEX "record_versions_uq" ON "record_versions" USING btree ("record_id","valid_from");--> statement-breakpoint
CREATE UNIQUE INDEX "records_source_key_uq" ON "records" USING btree ("source_key");--> statement-breakpoint
CREATE INDEX "records_court_date_idx" ON "records" USING btree ("court","decision_date");--> statement-breakpoint
CREATE INDEX "records_title_tsv_idx" ON "records" USING gin ("title_tsv");--> statement-breakpoint
CREATE INDEX "records_esas_trgm_idx" ON "records" USING gin ("esas_no" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "review_queue_open_idx" ON "review_queue" USING btree ("queue","priority") WHERE "review_queue"."decision" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "sources_raw_uq" ON "sources_raw" USING btree ("source","external_id","sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "library_items_uq" ON "library_items" USING btree ("user_id","record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_rule_versions_uq" ON "journal_rule_versions" USING btree ("journal_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "journals_issn_uq" ON "journals" USING btree ("issn");--> statement-breakpoint
CREATE INDEX "writing_projects_user_idx" ON "writing_projects" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "card_reviews_uq" ON "card_reviews" USING btree ("user_id","card_id");--> statement-breakpoint
CREATE INDEX "card_reviews_due_idx" ON "card_reviews" USING btree ("user_id","due");--> statement-breakpoint
CREATE UNIQUE INDEX "card_versions_uq" ON "card_versions" USING btree ("card_id","version");--> statement-breakpoint
CREATE INDEX "cards_deck_idx" ON "cards" USING btree ("deck_id");--> statement-breakpoint
CREATE INDEX "kampus_posts_profile_idx" ON "kampus"."posts" USING btree ("profile_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "kampus_profiles_user_uq" ON "kampus"."profiles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_lots_origin_uq" ON "credit_lots" USING btree ("origin_ref");--> statement-breakpoint
CREATE INDEX "credit_lots_consume_idx" ON "credit_lots" USING btree ("wallet_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "iap_transactions_uq" ON "iap_transactions" USING btree ("transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_uq" ON "idempotency_keys" USING btree ("user_id","operation","key");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_code_uq" ON "ledger_accounts" USING btree ("code");--> statement-breakpoint
CREATE INDEX "ledger_entries_tx_idx" ON "ledger_entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_account_idx" ON "ledger_entries" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_entries_lot_idx" ON "ledger_entries" USING btree ("lot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_idem_uq" ON "orders" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_uq" ON "payments" USING btree ("provider","provider_payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_op_uq" ON "reservations" USING btree ("operation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_provider_uq" ON "subscriptions" USING btree ("channel","provider_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_event_uq" ON "webhook_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE INDEX "jobs_ready_idx" ON "jobs" USING btree ("type","run_after") WHERE "jobs"."status" = 'queued';--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_dedupe_active_uq" ON "jobs" USING btree ("type","dedupe_key") WHERE "jobs"."dedupe_key" is not null and "jobs"."status" in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "provider_costs_day_idx" ON "provider_costs" USING btree ("day","provider","model","operation");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");