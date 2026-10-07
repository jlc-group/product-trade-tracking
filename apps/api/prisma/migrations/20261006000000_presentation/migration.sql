-- "นำเสนอ Buyer": presentation packages (bundled prep tasks), one track per store, and each track's append-only event history.

-- CreateEnum
CREATE TYPE "PresentationStage" AS ENUM ('AWAITING', 'IN_REVIEW', 'NEEDS_INFO', 'PASSED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "PresentationEventKind" AS ENUM ('CREATED', 'SCHEDULED', 'PRESENTED', 'NEEDS_INFO', 'INFO_SENT', 'PASSED', 'REJECTED', 'WITHDRAWN', 'REPITCH', 'REVERTED', 'EDITED');

-- CreateEnum
CREATE TYPE "RejectReason" AS ENUM ('PRICE', 'DUPLICATE', 'CATEGORY_FIT', 'SHELF_SPACE', 'DOCUMENTS', 'OTHER');

-- CreateTable
CREATE TABLE "presentation_packages" (
    "id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "note" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "presentation_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "presentation_package_tasks" (
    "id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "completed_at" TIMESTAMPTZ(3),
    "fields_filled" INTEGER NOT NULL DEFAULT 0,
    "fields_total" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "presentation_package_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "presentation_tracks" (
    "id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "store_name" TEXT NOT NULL,
    "store_short_name" TEXT NOT NULL,
    "store_color" TEXT NOT NULL,
    "stage" "PresentationStage" NOT NULL DEFAULT 'AWAITING',
    "round" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "presentation_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "presentation_events" (
    "id" UUID NOT NULL,
    "track_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "kind" "PresentationEventKind" NOT NULL,
    "actor_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date" DATE,
    "reject_reason" "RejectReason",
    "target_event_id" UUID,
    "payload" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "presentation_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "presentation_packages_proposal_id_seq_key" ON "presentation_packages"("proposal_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "presentation_package_tasks_package_id_task_id_key" ON "presentation_package_tasks"("package_id", "task_id");

-- CreateIndex
CREATE INDEX "presentation_tracks_package_id_idx" ON "presentation_tracks"("package_id");

-- CreateIndex
CREATE INDEX "presentation_tracks_store_id_idx" ON "presentation_tracks"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "presentation_tracks_proposal_id_store_id_key" ON "presentation_tracks"("proposal_id", "store_id");

-- CreateIndex
CREATE INDEX "presentation_events_target_event_id_idx" ON "presentation_events"("target_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "presentation_events_track_id_seq_key" ON "presentation_events"("track_id", "seq");

-- AddForeignKey
ALTER TABLE "presentation_packages" ADD CONSTRAINT "presentation_packages_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presentation_packages" ADD CONSTRAINT "presentation_packages_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presentation_package_tasks" ADD CONSTRAINT "presentation_package_tasks_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "presentation_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presentation_tracks" ADD CONSTRAINT "presentation_tracks_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presentation_tracks" ADD CONSTRAINT "presentation_tracks_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "presentation_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presentation_tracks" ADD CONSTRAINT "presentation_tracks_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presentation_events" ADD CONSTRAINT "presentation_events_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "presentation_tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presentation_events" ADD CONSTRAINT "presentation_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presentation_events" ADD CONSTRAINT "presentation_events_target_event_id_fkey" FOREIGN KEY ("target_event_id") REFERENCES "presentation_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Checks Prisma cannot express.
ALTER TABLE "presentation_packages" ADD CONSTRAINT "presentation_packages_seq_check" CHECK ("seq" >= 1);
ALTER TABLE "presentation_package_tasks" ADD CONSTRAINT "presentation_package_tasks_fields_check" CHECK ("fields_filled" BETWEEN 0 AND "fields_total");
ALTER TABLE "presentation_tracks" ADD CONSTRAINT "presentation_tracks_round_check" CHECK ("round" >= 1);
ALTER TABLE "presentation_events" ADD CONSTRAINT "presentation_events_seq_check" CHECK ("seq" >= 1);
ALTER TABLE "presentation_events" ADD CONSTRAINT "presentation_events_payload_object_check" CHECK (jsonb_typeof("payload") = 'object');
ALTER TABLE "presentation_events" ADD CONSTRAINT "presentation_events_date_check" CHECK (("date" IS NOT NULL) = ("kind" IN ('PRESENTED', 'NEEDS_INFO', 'INFO_SENT', 'PASSED', 'REJECTED', 'WITHDRAWN')));
ALTER TABLE "presentation_events" ADD CONSTRAINT "presentation_events_reject_reason_check" CHECK (("reject_reason" IS NOT NULL) = ("kind" = 'REJECTED'));
ALTER TABLE "presentation_events" ADD CONSTRAINT "presentation_events_target_check" CHECK (("target_event_id" IS NOT NULL) = ("kind" IN ('REVERTED', 'EDITED')));
ALTER TABLE "presentation_events" ADD CONSTRAINT "presentation_events_target_not_self_check" CHECK ("target_event_id" <> "id");
