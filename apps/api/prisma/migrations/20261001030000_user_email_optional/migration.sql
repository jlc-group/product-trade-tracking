-- Email becomes optional: people can be created with just a username.
-- Every user still needs at least one sign-in identifier.
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "users" ADD CONSTRAINT "users_sign_in_identifier_check" CHECK ("email" IS NOT NULL OR "username" IS NOT NULL);
