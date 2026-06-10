CREATE TYPE "public"."page_kind" AS ENUM('page', 'post');--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "kind" "page_kind" DEFAULT 'page' NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "author" text;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "first_published_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "pages_kind_idx" ON "pages" USING btree ("site_id","kind");