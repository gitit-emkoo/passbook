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
   * 정산 알림 체크
   */
  private async checkSettlementNotifications(userId: number) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    try {
      // 이번 달 정산 준비 완료 체크 (final_amount > 0인 invoice가 있는지 확인)
      const readyInvoices = await this.prisma.invoice.findMany({
        where: {
          user_id: userId,
          year,
          month,
          final_amount: { gt: 0 },
        },
        take: 1,
      });

      if (readyInvoices.length > 0) {
        await this.notificationsService.createAndSendNotification(
          userId,
          'settlement',
          '이번 달 정산 준비 완료',
          '정산 가능한 청구서가 있습니다.',
          '/settlements',
          {
            isScheduled: true,
          },
        );
      }

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
   * 수강생 알림 체크
   */
  private async checkStudentNotifications(userId: number) {
    try {
      const now = new Date();
      const sevenDaysLater = new Date(now);
      sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);

      // 계약 만료 임박 체크 (7일 이내)
      const expiringContracts = await this.prisma.contract.findMany({
        where: {
          user_id: userId,
          status: { in: ['confirmed', 'sent'] },
          ended_at: {
            gte: now,
            lte: sevenDaysLater,
          },
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

      if (expiringContracts.length > 0) {
        const studentNames = expiringContracts
          .map((c) => c.student.name)
          .filter((name, index, self) => self.indexOf(name) === index)
          .slice(0, 3)
          .join(', ');
        const moreCount = expiringContracts.length > 3 ? ` 외 ${expiringContracts.length - 3}명` : '';

        await this.notificationsService.createAndSendNotification(
          userId,
          'student',
          '계약 만료 임박',
          `수강생의 계약 만료가 임박했습니다. 연장 여부를 확인해주세요. (${studentNames}${moreCount})`,
          '/students',
          {
            isScheduled: true,
          },
        );
      }

      // 횟수제 계약 남은 회차 체크 (3회 미만)
      const sessionContracts = await this.prisma.contract.findMany({
        where: {
          user_id: userId,
          status: { in: ['confirmed', 'sent'] },
          student: {
            is_active: true,
          },
        },
        select: {
          id: true,
          policy_snapshot: true,
          student: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      const lowSessionContracts: { studentName: string }[] = [];

      for (const contract of sessionContracts) {
        const snapshot = (contract.policy_snapshot ?? {}) as Record<string, unknown>;
        const totalSessions = typeof snapshot.total_sessions === 'number' ? snapshot.total_sessions : 0;
        if (!totalSessions || totalSessions <= 0) {
          continue;
        }

        const usedSessions = await this.prisma.attendanceLog.count({
          where: {
            user_id: userId,
            contract_id: contract.id,
            voided: false,
            status: {
              in: ['present', 'absent', 'substitute', 'vanish'],
            },
          },
        });

        const remaining = totalSessions - usedSessions;
        if (remaining < 3) {
          lowSessionContracts.push({ studentName: contract.student.name });
        }
      }

      if (lowSessionContracts.length > 0) {
        const studentNames = lowSessionContracts
          .map((c) => c.studentName)
          .filter((name, index, self) => self.indexOf(name) === index)
          .slice(0, 3)
          .join(', ');
        const moreCount =
          lowSessionContracts.length > 3 ? ` 외 ${lowSessionContracts.length - 3}명` : '';

        await this.notificationsService.createAndSendNotification(
          userId,
          'student',
          '횟수제 계약 회차 임박',
          `횟수제 계약의 남은 회차가 3회 미만인 수강생이 있습니다. (${studentNames}${moreCount})`,
          '/students',
          {
            isScheduled: true,
          },
        );
      }
    } catch (error) {
      this.logger.error(`Failed to check student notifications for user ${userId}:`, error);
    }
  }

  /**
   * 출결 알림 체크
   */
  private async checkAttendanceNotifications(userId: number) {
    try {
      // 미처리 출결 알림 체크 (findUnprocessed 로직 직접 구현)
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const contracts = await this.prisma.contract.findMany({
        where: {
          user_id: userId,
          status: { in: ['confirmed', 'sent'] },
          student: { is_active: true },
        },
        select: {
          id: true,
          day_of_week: true,
          started_at: true,
          ended_at: true,
          created_at: true,
        },
      });

      let hasUnprocessed = false;

      for (const contract of contracts) {
        const dayOfWeekArray = (contract.day_of_week as string[]) || [];
        if (dayOfWeekArray.length === 0) continue;

        const contractCreatedAt = contract.created_at ? new Date(contract.created_at) : null;
        if (!contractCreatedAt) continue;

        const createdDate = new Date(contractCreatedAt);
        createdDate.setHours(0, 0, 0, 0);

        let checkStartDate: Date;
        if (contract.started_at) {
          const startDate = new Date(contract.started_at);
          startDate.setHours(0, 0, 0, 0);
          checkStartDate = startDate > createdDate ? startDate : createdDate;
        } else {
          checkStartDate = createdDate;
        }

        if (checkStartDate >= today) continue;

        let checkEndDate: Date;
        if (contract.ended_at) {
          const endDate = new Date(contract.ended_at);
          if (endDate < today) {
            checkEndDate = new Date(endDate);
            checkEndDate.setHours(23, 59, 59, 999);
          } else {
            checkEndDate = new Date(today);
            checkEndDate.setMilliseconds(checkEndDate.getMilliseconds() - 1);
          }
        } else {
          checkEndDate = new Date(today);
          checkEndDate.setMilliseconds(checkEndDate.getMilliseconds() - 1);
        }

        if (checkStartDate > checkEndDate) continue;

        // 최근 30일만 체크 (성능 최적화)
        const checkStart = new Date(Math.max(checkStartDate.getTime(), today.getTime() - 30 * 24 * 60 * 60 * 1000));

        for (let d = new Date(checkStart); d <= checkEndDate && !hasUnprocessed; d.setDate(d.getDate() + 1)) {
          const dayOfWeek = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getDay()];
          if (!dayOfWeekArray.includes(dayOfWeek)) continue;

          const dateStart = new Date(d);
          dateStart.setHours(0, 0, 0, 0);
          const dateEnd = new Date(d);
          dateEnd.setHours(23, 59, 59, 999);

          const existingLog = await this.prisma.attendanceLog.findFirst({
            where: {
              user_id: userId,
              contract_id: contract.id,
              occurred_at: { gte: dateStart, lte: dateEnd },
              voided: false,
            },
          });

          if (!existingLog) {
            hasUnprocessed = true;
            break;
          }
        }

        if (hasUnprocessed) break;
      }

      if (hasUnprocessed) {
        this.logger.log(`Creating unprocessed attendance notification for user ${userId}`);
        await this.notificationsService.createAndSendNotification(
          userId,
          'attendance',
          '미처리 출결 알림',
          '미처리 출결이 있습니다. 처리 해 주세요.',
          '/attendance',
          {
            isScheduled: true,
            skipDuplicateCheck: false, // 중복 체크는 유지하되 로그 추가
          },
        );
        this.logger.log(`Unprocessed attendance notification created for user ${userId}`);
      } else {
        this.logger.log(`No unprocessed attendance found for user ${userId}`);
      }

      // 장기 미출석 체크 (3주 이상 출결 기록 없음)
      const threeWeeksAgo = new Date();
      threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21);

      const activeStudents = await this.prisma.student.findMany({
        where: {
          user_id: userId,
          is_active: true,
        },
        include: {
          contracts: {
            where: {
              status: { in: ['confirmed', 'sent'] },
            },
          },
        },
      });

      const longAbsentStudents: Array<{ id: number; name: string }> = [];

      for (const student of activeStudents) {
        if (student.contracts.length === 0) continue;

        // 최근 3주간 출결 기록 확인
        const recentAttendance = await this.prisma.attendanceLog.findFirst({
          where: {
            user_id: userId,
            student_id: student.id,
            occurred_at: { gte: threeWeeksAgo },
            voided: false,
          },
          orderBy: {
            occurred_at: 'desc',
          },
        });

        if (!recentAttendance) {
          longAbsentStudents.push({ id: student.id, name: student.name });
        }
      }

      if (longAbsentStudents.length > 0) {
        const studentNames = longAbsentStudents
          .slice(0, 3)
          .map((s) => s.name)
          .join(', ');
        const moreCount = longAbsentStudents.length > 3 ? ` 외 ${longAbsentStudents.length - 3}명` : '';

        await this.notificationsService.createAndSendNotification(
          userId,
          'attendance',
          '장기 미출석',
          `장기 미출석 수강생이 있습니다. (${studentNames}${moreCount})`,
          '/attendance',
          {
            isScheduled: true,
          },
        );
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
          '계약서 전송 대기',
          `전송되지 않은 계약서가 있습니다. 계약서 발송을 완료해주세요. (${studentNames}${moreCount})`,
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

