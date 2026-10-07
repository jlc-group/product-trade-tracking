-- "รอผลิต": per-proposal production plan (lead days before launch), one item per (proposal, SKU) that passed a buyer, and
-- an append-only production log. Purely additive: existing tables only gain FKs pointing at them.

-- CreateEnum
CREATE TYPE "ProductionStatus" AS ENUM ('PENDING', 'IN_PRODUCTION', 'PRODUCED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProductionEventKind" AS ENUM ('QUANTITY', 'PLAN', 'CONFIRM', 'ADVANCE', 'BACK', 'DATES', 'CANCEL', 'RESTORE', 'KEEP');

-- CreateTable
CREATE TABLE "production_plans" (
    "proposal_id" UUID NOT NULL,
    "lead_days" INTEGER NOT NULL DEFAULT 14,
    "note" TEXT,
    "updated_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "production_plans_pkey" PRIMARY KEY ("proposal_id")
);

-- CreateTable
CREATE TABLE "production_items" (
    "id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER,
    "status" "ProductionStatus" NOT NULL DEFAULT 'PENDING',
    "confirmed_at" TIMESTAMPTZ(3),
    "confirmed_by_id" UUID,
    "started_on" DATE,
    "produced_on" DATE,
    "produced_by_id" UUID,
    "delivered_on" DATE,
    "delivered_by_id" UUID,
    "due_on" DATE,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by_id" UUID,
    "cancel_reason" TEXT,
    "kept_at" TIMESTAMPTZ(3),
    "kept_by_id" UUID,
    "ack_store_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "production_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_events" (
    "id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "item_id" UUID,
    "kind" "ProductionEventKind" NOT NULL,
    "actor_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "from_status" "ProductionStatus",
    "to_status" "ProductionStatus",
    "date" DATE,
    "quantity_before" INTEGER,
    "quantity_after" INTEGER,
    "lead_days_before" INTEGER,
    "lead_days_after" INTEGER,
    "reason" TEXT,
    "detail" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "production_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "production_items_product_id_idx" ON "production_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "production_items_proposal_id_product_id_key" ON "production_items"("proposal_id", "product_id");

-- CreateIndex
CREATE INDEX "production_events_proposal_id_recorded_at_idx" ON "production_events"("proposal_id", "recorded_at" DESC);

-- CreateIndex
CREATE INDEX "production_events_item_id_idx" ON "production_events"("item_id");

-- AddForeignKey
ALTER TABLE "production_plans" ADD CONSTRAINT "production_plans_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_plans" ADD CONSTRAINT "production_plans_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_items" ADD CONSTRAINT "production_items_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_items" ADD CONSTRAINT "production_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_items" ADD CONSTRAINT "production_items_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_items" ADD CONSTRAINT "production_items_produced_by_id_fkey" FOREIGN KEY ("produced_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_items" ADD CONSTRAINT "production_items_delivered_by_id_fkey" FOREIGN KEY ("delivered_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_items" ADD CONSTRAINT "production_items_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_items" ADD CONSTRAINT "production_items_kept_by_id_fkey" FOREIGN KEY ("kept_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_events" ADD CONSTRAINT "production_events_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_events" ADD CONSTRAINT "production_events_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "production_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_events" ADD CONSTRAINT "production_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A list column is never NULL (Prisma cannot express NOT NULL on lists).
ALTER TABLE "production_items" ALTER COLUMN "ack_store_ids" SET NOT NULL;

-- Checks Prisma cannot express.
ALTER TABLE "production_plans" ADD CONSTRAINT "production_plans_lead_days_check" CHECK ("lead_days" BETWEEN 0 AND 90);
ALTER TABLE "production_items" ADD CONSTRAINT "production_items_quantity_check" CHECK ("quantity" IS NULL OR "quantity" BETWEEN 1 AND 1000000);
-- Confirmed rows always carry a quantity; drafts (PENDING) and skips (CANCELLED, never confirmed) may not.
ALTER TABLE "production_items" ADD CONSTRAINT "production_items_quantity_required_check" CHECK (
  "status" = 'PENDING' OR "quantity" IS NOT NULL OR ("status" = 'CANCELLED' AND "confirmed_at" IS NULL));
ALTER TABLE "production_items" ADD CONSTRAINT "production_items_confirmed_check" CHECK (
  ("status" <> 'PENDING' OR "confirmed_at" IS NULL)
  AND ("status" NOT IN ('IN_PRODUCTION', 'PRODUCED', 'DELIVERED') OR "confirmed_at" IS NOT NULL)
  AND (("confirmed_at" IS NULL) = ("confirmed_by_id" IS NULL))
  AND (("confirmed_at" IS NULL) = ("started_on" IS NULL)));
ALTER TABLE "production_items" ADD CONSTRAINT "production_items_produced_check" CHECK (
  (("produced_on" IS NULL) = ("produced_by_id" IS NULL))
  AND ("status" NOT IN ('PRODUCED', 'DELIVERED') OR "produced_on" IS NOT NULL)
  AND ("status" NOT IN ('PENDING', 'IN_PRODUCTION') OR "produced_on" IS NULL));
ALTER TABLE "production_items" ADD CONSTRAINT "production_items_delivered_check" CHECK (
  (("delivered_on" IS NULL) = ("delivered_by_id" IS NULL)) AND (("status" = 'DELIVERED') = ("delivered_on" IS NOT NULL)));
ALTER TABLE "production_items" ADD CONSTRAINT "production_items_due_check" CHECK (("status" = 'DELIVERED') = ("due_on" IS NOT NULL));
ALTER TABLE "production_items" ADD CONSTRAINT "production_items_cancelled_check" CHECK (
  (("status" = 'CANCELLED') = ("cancelled_at" IS NOT NULL))
  AND (("cancelled_at" IS NULL) = ("cancelled_by_id" IS NULL))
  AND (("cancelled_at" IS NULL) = ("cancel_reason" IS NULL)));
ALTER TABLE "production_items" ADD CONSTRAINT "production_items_kept_check" CHECK (
  (("kept_at" IS NULL) = ("kept_by_id" IS NULL))
  AND ("status" <> 'PENDING' OR ("kept_at" IS NULL AND cardinality("ack_store_ids") = 0)));
-- started ≤ produced ≤ delivered; a later step needs the earlier one.
ALTER TABLE "production_items" ADD CONSTRAINT "production_items_dates_check" CHECK (
  ("produced_on" IS NULL OR ("started_on" IS NOT NULL AND "produced_on" >= "started_on"))
  AND ("delivered_on" IS NULL OR ("produced_on" IS NOT NULL AND "delivered_on" >= "produced_on")));
ALTER TABLE "production_events" ADD CONSTRAINT "production_events_item_check" CHECK (("item_id" IS NULL) = ("kind" = 'PLAN'));
ALTER TABLE "production_events" ADD CONSTRAINT "production_events_detail_object_check" CHECK (jsonb_typeof("detail") = 'object');
