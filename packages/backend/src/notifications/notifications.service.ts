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
   * 스케줄러 알림 중복 체크 (오늘 날짜 기준)
   * 같은 type + 오늘 날짜에 이미 알림이 있으면 true 반환
   */
  async hasScheduledNotificationToday(userId: number, type: string): Promise<boolean> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const existing = await this.prisma.notification.findFirst({
      where: {
        user_id: userId,
        type,
        created_at: {
          gte: today,
          lt: tomorrow,
        },
      },
    });

    return !!existing;
  }

  /**
   * 이벤트 기반 알림 중복 체크 (type + 관련 ID 기준)
   * 같은 type + 같은 relatedId로 이미 알림이 있으면 true 반환
   */
  async hasEventNotification(userId: number, type: string, relatedId: string): Promise<boolean> {
    // relatedId에서 ID 추출 (예: "contract:123" -> "123", "attendance:456" -> "456")
    const idMatch = relatedId.match(/:(\d+)$/);
    if (!idMatch) {
      // ID를 추출할 수 없으면 target_route에 relatedId가 포함되어 있는지 확인
      const existing = await this.prisma.notification.findFirst({
        where: {
          user_id: userId,
          type,
          target_route: {
            contains: relatedId,
          },
        },
      });
      return !!existing;
    }

    const id = idMatch[1];
    
    // target_route가 정확히 해당 ID로 끝나는지 확인 (더 정확한 매칭)
    // 예: "/contracts/123" 또는 "/contracts/123?tab=details" 등
    // 정규식으로 정확히 매칭: /contracts/123 또는 /contracts/123/ 또는 /contracts/123?...
    const routePattern = `/${id}(/|\\?|$)`;
    
    const existing = await this.prisma.notification.findFirst({
      where: {
        user_id: userId,
        type,
        OR: [
          {
            target_route: {
              equals: `/${relatedId.split(':')[0]}s/${id}`, // 예: "/contracts/123"
            },
          },
          {
            target_route: {
              startsWith: `/${relatedId.split(':')[0]}s/${id}/`, // 예: "/contracts/123/"
            },
          },
          {
            target_route: {
              startsWith: `/${relatedId.split(':')[0]}s/${id}?`, // 예: "/contracts/123?"
            },
          },
        ],
      },
    });

    return !!existing;
  }

  /**
   * 알림 생성 및 푸시 전송
   * 푸시 전송 실패해도 알림은 DB에 저장됨
   * @param skipDuplicateCheck - 중복 체크를 건너뛸지 여부 (기본값: false)
   * @param relatedId - 이벤트 기반 알림의 경우 관련 ID (중복 체크용)
   */
  async createAndSendNotification(
    userId: number,
    type: string,
    title: string,
    body: string,
    targetRoute: string,
    options?: {
      skipDuplicateCheck?: boolean;
      relatedId?: string;
      isScheduled?: boolean;
    },
  ) {
    this.logger.log(`Creating notification: type=${type}, userId=${userId}, relatedId=${options?.relatedId}, targetRoute=${targetRoute}`);

    // 중복 체크
    if (!options?.skipDuplicateCheck) {
      if (options?.isScheduled) {
        // 스케줄러 알림: 오늘 날짜 기준 체크
        const hasToday = await this.hasScheduledNotificationToday(userId, type);
        if (hasToday) {
          this.logger.log(`Skipping duplicate scheduled notification: type=${type}, userId=${userId}`);
          return null;
        }
      } else if (options?.relatedId) {
        // 이벤트 기반 알림: type + relatedId 기준 체크
        const hasEvent = await this.hasEventNotification(userId, type, options.relatedId);
        if (hasEvent) {
          this.logger.log(`Skipping duplicate event notification: type=${type}, relatedId=${options.relatedId}, userId=${userId}`);
          return null;
        }
        this.logger.log(`No duplicate found for event notification: type=${type}, relatedId=${options.relatedId}`);
      }
    }

    // 1. 알림 DB에 저장
    this.logger.log(`Saving notification to DB: type=${type}, userId=${userId}, targetRoute=${targetRoute}, title=${title}, body=${body}`);
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
    this.logger.log(`Notification saved with id=${notification.id}, title=${notification.title}, body=${notification.body}`);

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
      this.logger.log(`Attempting to send push notification: notificationId=${notification.id}, fcmToken=${fcmToken.substring(0, 20)}...`);
      try {
        const success = await this.pushService.sendPushNotification(fcmToken, title, body, {
          notificationId: notification.id.toString(),
          type,
          targetRoute,
        });

        pushSent = success;
        pushSentAt = success ? new Date() : null;
        this.logger.log(`Push notification result: success=${success}, notificationId=${notification.id}`);
      } catch (error: any) {
        this.logger.error(`Error during push notification send: ${error.message}`, error.stack);
        pushSent = false;
        pushSentAt = null;
      }
    } else {
      this.logger.warn(`No FCM token found for user ${userId}`);
    }

    // 4. 푸시 전송 결과 업데이트
    this.logger.log(`Updating notification push status: id=${notification.id}, pushSent=${pushSent}`);
    await this.prisma.notification.update({
      where: { id: notification.id },
      data: {
        push_sent: pushSent,
        push_sent_at: pushSentAt,
      },
    });
    this.logger.log(`Notification process completed: id=${notification.id}`);

    return notification;
  }
}
