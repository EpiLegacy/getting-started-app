CREATE TABLE `notifications` (
	`id` char(36) NOT NULL,
	`recipient_id` varchar(64) NOT NULL,
	`type` varchar(120) NOT NULL,
	`body` varchar(500) NOT NULL,
	`read_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `outbox_events` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`event_id` char(36) NOT NULL,
	`type` varchar(120) NOT NULL,
	`version` int unsigned NOT NULL,
	`aggregate_id` varchar(64) NOT NULL,
	`correlation_id` varchar(64) NOT NULL,
	`actor_id` varchar(64),
	`occurred_at` datetime(3) NOT NULL,
	`payload` json NOT NULL,
	`published_at` datetime(3),
	CONSTRAINT `outbox_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `event_id` UNIQUE(`event_id`)
);
--> statement-breakpoint
CREATE TABLE `processed_events` (
	`event_id` char(36) NOT NULL,
	`handler` varchar(120) NOT NULL,
	`processed_at` datetime(3) NOT NULL,
	CONSTRAINT `processed_events_event_id_handler_pk` PRIMARY KEY(`event_id`,`handler`)
);
--> statement-breakpoint
CREATE TABLE `todo_items` (
	`id` varchar(36),
	`name` varchar(255),
	`completed` boolean
);
--> statement-breakpoint
CREATE INDEX `idx_notifications_recipient` ON `notifications` (`recipient_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_outbox_unpublished` ON `outbox_events` (`published_at`,`id`);