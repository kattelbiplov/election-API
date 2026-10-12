-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VisitOutcome" AS ENUM ('PENDING', 'VISITED', 'NOT_HOME', 'REFUSED', 'INVALID_ADDRESS');

-- CreateTable
CREATE TABLE "canvassing_tasks" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "ward_id" TEXT NOT NULL,
    "tole_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "due_date" DATE,
    "assigned_to_id" TEXT NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "canvassing_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canvassing_visits" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "outcome" "VisitOutcome" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "visited_at" TIMESTAMP(3),
    "visited_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canvassing_visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "canvassing_tasks_organization_id_idx" ON "canvassing_tasks"("organization_id");

-- CreateIndex
CREATE INDEX "canvassing_tasks_ward_id_idx" ON "canvassing_tasks"("ward_id");

-- CreateIndex
CREATE INDEX "canvassing_tasks_tole_id_idx" ON "canvassing_tasks"("tole_id");

-- CreateIndex
CREATE INDEX "canvassing_tasks_assigned_to_id_idx" ON "canvassing_tasks"("assigned_to_id");

-- CreateIndex
CREATE INDEX "canvassing_visits_task_id_idx" ON "canvassing_visits"("task_id");

-- CreateIndex
CREATE INDEX "canvassing_visits_household_id_idx" ON "canvassing_visits"("household_id");

-- CreateIndex
CREATE UNIQUE INDEX "canvassing_visits_task_id_household_id_key" ON "canvassing_visits"("task_id", "household_id");

-- AddForeignKey
ALTER TABLE "canvassing_tasks" ADD CONSTRAINT "canvassing_tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvassing_tasks" ADD CONSTRAINT "canvassing_tasks_ward_id_fkey" FOREIGN KEY ("ward_id") REFERENCES "wards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvassing_tasks" ADD CONSTRAINT "canvassing_tasks_tole_id_fkey" FOREIGN KEY ("tole_id") REFERENCES "toles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvassing_tasks" ADD CONSTRAINT "canvassing_tasks_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvassing_tasks" ADD CONSTRAINT "canvassing_tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvassing_visits" ADD CONSTRAINT "canvassing_visits_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "canvassing_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvassing_visits" ADD CONSTRAINT "canvassing_visits_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvassing_visits" ADD CONSTRAINT "canvassing_visits_visited_by_id_fkey" FOREIGN KEY ("visited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
