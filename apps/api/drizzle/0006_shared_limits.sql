CREATE TABLE "login_failures" (
	"email_hash" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"since" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_counters" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"window_ends_at" timestamp with time zone NOT NULL
);
