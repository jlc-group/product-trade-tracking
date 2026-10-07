-- "วันที่ต้องการสินค้า": the delivery due date picked when confirming production, per SKU. Purely additive: one nullable
-- column (null = the plan deadline, as for every row confirmed before this) and a CHECK that only confirmed rows carry it.

-- AlterTable
ALTER TABLE "production_items" ADD COLUMN "needed_on" DATE;

ALTER TABLE "production_items" ADD CONSTRAINT "production_items_needed_check" CHECK ("confirmed_at" IS NOT NULL OR "needed_on" IS NULL);
