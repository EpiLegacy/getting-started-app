ALTER TABLE `todo_items` MODIFY COLUMN `id` varchar(36) NOT NULL;--> statement-breakpoint
ALTER TABLE `todo_items` ADD `status` varchar(20) DEFAULT 'todo' NOT NULL;