import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  async getSummary(userId: number) {
    // 이번 달 계산 (KST 기준)
    const now = new Date();
    const kstOffset = 9 * 60;
    const kstNow = new Date(now.getTime() + kstOffset * 60 * 1000);
    const currentYear = kstNow.getFullYear();
    const currentMonth = kstNow.getMonth() + 1;

    // 추가 안내가 필요한 계약서 조회 (연장 필요)
    const needsAttentionContracts = await this.findNeedsAttentionContracts(userId, currentYear, currentMonth);

    // 최근 계약서 조회 (이번 달 신규 계약 최대 5개)
    const recentContracts = await this.findRecentContracts(userId, 5, currentYear, currentMonth);

    // 총 학생 수 (확정/전송된 계약이 있는 학생만 집계, 중복 제거)
    const confirmedContractStudents = await this.prisma.contract.findMany({
      where: {
        user_id: userId,
        status: { in: ['confirmed', 'sent'] },
      },
      select: {
        student_id: true,
      },
      distinct: ['student_id'],
    });
    const studentsCount = confirmedContractStudents.length;
    console.log(`[Dashboard] studentsCount for userId=${userId}:`, studentsCount);

    // 총 계약 수 (확정/전송된 계약만 집계)
    const contractsCount = await this.prisma.contract.count({
      where: {
        user_id: userId,
        status: { in: ['confirmed', 'sent'] },
      },
    });
    console.log(`[Dashboard] contractsCount for userId=${userId}:`, contractsCount);

    // 비동기로 알림 생성 (응답 지연 없음)
    this.checkAndCreateNotifications(userId, currentYear, currentMonth).catch((err) => {
      console.error('[Dashboard] notification check error', err);
    });

    const result = {
      needsAttentionContracts,
      recentContracts,
      studentsCount,
      contractsCount,
    };
    
    console.log('[Dashboard] getSummary result', result);
    
    return result;
  }

  private async findNeedsAttentionContracts(userId: number, year: number, month: number) {
    const contracts = await this.prisma.contract.findMany({
      where: {
        user_id: userId,
        status: { in: ['confirmed', 'sent'] },
        student: { is_active: true },
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    const needsAttention: Array<{
      id: number;
      studentId: number;
      studentName: string;
      contractId: number;
      subject: string;
      status: string;
      createdAt: string;
    }> = [];

    for (const contract of contracts) {
      const snapshot = (contract.policy_snapshot ?? {}) as Record<string, unknown>;
      const totalSessions = typeof snapshot.total_sessions === 'number' ? snapshot.total_sessions : 0;
      const endedAt = contract.ended_at ? new Date(contract.ended_at) : null;

      // 횟수제: 사용된 횟수 계산
      if (totalSessions > 0) {
        const usedSessions = await this.prisma.attendanceLog.count({
          where: {
            user_id: userId,
            contract_id: contract.id,
            voided: false,
            status: { in: ['present', 'absent', 'substitute', 'vanish'] },
          },
        });

        const remainingSessions = totalSessions - usedSessions;
        if (remainingSessions <= 2) {
          needsAttention.push({
            id: contract.id,
            studentId: contract.student.id,
            studentName: contract.student.name,
            contractId: contract.id,
            subject: contract.subject,
            status: contract.status,
            createdAt: contract.created_at.toISOString(),
          });
        }
      }

      // 월단위: 종료일 7일 이내
      if (endedAt && totalSessions === 0) {
        const now = new Date();
        const daysUntilEnd = Math.ceil((endedAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysUntilEnd <= 7 && daysUntilEnd >= 0) {
          needsAttention.push({
            id: contract.id,
            studentId: contract.student.id,
            studentName: contract.student.name,
            contractId: contract.id,
            subject: contract.subject,
            status: contract.status,
            createdAt: contract.created_at.toISOString(),
          });
        }
      }
    }

    return needsAttention;
  }

  private async findRecentContracts(userId: number, limit: number, year: number, month: number) {
    // 이번 달 시작일과 종료일 계산 (KST 기준)
    const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);
    
    const contracts = await this.prisma.contract.findMany({
      where: {
        user_id: userId,
        status: { in: ['confirmed', 'sent'] },
        created_at: {
          gte: monthStart,
          lte: monthEnd,
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
      orderBy: { created_at: 'desc' },
      take: limit,
    });

    return contracts.map((contract) => ({
      id: contract.id,
      studentId: contract.student.id,
      studentName: contract.student.name,
      contractId: contract.id,
      subject: contract.subject,
      status: contract.status,
      createdAt: contract.created_at.toISOString(),
    }));
  }

  private async checkAndCreateNotifications(userId: number, year: number, month: number) {
    // 정산 알림, 계약 만료 알림 등은 notifications 모듈에서 처리
    // 여기서는 비동기로 호출만 함
  }
}

