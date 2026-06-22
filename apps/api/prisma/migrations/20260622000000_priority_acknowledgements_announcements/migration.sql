-- Task priority levels
CREATE TYPE "TaskPriority" AS ENUM ('URGENT', 'HIGH', 'NORMAL', 'LOW');

ALTER TABLE "Task" ADD COLUMN "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL';

CREATE INDEX "Task_organizationId_priority_idx" ON "Task"("organizationId", "priority");

-- Explicit acknowledgement receipts on attachment views
ALTER TABLE "AttachmentView" ADD COLUMN "acknowledgedAt" TIMESTAMP(3);

-- Announcements noticeboard
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdByMembershipId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnnouncementRead" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementRead_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Announcement_organizationId_createdAt_idx" ON "Announcement"("organizationId", "createdAt");

CREATE UNIQUE INDEX "AnnouncementRead_announcementId_membershipId_key" ON "AnnouncementRead"("announcementId", "membershipId");

ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
