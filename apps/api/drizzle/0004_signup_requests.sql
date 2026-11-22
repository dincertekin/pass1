CREATE TABLE "signup_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"token_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signup_requests_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE INDEX "signup_requests_email_idx" ON "signup_requests" USING btree ("email","created_at");