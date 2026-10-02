-- A template item can start its task as a table: these labels become the task's label → value rows (values empty).
ALTER TABLE "task_template_items" ADD COLUMN "field_labels" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "task_template_items" ADD CONSTRAINT "task_template_items_field_labels_array_check" CHECK (jsonb_typeof("field_labels") = 'array');
