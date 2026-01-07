import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { PrismaService } from '../prisma/prisma.service';
import { InvoicesModule } from '../invoices/invoices.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SmsModule } from '../sms/sms.module';

@Module({
  imports: [InvoicesModule, NotificationsModule, SmsModule],
  providers: [AttendanceService, PrismaService],
  controllers: [AttendanceController],
})
export class AttendanceModule {}
