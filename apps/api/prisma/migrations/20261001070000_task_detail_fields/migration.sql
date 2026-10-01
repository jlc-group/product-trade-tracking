-- Task details can be free text (description) or a table of label → value rows (detail_fields).
CREATE TYPE "DescriptionFormat" AS ENUM ('TEXT', 'FIELDS');
ALTER TABLE "tasks" ADD COLUMN "description_format" "DescriptionFormat" NOT NULL DEFAULT 'TEXT';
ALTER TABLE "tasks" ADD COLUMN "detail_fields" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_detail_fields_array_check" CHECK (jsonb_typeof("detail_fields") = 'array');
