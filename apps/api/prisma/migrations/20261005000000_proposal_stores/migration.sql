-- A proposal can list at several stores with one shared task list: proposals.store_id → proposal_stores.

-- CreateTable
CREATE TABLE "proposal_stores" (
    "proposal_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,

    CONSTRAINT "proposal_stores_pkey" PRIMARY KEY ("proposal_id","store_id")
);

-- CreateIndex
CREATE INDEX "proposal_stores_store_id_idx" ON "proposal_stores"("store_id");

-- AddForeignKey
ALTER TABLE "proposal_stores" ADD CONSTRAINT "proposal_stores_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_stores" ADD CONSTRAINT "proposal_stores_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing proposals keep their one store.
INSERT INTO "proposal_stores" ("proposal_id", "store_id") SELECT "id", "store_id" FROM "proposals";

-- DropForeignKey
ALTER TABLE "proposals" DROP CONSTRAINT "proposals_store_id_fkey";

-- DropIndex
DROP INDEX "proposals_store_id_idx";

-- AlterTable
ALTER TABLE "proposals" DROP COLUMN "store_id";
