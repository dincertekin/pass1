ALTER TABLE "sessions" ADD COLUMN "device_name" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "transport" text DEFAULT 'cookie' NOT NULL;