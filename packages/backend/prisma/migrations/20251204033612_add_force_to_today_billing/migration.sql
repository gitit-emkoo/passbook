-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "force_to_today_billing" BOOLEAN NOT NULL DEFAULT false;
