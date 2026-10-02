-- Migration 0004 gave every task the default status 'todo', and until now
-- moving a card only changed `status`. The application now derives
-- `completed` from `status`; this aligns the rows written before that.
-- Tasks completed before the Kanban board existed go to its Completed column.
UPDATE `todo_items` SET `status` = 'completed' WHERE `completed` = 1 AND `status` = 'todo';--> statement-breakpoint
-- Every other row follows its column: a card moved to Completed becomes
-- completed, one moved out of it does not. NULL legacy values stay NULL
-- unless their card was moved to Completed.
UPDATE `todo_items` SET `completed` = (`status` = 'completed')
WHERE `completed` <> (`status` = 'completed') OR (`completed` IS NULL AND `status` = 'completed');
