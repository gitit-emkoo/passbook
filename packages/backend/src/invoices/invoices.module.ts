import { Module } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { InvoiceCalculationService } from './invoice-calculation.service';
import { PrismaService } from '../prisma/prisma.service';
import { InvoicesController } from './invoices.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { SmsModule } from '../sms/sms.module';

@Module({
  imports: [NotificationsModule, SmsModule],
  providers: [InvoicesService, InvoiceCalculationService, PrismaService],
  exports: [InvoicesService, InvoiceCalculationService],
  controllers: [InvoicesController],
})
export class InvoicesModule {}
