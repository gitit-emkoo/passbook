import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationSchedulerService {
  private readonly logger = new Logger(NotificationSchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  /**
   * 매일 19:00에 실행되는 스케줄러 (정산/수강생/계약)
   */
  @Cron('0 19 * * *', {
    name: 'daily-notifications-general',
    timeZone: 'Asia/Seoul',
  })
  async handleGeneralNotifications() {
    this.logger.log('Starting general notification check...');

    try {
      const users = await this.prisma.user.findMany({
        select: { id: true },
      });

      for (const user of users) {
        try {
          await this.checkSettlementNotifications(user.id);
          await this.checkStudentNotifications(user.id);
          await this.checkContractNotifications(user.id);
        } catch (error) {
          this.logger.error(`Failed to process general notifications for user ${user.id}:`, error);
        }
      }

      this.logger.log('General notification check completed');
    } catch (error) {
      this.logger.error('Error in general notification check:', error);
    }
  }

  /**
   * 매일 21:00에 실행되는 스케줄러 (출결)
   */
  @Cron('0 21 * * *', {
    name: 'daily-notifications-attendance',
    timeZone: 'Asia/Seoul',
  })
  async handleAttendanceNotifications() {
    this.logger.log('Starting attendance notification check...');

    try {
      const users = await this.prisma.user.findMany({
        select: { id: true },
      });

      for (const user of users) {
        try {
          await this.checkAttendanceNotifications(user.id);
        } catch (error) {
          this.logger.error(`Failed to process attendance notifications for user ${user.id}:`, error);
        }
      }

      this.logger.log('Attendance notification check completed');
    } catch (error) {
      this.logger.error('Error in attendance notification check:', error);
    }
  }

  /**
   * 청구 알림 체크
   */
  private async checkSettlementNotifications(userId: number) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    try {
      // 청구서 미전송 알림 체크
      const unsentInvoices = await this.prisma.invoice.findMany({
        where: {
          user_id: userId,
          year,
          month,
          send_status: 'not_sent',
          final_amount: { gt: 0 },
        },
        take: 1,
      });

      if (unsentInvoices.length > 0) {
        await this.notificationsService.createAndSendNotification(
          userId,
          'settlement',
          '청구서 미전송 알림',
          '아직 전송되지 않은 청구서가 있습니다. 청구서를 전송해주세요.',
          '/settlements',
          {
            isScheduled: true,
          },
        );
      }
    } catch (error) {
      this.logger.error(`Failed to check settlement notifications for user ${userId}:`, error);
    }
  }

  /**
   * 고객 알림 체크 (현재는 사용하지 않음)
   */
  private async checkStudentNotifications(userId: number) {
    // 뷰티앱에서는 고객 관련 스케줄러 알림 없음
    return;
  }

  /**
   * 관리 알림 체크 (노쇼 처리 안내)
   */
  private async checkAttendanceNotifications(userId: number) {
    try {
      // 어제 날짜 계산
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      const yesterdayEnd = new Date(yesterday);
      yesterdayEnd.setHours(23, 59, 59, 999);

      // 어제 날짜의 예약 조회
      const yesterdayReservations = await this.prisma.reservation.findMany({
        where: {
          contract: {
            user_id: userId,
            status: { in: ['confirmed', 'sent'] },
            student: {
              is_active: true,
            },
          },
          reserved_date: {
            gte: yesterday,
            lte: yesterdayEnd,
          },
        },
        include: {
          contract: {
            select: {
              id: true,
              student: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      if (yesterdayReservations.length === 0) {
        this.logger.log(`No reservations found for yesterday for user ${userId}`);
        return;
      }

      // 각 예약에 대해 출결 기록 확인
      let hasNoShow = false;
      for (const reservation of yesterdayReservations) {
        const attendanceLog = await this.prisma.attendanceLog.findFirst({
          where: {
            user_id: userId,
            contract_id: reservation.contract_id,
            occurred_at: {
              gte: yesterday,
              lte: yesterdayEnd,
            },
            voided: false,
          },
        });

        if (!attendanceLog) {
          hasNoShow = true;
          break;
        }
      }

      if (hasNoShow) {
        this.logger.log(`Creating no-show notification for user ${userId}`);
        await this.notificationsService.createAndSendNotification(
          userId,
          'attendance',
          '노쇼 처리 알림',
          '미처리 한 노쇼 내역이 있습니다.',
          '/attendance',
          {
            isScheduled: true,
          },
        );
        this.logger.log(`No-show notification created for user ${userId}`);
      } else {
        this.logger.log(`No no-show found for user ${userId}`);
      }
    } catch (error) {
      this.logger.error(`Failed to check attendance notifications for user ${userId}:`, error);
    }
  }

  /**
   * 계약 알림 체크
   */
  private async checkContractNotifications(userId: number) {
    try {
      // 계약서 전송 대기 체크 (status가 'confirmed'인 계약)
      const pendingContracts = await this.prisma.contract.findMany({
        where: {
          user_id: userId,
          status: 'confirmed',
          student: {
            is_active: true,
          },
        },
        include: {
          student: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (pendingContracts.length > 0) {
        const studentNames = pendingContracts
          .map((c) => c.student.name)
          .filter((name, index, self) => self.indexOf(name) === index)
          .slice(0, 3)
          .join(', ');
        const moreCount = pendingContracts.length > 3 ? ` 외 ${pendingContracts.length - 3}건` : '';

        await this.notificationsService.createAndSendNotification(
          userId,
          'contract',
          '이용권 계약 전송 대기',
          `전송되지 않은 이용권 계약이 있습니다. 계약 발송을 완료해주세요. (${studentNames}${moreCount})`,
          '/contracts',
          {
            isScheduled: true,
          },
        );
      }
    } catch (error) {
      this.logger.error(`Failed to check contract notifications for user ${userId}:`, error);
    }
  }
}

