-- "ใบสั่งผลิต": the activity entity of the manufacturer list and the production log kind of an order edit. Separate from
-- 20261008000000_production_orders because a new enum value can't be used in the transaction that adds it.

-- AlterEnum
ALTER TYPE "EntityType" ADD VALUE 'MANUFACTURER';

-- AlterEnum
ALTER TYPE "ProductionEventKind" ADD VALUE 'ORDER';
