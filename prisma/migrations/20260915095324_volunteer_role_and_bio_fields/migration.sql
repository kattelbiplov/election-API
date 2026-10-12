-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'VOLUNTEER';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "address" TEXT,
ADD COLUMN     "date_of_birth" DATE,
ADD COLUMN     "gender" "Gender";
