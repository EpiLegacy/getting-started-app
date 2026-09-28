CREATE TABLE `projects` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `todo_items` ADD `project_id` char(36);--> statement-breakpoint
ALTER TABLE `projects` ADD CONSTRAINT `projects_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_projects_user` ON `projects` (`user_id`);--> statement-breakpoint
ALTER TABLE `todo_items` ADD CONSTRAINT `todo_items_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_todo_items_project` ON `todo_items` (`project_id`,`task_key`);