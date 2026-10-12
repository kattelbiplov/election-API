-- CreateEnum
CREATE TYPE "FamilyRelationType" AS ENUM ('SPOUSE', 'PARENT_OF');

-- AlterTable
ALTER TABLE "households" ADD COLUMN     "head_of_household_id" TEXT;

-- CreateTable
CREATE TABLE "voter_relationships" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "voter_id" TEXT NOT NULL,
    "related_voter_id" TEXT NOT NULL,
    "type" "FamilyRelationType" NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voter_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "voter_relationships_voter_id_idx" ON "voter_relationships"("voter_id");

-- CreateIndex
CREATE INDEX "voter_relationships_related_voter_id_idx" ON "voter_relationships"("related_voter_id");

-- CreateIndex
CREATE UNIQUE INDEX "voter_relationships_voter_id_related_voter_id_type_key" ON "voter_relationships"("voter_id", "related_voter_id", "type");

-- AddForeignKey
ALTER TABLE "households" ADD CONSTRAINT "households_head_of_household_id_fkey" FOREIGN KEY ("head_of_household_id") REFERENCES "voters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voter_relationships" ADD CONSTRAINT "voter_relationships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voter_relationships" ADD CONSTRAINT "voter_relationships_voter_id_fkey" FOREIGN KEY ("voter_id") REFERENCES "voters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voter_relationships" ADD CONSTRAINT "voter_relationships_related_voter_id_fkey" FOREIGN KEY ("related_voter_id") REFERENCES "voters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
