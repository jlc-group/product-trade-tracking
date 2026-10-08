-- "ใบสั่งผลิต": one production order per press of "ยืนยันเริ่มผลิต" (an admin-managed manufacturer, an optional document
-- number, a main contact and co-contacts), and the order each SKU confirmed by that press belongs to. Purely additive;
-- rows confirmed before this keep order_id NULL. The new enum values are in 20261008000100_production_order_enums.

-- CreateTable
CREATE TABLE "manufacturers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "manufacturers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_orders" (
    "id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "reference_no" TEXT,
    "manufacturer_id" UUID NOT NULL,
    "main_contact_id" UUID NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3) NOT NULL,
    "confirmed_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "production_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_order_contacts" (
    "order_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "added_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_order_contacts_pkey" PRIMARY KEY ("order_id","user_id")
);

-- AlterTable
ALTER TABLE "production_items" ADD COLUMN "order_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "production_orders_proposal_id_seq_key" ON "production_orders"("proposal_id", "seq");

-- CreateIndex
CREATE INDEX "production_orders_manufacturer_id_idx" ON "production_orders"("manufacturer_id");

-- CreateIndex
CREATE INDEX "production_orders_main_contact_id_idx" ON "production_orders"("main_contact_id");

-- CreateIndex
CREATE INDEX "production_order_contacts_user_id_idx" ON "production_order_contacts"("user_id");

-- CreateIndex
CREATE INDEX "production_items_order_id_idx" ON "production_items"("order_id");

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_manufacturer_id_fkey" FOREIGN KEY ("manufacturer_id") REFERENCES "manufacturers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_main_contact_id_fkey" FOREIGN KEY ("main_contact_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_order_contacts" ADD CONSTRAINT "production_order_contacts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_order_contacts" ADD CONSTRAINT "production_order_contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (NO ACTION is checked at statement end, so a proposal delete that cascades to both tables works)
ALTER TABLE "production_items" ADD CONSTRAINT "production_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "production_orders"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- Checks Prisma cannot express.
-- Manufacturer names are unique ignoring case ("abc co., ltd." = "ABC Co., Ltd.") and never blank.
CREATE UNIQUE INDEX "manufacturers_name_ci_key" ON "manufacturers"(lower("name"));
ALTER TABLE "manufacturers" ADD CONSTRAINT "manufacturers_name_not_blank_check" CHECK (btrim("name") <> '');
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_seq_check" CHECK ("seq" >= 1);
-- No document number is NULL, never ''.
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_reference_no_check" CHECK ("reference_no" IS NULL OR btrim("reference_no") <> '');
-- Only confirmed rows carry an order (rows confirmed before orders existed keep NULL).
ALTER TABLE "production_items" ADD CONSTRAINT "production_items_order_check" CHECK ("confirmed_at" IS NOT NULL OR "order_id" IS NULL);
