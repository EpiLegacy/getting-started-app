ALTER TABLE `projects` DROP FOREIGN KEY `projects_user_id_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `todo_items` DROP FOREIGN KEY `todo_items_project_id_projects_id_fk`;
--> statement-breakpoint
ALTER TABLE `todo_items` DROP FOREIGN KEY `todo_items_user_id_users_id_fk`;
--> statement-breakpoint
DROP INDEX `idx_todo_items_project` ON `todo_items`;--> statement-breakpoint
ALTER TABLE `projects` MODIFY COLUMN `user_id` char(36);--> statement-breakpoint
ALTER TABLE `projects` ADD `items_todo_id` json DEFAULT ('[]') NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD CONSTRAINT `projects_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `todo_items` ADD CONSTRAINT `todo_items_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `todo_items` DROP COLUMN `project_id`;