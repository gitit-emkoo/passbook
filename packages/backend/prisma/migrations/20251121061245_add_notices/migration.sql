-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "attendance_requires_signature" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ended_at" TIMESTAMP(3),
ADD COLUMN     "started_at" TIMESTAMP(3),
ADD COLUMN     "student_signature" TEXT,
ADD COLUMN     "teacher_signature" TEXT,
ALTER COLUMN "time" DROP NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "settings" JSONB;

-- CreateTable
CREATE TABLE "notices" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "is_important" BOOLEAN NOT NULL DEFAULT false,
    "user_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notices_user_id_idx" ON "notices"("user_id");

-- CreateIndex
CREATE INDEX "notices_is_important_idx" ON "notices"("is_important");

-- CreateIndex
CREATE INDEX "notices_created_at_idx" ON "notices"("created_at");

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
