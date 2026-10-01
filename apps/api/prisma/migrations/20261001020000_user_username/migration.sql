-- Optional username so people can sign in with a short name (e.g. "admin") as well as their email.
ALTER TABLE "users" ADD COLUMN "username" TEXT;
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
ALTER TABLE "users" ADD CONSTRAINT "users_username_lower_check" CHECK ("username" IS NULL OR "username" = lower("username"));
