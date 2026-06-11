CREATE INDEX "pages_author_idx" ON "pages" USING btree ("author_id");--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE set null ON UPDATE no action;
