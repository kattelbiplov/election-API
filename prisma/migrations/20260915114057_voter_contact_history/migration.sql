-- CreateEnum
CREATE TYPE "ContactMethod" AS ENUM ('DOOR_KNOCK', 'PHONE_CALL', 'TEXT_MESSAGE', 'EMAIL', 'EVENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ContactOutcome" AS ENUM ('REACHED', 'NOT_REACHED', 'REFUSED', 'WRONG_CONTACT_INFO');

-- CreateTable
CREATE TABLE "voter_contacts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "voter_id" TEXT NOT NULL,
    "method" "ContactMethod" NOT NULL,
    "outcome" "ContactOutcome" NOT NULL,
    "support_level_observed" "VoterSupportLevel",
    "notes" TEXT,
    "contacted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contacted_by_id" TEXT NOT NULL,
    "canvassing_visit_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voter_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "voter_contacts_organization_id_idx" ON "voter_contacts"("organization_id");

-- CreateIndex
CREATE INDEX "voter_contacts_voter_id_idx" ON "voter_contacts"("voter_id");

-- CreateIndex
CREATE INDEX "voter_contacts_contacted_by_id_idx" ON "voter_contacts"("contacted_by_id");

-- CreateIndex
CREATE INDEX "voter_contacts_canvassing_visit_id_idx" ON "voter_contacts"("canvassing_visit_id");

-- AddForeignKey
ALTER TABLE "voter_contacts" ADD CONSTRAINT "voter_contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voter_contacts" ADD CONSTRAINT "voter_contacts_voter_id_fkey" FOREIGN KEY ("voter_id") REFERENCES "voters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voter_contacts" ADD CONSTRAINT "voter_contacts_contacted_by_id_fkey" FOREIGN KEY ("contacted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voter_contacts" ADD CONSTRAINT "voter_contacts_canvassing_visit_id_fkey" FOREIGN KEY ("canvassing_visit_id") REFERENCES "canvassing_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;
