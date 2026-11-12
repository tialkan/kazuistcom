CREATE TABLE "work_citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_record_id" uuid NOT NULL,
	"work_id" uuid NOT NULL,
	"pages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" real NOT NULL,
	"confirmed" boolean DEFAULT false NOT NULL,
	"rejected" boolean DEFAULT false NOT NULL,
	"extractor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"job_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"target_hash" text NOT NULL,
	"delivered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_deliveries_job_id_channel_target_hash_pk" PRIMARY KEY("job_id","channel","target_hash"),
	CONSTRAINT "notification_deliveries_channel" CHECK ("notification_deliveries"."channel" in ('email', 'web_push', 'apns')),
	CONSTRAINT "notification_deliveries_target" CHECK (("notification_deliveries"."channel" = 'email' and "notification_deliveries"."target_hash" = 'email') or ("notification_deliveries"."channel" <> 'email' and "notification_deliveries"."target_hash" ~ '^[0-9a-f]{64}$'))
);
--> statement-breakpoint
ALTER TABLE "citation_edges" ADD COLUMN "rejected" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "works" ADD COLUMN "work_key" text;--> statement-breakpoint
ALTER TABLE "work_citations" ADD CONSTRAINT "work_citations_from_record_id_records_id_fk" FOREIGN KEY ("from_record_id") REFERENCES "public"."records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_citations" ADD CONSTRAINT "work_citations_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "work_citations_uq" ON "work_citations" USING btree ("from_record_id","work_id");--> statement-breakpoint
CREATE INDEX "work_citations_work_idx" ON "work_citations" USING btree ("work_id");--> statement-breakpoint
CREATE INDEX "records_esas_key_idx" ON "records" USING btree (replace("esas_no", ' ', ''));--> statement-breakpoint
CREATE INDEX "records_karar_key_idx" ON "records" USING btree (replace("karar_no", ' ', ''));--> statement-breakpoint
CREATE INDEX "sources_raw_record_idx" ON "sources_raw" USING btree ("record_id");--> statement-breakpoint
CREATE INDEX "jobs_dedupe_idx" ON "jobs" USING btree ("type","dedupe_key") WHERE "jobs"."dedupe_key" is not null;--> statement-breakpoint
CREATE INDEX "jobs_finished_idx" ON "jobs" USING btree ("status","updated_at") WHERE "jobs"."status" in ('done', 'failed', 'dead');--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_work_key_unique" UNIQUE("work_key");--> statement-breakpoint
-- v1.5 (ADR-0035): before this migration an editor rejection was stored as confirmed = true and confidence = 0
-- (services/worker-py/citations/store.py). Those rows are marked rejected; confirmed and confidence stay as they were.
UPDATE "citation_edges" SET "rejected" = true WHERE "confirmed" AND "confidence" = 0;