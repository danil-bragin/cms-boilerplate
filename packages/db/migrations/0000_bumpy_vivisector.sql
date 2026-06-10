CREATE TYPE "public"."media_status" AS ENUM('uploading', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."version_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"s3_key" text NOT NULL,
	"mime" text DEFAULT '' NOT NULL,
	"size" bigint DEFAULT 0 NOT NULL,
	"width" integer,
	"height" integer,
	"blurhash" text,
	"blur_data_url" text,
	"alt" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "media_status" DEFAULT 'uploading' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_s3_key_unique" UNIQUE("s3_key")
);
--> statement-breakpoint
CREATE TABLE "page_locales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"slug_override" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_locale_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"puck_data" jsonb NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"status" "version_status" DEFAULT 'draft' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"path" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "published_pages" (
	"site_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"path" text NOT NULL,
	"page_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"puck_data" jsonb NOT NULL,
	"seo" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"domains" text[] DEFAULT '{}' NOT NULL,
	"default_locale" text NOT NULL,
	"locales" text[] NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sites_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_locales" ADD CONSTRAINT "page_locales_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_versions" ADD CONSTRAINT "page_versions_page_locale_id_page_locales_id_fk" FOREIGN KEY ("page_locale_id") REFERENCES "public"."page_locales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_versions" ADD CONSTRAINT "page_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "published_pages" ADD CONSTRAINT "published_pages_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "published_pages" ADD CONSTRAINT "published_pages_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "published_pages" ADD CONSTRAINT "published_pages_version_id_page_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."page_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "page_locales_page_locale_uq" ON "page_locales" USING btree ("page_id","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "page_versions_locale_no_uq" ON "page_versions" USING btree ("page_locale_id","version_no");--> statement-breakpoint
CREATE INDEX "page_versions_locale_idx" ON "page_versions" USING btree ("page_locale_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pages_site_path_uq" ON "pages" USING btree ("site_id","path");--> statement-breakpoint
CREATE UNIQUE INDEX "published_pages_uq" ON "published_pages" USING btree ("site_id","locale","path");--> statement-breakpoint
CREATE INDEX "published_pages_page_idx" ON "published_pages" USING btree ("page_id");