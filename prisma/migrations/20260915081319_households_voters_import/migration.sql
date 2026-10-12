-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "VoterStatus" AS ENUM ('ACTIVE', 'DECEASED', 'MOVED');

-- CreateEnum
CREATE TYPE "VoterSource" AS ENUM ('MANUAL', 'IMPORT');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportRowIssueType" AS ENUM ('VALIDATION_ERROR', 'DUPLICATE');

-- CreateTable
CREATE TABLE "households" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "ward_id" TEXT NOT NULL,
    "tole_id" TEXT,
    "address" TEXT NOT NULL,
    "landmark" TEXT,
    "center_lat" DOUBLE PRECISION,
    "center_lng" DOUBLE PRECISION,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "households_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voters" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "ward_id" TEXT NOT NULL,
    "tole_id" TEXT,
    "household_id" TEXT,
    "full_name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "date_of_birth" DATE NOT NULL,
    "gender" "Gender",
    "father_or_spouse_name" TEXT,
    "citizenship_number" TEXT,
    "voter_id_number" TEXT,
    "phone" TEXT,
    "occupation" TEXT,
    "address" TEXT,
    "status" "VoterStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" "VoterSource" NOT NULL DEFAULT 'MANUAL',
    "import_job_id" TEXT,
    "import_row_number" INTEGER,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "voters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voter_import_jobs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "ward_id" TEXT NOT NULL,
    "tole_id" TEXT,
    "file_name" TEXT NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'PROCESSING',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "imported_rows" INTEGER NOT NULL DEFAULT 0,
    "duplicate_rows" INTEGER NOT NULL DEFAULT 0,
    "error_rows" INTEGER NOT NULL DEFAULT 0,
    "uploaded_by_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "voter_import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voter_import_row_issues" (
    "id" TEXT NOT NULL,
    "import_job_id" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "issue_type" "ImportRowIssueType" NOT NULL,
    "message" TEXT NOT NULL,
    "raw_data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voter_import_row_issues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "households_organization_id_idx" ON "households"("organization_id");

-- CreateIndex
CREATE INDEX "households_ward_id_idx" ON "households"("ward_id");

-- CreateIndex
CREATE INDEX "households_tole_id_idx" ON "households"("tole_id");

-- CreateIndex
CREATE INDEX "voters_organization_id_idx" ON "voters"("organization_id");

-- CreateIndex
CREATE INDEX "voters_ward_id_idx" ON "voters"("ward_id");

-- CreateIndex
CREATE INDEX "voters_tole_id_idx" ON "voters"("tole_id");

-- CreateIndex
CREATE INDEX "voters_household_id_idx" ON "voters"("household_id");

-- CreateIndex
CREATE INDEX "voters_normalized_name_idx" ON "voters"("normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "voters_organization_id_ward_id_normalized_name_date_of_birt_key" ON "voters"("organization_id", "ward_id", "normalized_name", "date_of_birth");

-- CreateIndex
CREATE INDEX "voter_import_jobs_organization_id_idx" ON "voter_import_jobs"("organization_id");

-- CreateIndex
CREATE INDEX "voter_import_jobs_ward_id_idx" ON "voter_import_jobs"("ward_id");

-- CreateIndex
CREATE INDEX "voter_import_row_issues_import_job_id_idx" ON "voter_import_row_issues"("import_job_id");

-- AddForeignKey
ALTER TABLE "households" ADD CONSTRAINT "households_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "households" ADD CONSTRAINT "households_ward_id_fkey" FOREIGN KEY ("ward_id") REFERENCES "wards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "households" ADD CONSTRAINT "households_tole_id_fkey" FOREIGN KEY ("tole_id") REFERENCES "toles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voters" ADD CONSTRAINT "voters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voters" ADD CONSTRAINT "voters_ward_id_fkey" FOREIGN KEY ("ward_id") REFERENCES "wards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voters" ADD CONSTRAINT "voters_tole_id_fkey" FOREIGN KEY ("tole_id") REFERENCES "toles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voters" ADD CONSTRAINT "voters_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voters" ADD CONSTRAINT "voters_import_job_id_fkey" FOREIGN KEY ("import_job_id") REFERENCES "voter_import_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voter_import_jobs" ADD CONSTRAINT "voter_import_jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voter_import_jobs" ADD CONSTRAINT "voter_import_jobs_ward_id_fkey" FOREIGN KEY ("ward_id") REFERENCES "wards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voter_import_jobs" ADD CONSTRAINT "voter_import_jobs_tole_id_fkey" FOREIGN KEY ("tole_id") REFERENCES "toles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voter_import_jobs" ADD CONSTRAINT "voter_import_jobs_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voter_import_row_issues" ADD CONSTRAINT "voter_import_row_issues_import_job_id_fkey" FOREIGN KEY ("import_job_id") REFERENCES "voter_import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
