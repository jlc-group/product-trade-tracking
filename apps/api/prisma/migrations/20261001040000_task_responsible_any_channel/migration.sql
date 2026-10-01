-- Responsible department on every task (copied from the template, editable per task).
ALTER TABLE "tasks" ADD COLUMN "responsible" TEXT;
-- A template may apply to every channel (offline and online): channel NULL.
ALTER TABLE "task_templates" ALTER COLUMN "channel" DROP NOT NULL;
-- An "every channel" template cannot be tied to a channel-specific shelf type.
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_any_channel_check" CHECK ("channel" IS NOT NULL OR "shelf_type_id" IS NULL);
