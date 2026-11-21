CREATE TABLE "vault_deletions" (
	"user_id" text NOT NULL,
	"item_id" text NOT NULL,
	"change_version" integer NOT NULL,
	CONSTRAINT "vault_deletions_user_id_item_id_pk" PRIMARY KEY("user_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "vault_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Hand-edited: existing vaults need a version for every item before the column can be NOT NULL.
-- Each user's items get 1, 2, 3... in the order they last changed, and the user's
-- vault_version becomes their highest number, so the first sync after upgrading sees everything.
ALTER TABLE "vault_items" ADD COLUMN "change_version" integer;--> statement-breakpoint
UPDATE "vault_items" SET "change_version" = numbered.n FROM (
	SELECT "id", row_number() OVER (PARTITION BY "user_id" ORDER BY "updated_at", "id") AS n FROM "vault_items"
) AS numbered WHERE "vault_items"."id" = numbered."id";--> statement-breakpoint
UPDATE "users" SET "vault_version" = coalesce((SELECT max("change_version") FROM "vault_items" WHERE "vault_items"."user_id" = "users"."id"), 0);--> statement-breakpoint
ALTER TABLE "vault_items" ALTER COLUMN "change_version" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "vault_deletions" ADD CONSTRAINT "vault_deletions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vault_deletions_user_change_version_idx" ON "vault_deletions" USING btree ("user_id","change_version");--> statement-breakpoint
CREATE UNIQUE INDEX "vault_items_user_change_version_idx" ON "vault_items" USING btree ("user_id","change_version");