ALTER TABLE `todo_items` DROP FOREIGN KEY `todo_items_user_id_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `todo_items` ADD `project_id` char(36);--> statement-breakpoint
ALTER TABLE `todo_items` ADD CONSTRAINT `todo_items_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `todo_items` ADD CONSTRAINT `todo_items_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_todo_items_project` ON `todo_items` (`project_id`);--> statement-breakpoint
ALTER TABLE `projects` DROP COLUMN `items_todo_id`;