-- Bell feed: someone else's logged movement fans out as an ACTIVITY notification (ADMIN / MANAGER: every movement;
-- assignees: movements on their tasks). ADD VALUE only appends to the enum, so existing rows are untouched.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ACTIVITY';
