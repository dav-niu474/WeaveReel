CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`view` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`prompt` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`created_at` integer NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	`context_json` text DEFAULT '{}' NOT NULL,
	`seed_base` integer,
	`results_json` text,
	`text_result` text,
	`error` text,
	`ref_mode` text,
	`simulated` integer DEFAULT 0 NOT NULL,
	`prompt_used` text,
	`cell_prompts_json` text,
	`shots_json` text
);
