import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';
import { AuthModule } from './auth/auth.module';
import { StudentsModule } from './students/students.module';
import { ContractsModule } from './contracts/contracts.module';
import { AttendanceModule } from './attendance/attendance.module';
import { InvoicesModule } from './invoices/invoices.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { UsersModule } from './users/users.module';
import { NoticesModule } from './notices/notices.module';
import { PopupsModule } from './popups/popups.module';
import { SmsModule } from './sms/sms.module';
import { StorageModule } from './storage/storage.module';
import { InquiriesModule } from './inquiries/inquiries.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // ⚠️ 중요: envFilePath를 명시하지 않으면 로컬(.env)과 Fly.io(시스템 환경변수) 모두 지원
      // envFilePath: '.env', // Fly.io에서는 .env 파일이 없으므로 제거
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    StudentsModule,
    ContractsModule,
    AttendanceModule,
    InvoicesModule,
    NotificationsModule,
    DashboardModule,
    UsersModule,
    NoticesModule,
    PopupsModule,
    SmsModule,
    StorageModule,
    InquiriesModule,
  ],
  controllers: [AppController],
  providers: [AppService, PrismaService],
})
export class AppModule {}
