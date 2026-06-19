-- Owner-configurable threshold: notify them when a task is this many days past
-- due and still incomplete. NULL means the feature is off for this org.
ALTER TABLE "Organization" ADD COLUMN "overdueEscalationDays" INTEGER;

-- Set by the escalation sweep so each assignment only escalates the owner once.
ALTER TABLE "TaskAssignment" ADD COLUMN "escalatedToOwnerAt" TIMESTAMP(3);
