DROP INDEX "published_pages_search_idx";--> statement-breakpoint
ALTER TABLE "published_pages" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', search_text)) STORED;--> statement-breakpoint
CREATE INDEX "pages_posts_sort_idx" ON "pages" USING btree ("site_id","kind","first_published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "published_pages_search_idx" ON "published_pages" USING gin ("search_vector");