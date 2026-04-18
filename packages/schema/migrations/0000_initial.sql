CREATE TABLE `features` (
	`project_id` text NOT NULL,
	`tag` text NOT NULL,
	`source` text NOT NULL,
	PRIMARY KEY(`project_id`, `tag`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `font_meta` (
	`project_id` text PRIMARY KEY NOT NULL,
	`family_name` text NOT NULL,
	`style_name` text DEFAULT 'Regular' NOT NULL,
	`units_per_em` integer DEFAULT 1000 NOT NULL,
	`ascender` integer DEFAULT 800 NOT NULL,
	`descender` integer DEFAULT -200 NOT NULL,
	`cap_height` integer DEFAULT 700 NOT NULL,
	`x_height` integer DEFAULT 500 NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `glyphs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`advance_width` integer DEFAULT 500 NOT NULL,
	`unicode_codepoint` integer,
	`revision` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_glyphs_project_name` ON `glyphs` (`project_id`,`name`);--> statement-breakpoint
CREATE TABLE `kerning_pairs` (
	`project_id` text NOT NULL,
	`left_glyph` text NOT NULL,
	`right_glyph` text NOT NULL,
	`value` integer NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`project_id`, `left_glyph`, `right_glyph`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `layers` (
	`id` text PRIMARY KEY NOT NULL,
	`glyph_id` text NOT NULL,
	`master_id` text NOT NULL,
	`contours_json` text DEFAULT '[]' NOT NULL,
	`components_json` text DEFAULT '[]' NOT NULL,
	`anchors_json` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`glyph_id`) REFERENCES `glyphs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`master_id`) REFERENCES `masters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `masters` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`weight` integer DEFAULT 400 NOT NULL,
	`width` integer DEFAULT 100 NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `project_blobs` (
	`project_id` text NOT NULL,
	`key` text NOT NULL,
	`bytes` blob NOT NULL,
	PRIMARY KEY(`project_id`, `key`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text NOT NULL,
	`table_name` text NOT NULL,
	`row_key` text NOT NULL,
	`revision` integer NOT NULL,
	`op` text NOT NULL,
	`payload` text
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);