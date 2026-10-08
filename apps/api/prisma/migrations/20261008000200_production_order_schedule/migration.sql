-- "ใบสั่งผลิต" schedule: the production start ("วันที่ดำเนินการ", also the startedOn of every SKU on the order) and the
-- estimated production time in days, picked at confirm; the expected arrival is start + days, never stored. Purely
-- additive: both are null only on orders confirmed before this, and are set together.

-- AlterTable
ALTER TABLE "production_orders" ADD COLUMN "started_on" DATE;
ALTER TABLE "production_orders" ADD COLUMN "production_days" INTEGER;

-- Checks Prisma cannot express.
-- A schedule is both fields or neither (orders confirmed before it existed).
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_schedule_check" CHECK (("started_on" IS NULL) = ("production_days" IS NULL));
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_days_check" CHECK ("production_days" IS NULL OR "production_days" BETWEEN 1 AND 365);
