-- Admin-managed department list; users.department must be one of these names.
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");
-- Names are unique ignoring case ("system ai" = "System AI").
CREATE UNIQUE INDEX "departments_name_ci_key" ON "departments"(lower("name"));
ALTER TABLE "departments" ADD CONSTRAINT "departments_name_not_blank_check" CHECK (btrim("name") <> '');

-- The company's departments (1 Oct 2026). Admins can add more from Admin › แผนก.
INSERT INTO "departments" ("id", "name", "sort_order", "updated_at") VALUES
    (gen_random_uuid(), 'Jlcall', 1, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'System AI', 2, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Purchase', 3, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'HR and Account', 4, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Branding & Marketing', 5, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'General', 6, CURRENT_TIMESTAMP);

-- Existing free-text values: adopt the canonical spelling when they match (ignoring case/spaces),
-- anything that is not a department is cleared so the foreign key can be added.
UPDATE "users" u SET "department" = d."name"
FROM "departments" d
WHERE u."department" IS NOT NULL AND lower(btrim(u."department")) = lower(d."name");
UPDATE "users" SET "department" = NULL
WHERE "department" IS NOT NULL AND "department" NOT IN (SELECT "name" FROM "departments");

ALTER TABLE "users" ADD CONSTRAINT "users_department_fkey" FOREIGN KEY ("department") REFERENCES "departments"("name") ON DELETE RESTRICT ON UPDATE CASCADE;
