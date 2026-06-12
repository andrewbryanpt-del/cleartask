-- Milestone 3 (Time): recurrence assignees + scope, overdue sweep marker.
-- Hand-written (no local Postgres for `migrate dev`); apply with
-- `prisma migrate deploy`.

-- AlterTable
ALTER TABLE "TaskAssignment" ADD COLUMN "overdueNotifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "RecurrenceRule" ADD COLUMN "locationId" TEXT,
ADD COLUMN "departmentId" TEXT,
ADD COLUMN "assigneeMembershipIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "assigneeDepartmentIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AddForeignKey
ALTER TABLE "RecurrenceRule" ADD CONSTRAINT "RecurrenceRule_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurrenceRule" ADD CONSTRAINT "RecurrenceRule_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
