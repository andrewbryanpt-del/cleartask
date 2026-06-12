-- Onboarding wizard: business contact fields + completion marker.
-- Existing organizations are backfilled as onboarded so current owners
-- aren't bounced into the wizard.

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "address" TEXT,
ADD COLUMN "phone" TEXT,
ADD COLUMN "website" TEXT,
ADD COLUMN "onboardedAt" TIMESTAMP(3);

-- Backfill
UPDATE "Organization" SET "onboardedAt" = CURRENT_TIMESTAMP;
