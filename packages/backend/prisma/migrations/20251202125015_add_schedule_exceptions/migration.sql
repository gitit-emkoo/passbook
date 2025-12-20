-- CreateTable
CREATE TABLE "schedule_exceptions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "student_id" INTEGER NOT NULL,
    "contract_id" INTEGER NOT NULL,
    "original_date" TIMESTAMP(3) NOT NULL,
    "new_date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "schedule_exceptions_student_id_idx" ON "schedule_exceptions"("student_id");

-- CreateIndex
CREATE INDEX "schedule_exceptions_contract_id_idx" ON "schedule_exceptions"("contract_id");

-- CreateIndex
CREATE INDEX "schedule_exceptions_original_date_idx" ON "schedule_exceptions"("original_date");

-- CreateIndex
CREATE INDEX "schedule_exceptions_new_date_idx" ON "schedule_exceptions"("new_date");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_exceptions_contract_id_original_date_key" ON "schedule_exceptions"("contract_id", "original_date");

-- AddForeignKey
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
