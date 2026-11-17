CREATE TYPE "public"."fixture_status" AS ENUM('scheduled', 'live', 'finished', 'postponed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."pick_side" AS ENUM('home', 'away', 'draw');--> statement-breakpoint
CREATE TYPE "public"."round_state" AS ENUM('open', 'locked', 'scored');--> statement-breakpoint
CREATE TABLE "bid_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lot_id" uuid NOT NULL,
	"bidder_id" uuid,
	"amount" numeric(12, 2) NOT NULL,
	"is_proxy" boolean DEFAULT false NOT NULL,
	"outcome" text NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_key" text NOT NULL,
	"provider" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"season" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed_fetches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"endpoint" text NOT NULL,
	"status_code" integer,
	"payload_hash" text,
	"skipped" boolean DEFAULT false NOT NULL,
	"validation_error" text,
	"duration_ms" integer,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fixtures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"provider_key" text NOT NULL,
	"provider" text NOT NULL,
	"home_team" text NOT NULL,
	"away_team" text NOT NULL,
	"venue" text,
	"kickoff" timestamp with time zone NOT NULL,
	"status" "fixture_status" DEFAULT 'scheduled' NOT NULL,
	"home_score" integer,
	"away_score" integer,
	"payload_hash" text,
	"fetched_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "league_members" (
	"league_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leagues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"competition_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"invite_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "predictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"fixture_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"pick" "pick_side" NOT NULL,
	"locked_at" timestamp with time zone,
	"points_awarded" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lot_id" uuid NOT NULL,
	"category" text NOT NULL,
	"hammer_price" numeric(12, 2) NOT NULL,
	"bid_count" integer NOT NULL,
	"sold_on" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"name" text NOT NULL,
	"locks_at" timestamp with time zone NOT NULL,
	"state" "round_state" DEFAULT 'open' NOT NULL,
	"scored_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "standings" (
	"league_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"correct_picks" integer DEFAULT 0 NOT NULL,
	"played_rounds" integer DEFAULT 0 NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"display_name" text NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standings" ADD CONSTRAINT "standings_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standings" ADD CONSTRAINT "standings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bid_snapshots_lot_idx" ON "bid_snapshots" USING btree ("lot_id","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "competitions_provider_idx" ON "competitions" USING btree ("provider","provider_key","season");--> statement-breakpoint
CREATE INDEX "feed_fetches_idx" ON "feed_fetches" USING btree ("provider","fetched_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fixtures_provider_idx" ON "fixtures" USING btree ("provider","provider_key");--> statement-breakpoint
CREATE INDEX "fixtures_round_idx" ON "fixtures" USING btree ("round_id","kickoff");--> statement-breakpoint
CREATE UNIQUE INDEX "league_members_idx" ON "league_members" USING btree ("league_id","user_id");--> statement-breakpoint
CREATE INDEX "otp_phone_idx" ON "otp_challenges" USING btree ("phone","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "predictions_user_fixture_idx" ON "predictions" USING btree ("user_id","fixture_id");--> statement-breakpoint
CREATE INDEX "predictions_round_idx" ON "predictions" USING btree ("round_id","user_id");--> statement-breakpoint
CREATE INDEX "price_history_category_idx" ON "price_history" USING btree ("category","sold_on");--> statement-breakpoint
CREATE UNIQUE INDEX "rounds_competition_number_idx" ON "rounds" USING btree ("competition_id","number");--> statement-breakpoint
CREATE INDEX "rounds_locks_at_idx" ON "rounds" USING btree ("locks_at");--> statement-breakpoint
CREATE UNIQUE INDEX "standings_idx" ON "standings" USING btree ("league_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_idx" ON "users" USING btree ("phone");