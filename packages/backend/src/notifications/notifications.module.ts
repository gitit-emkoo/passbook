import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { PushNotificationService } from './push-notification.service';
import { NotificationSchedulerService } from './notification-scheduler.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  providers: [
    NotificationsService,
    PushNotificationService,
    NotificationSchedulerService,
    PrismaService,
  ],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
