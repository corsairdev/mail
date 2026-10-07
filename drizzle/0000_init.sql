CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_summaries" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"kind" text NOT NULL,
	"tone" text,
	"content" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demo_calendars" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"summary" text NOT NULL,
	"color" text NOT NULL,
	"time_zone" text NOT NULL,
	"primary" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demo_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"calendar_id" text NOT NULL,
	"summary" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"start" text NOT NULL,
	"end" text NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"time_zone" text NOT NULL,
	"attendees" jsonb NOT NULL,
	"recurrence" jsonb,
	"hangout_link" text,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"color_id" text
);
--> statement-breakpoint
CREATE TABLE "demo_labels" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"label_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"unread_threads" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demo_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"from_name" text NOT NULL,
	"from_email" text NOT NULL,
	"to_emails" jsonb NOT NULL,
	"cc_emails" jsonb NOT NULL,
	"subject" text NOT NULL,
	"snippet" text NOT NULL,
	"body_html" text NOT NULL,
	"label_ids" jsonb NOT NULL,
	"internal_date" timestamp with time zone NOT NULL,
	"attachments" jsonb NOT NULL,
	"message_id_header" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"mode" text NOT NULL,
	"thread_id" text,
	"to" jsonb NOT NULL,
	"cc" jsonb NOT NULL,
	"bcc" jsonb NOT NULL,
	"subject" text NOT NULL,
	"body_html" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"tenant_id" text NOT NULL,
	"plugin" text NOT NULL,
	"status" text NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"watch_expires_at" timestamp with time zone,
	"watch_resource" text,
	"last_error" text,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sync_state_tenant_id_plugin_pk" PRIMARY KEY("tenant_id","plugin")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"image" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"timezone" text NOT NULL,
	"block_remote_images" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"plugin" text NOT NULL,
	"event_type" text NOT NULL,
	"entity_id" text,
	"summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_summaries_thread_kind" ON "ai_summaries" USING btree ("tenant_id","thread_id","kind","tone");