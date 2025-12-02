import { Module } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { InvoiceCalculationService } from './invoice-calculation.service';
import { PrismaService } from '../prisma/prisma.service';
import { InvoicesController } from './invoices.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [InvoicesService, InvoiceCalculationService, PrismaService],
  exports: [InvoicesService, InvoiceCalculationService],
  controllers: [InvoicesController],
})
export class InvoicesModule {}
