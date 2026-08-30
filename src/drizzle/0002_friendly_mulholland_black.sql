CREATE TABLE `works` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`prompt` text DEFAULT '' NOT NULL,
	`kind` text DEFAULT 'image' NOT NULL,
	`published` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
