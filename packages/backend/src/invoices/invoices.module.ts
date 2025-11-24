import { Module } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { InvoiceCalculationService } from './invoice-calculation.service';
import { PrismaService } from '../prisma/prisma.service';
import { InvoicesController } from './invoices.controller';

@Module({
  providers: [InvoicesService, InvoiceCalculationService, PrismaService],
  exports: [InvoicesService, InvoiceCalculationService],
  controllers: [InvoicesController],
})
export class InvoicesModule {}
