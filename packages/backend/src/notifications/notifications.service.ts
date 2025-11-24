import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PushNotificationService } from './push-notification.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private pushService: PushNotificationService,
  ) {}

  /**
   * 알림 목록 조회
   */
  async findAll(userId: number, filter?: string) {
    const where: any = {
      user_id: userId,
    };

    // 필터 적용
    if (filter && filter !== 'all') {
      where.type = filter;
    }

    return this.prisma.notification.findMany({
      where,
      orderBy: {
        created_at: 'desc',
      },
    });
  }

  /**
   * 알림 읽음 처리
   */
  async markAsRead(userId: number, notificationId: number) {
    return this.prisma.notification.updateMany({
      where: {
        id: notificationId,
        user_id: userId,
      },
      data: {
        is_read: true,
      },
    });
  }

  /**
   * 모든 알림 읽음 처리
   */
  async markAllAsRead(userId: number) {
    return this.prisma.notification.updateMany({
      where: {
        user_id: userId,
        is_read: false,
      },
      data: {
        is_read: true,
      },
    });
  }

  /**
   * 알림 생성 및 푸시 전송
   * 푸시 전송 실패해도 알림은 DB에 저장됨
   */
  async createAndSendNotification(
    userId: number,
    type: string,
    title: string,
    body: string,
    targetRoute: string,
  ) {
    // 1. 알림 DB에 저장
    const notification = await this.prisma.notification.create({
      data: {
        user_id: userId,
        type,
        title,
        body,
        target_route: targetRoute,
        is_read: false,
        push_sent: false,
      },
    });

    // 2. 사용자의 FCM 토큰 가져오기
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { settings: true },
    });

    let fcmToken: string | null = null;
    if (user?.settings && typeof user.settings === 'object') {
      const settings = user.settings as Record<string, any>;
      fcmToken = settings.fcm_token || null;
    }

    // 3. FCM 토큰이 있으면 푸시 전송 시도
    let pushSent = false;
    let pushSentAt: Date | null = null;

    if (fcmToken) {
      const success = await this.pushService.sendPushNotification(fcmToken, title, body, {
        notificationId: notification.id.toString(),
        type,
        targetRoute,
      });

      pushSent = success;
      pushSentAt = success ? new Date() : null;
    } else {
      this.logger.warn(`No FCM token found for user ${userId}`);
    }

    // 4. 푸시 전송 결과 업데이트
    await this.prisma.notification.update({
      where: { id: notification.id },
      data: {
        push_sent: pushSent,
        push_sent_at: pushSentAt,
      },
    });

    return notification;
  }
}
