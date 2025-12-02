-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "billing_day" INTEGER;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "period_end" TIMESTAMP(3),
ADD COLUMN     "period_start" TIMESTAMP(3);
