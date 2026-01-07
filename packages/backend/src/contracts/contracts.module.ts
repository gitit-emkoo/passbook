import { Module } from '@nestjs/common';
import { ContractsService } from './contracts.service';
import { ContractsController } from './contracts.controller';
import { PrismaService } from '../prisma/prisma.service';
import { InvoicesModule } from '../invoices/invoices.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SmsModule } from '../sms/sms.module';

@Module({
  imports: [InvoicesModule, NotificationsModule, SmsModule],
  providers: [ContractsService, PrismaService],
  controllers: [ContractsController],
})
export class ContractsModule {}
