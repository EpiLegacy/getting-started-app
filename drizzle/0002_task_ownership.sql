-- Earlier releases added these two fields outside the migration journal.
-- Preserve databases that already have them, and complete fresh installs.
SET @ddl = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'todo_items' AND column_name = 'deadline'), 'SELECT 1', 'ALTER TABLE `todo_items` ADD `deadline` varchar(255)');--> statement-breakpoint
PREPARE task_migration FROM @ddl;--> statement-breakpoint
EXECUTE task_migration;--> statement-breakpoint
DEALLOCATE PREPARE task_migration;--> statement-breakpoint
SET @ddl = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'todo_items' AND column_name = 'priorisation'), 'SELECT 1', 'ALTER TABLE `todo_items` ADD `priorisation` varchar(255)');--> statement-breakpoint
PREPARE task_migration FROM @ddl;--> statement-breakpoint
EXECUTE task_migration;--> statement-breakpoint
DEALLOCATE PREPARE task_migration;--> statement-breakpoint
-- Add the key and its index together: AUTO_INCREMENT requires an index.
-- Every physical row gets a key; legacy ids and all task data are untouched.
ALTER TABLE `todo_items`
    ADD `task_key` int unsigned AUTO_INCREMENT NOT NULL PRIMARY KEY,
    ADD `user_id` char(36) DEFAULT NULL,
    ADD CONSTRAINT `todo_items_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action,
    ADD INDEX `idx_todo_items_user` (`user_id`,`task_key`);
