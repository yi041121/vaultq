-- Administrators can issue a temporary password. The flag forces the account
-- to replace it immediately after signing in.
ALTER TABLE "users" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;
