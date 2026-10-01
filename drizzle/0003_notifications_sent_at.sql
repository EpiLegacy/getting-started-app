ALTER TABLE `notifications` ADD `sent_at` datetime(3);--> statement-breakpoint
CREATE INDEX `idx_notifications_unsent` ON `notifications` (`sent_at`,`created_at`);--> statement-breakpoint
-- Notifications created before the email relay existed are marked as sent, so
-- the first relay run does not mail the whole history at once.
UPDATE `notifications` SET `sent_at` = `created_at` WHERE `sent_at` IS NULL;
