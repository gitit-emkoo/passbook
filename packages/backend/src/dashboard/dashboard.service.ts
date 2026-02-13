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

    // 총 계약 수 (확정/전송된 계약만 집계)
    const contractsCount = await this.prisma.contract.count({
      where: {
        user_id: userId,
        status: { in: ['confirmed', 'sent'] },
      },
    });

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
    
    return result;
  }

  async getStatistics(userId: number) {
    // 이번 달 계산 (KST 기준)
    const now = new Date();
    const kstOffset = 9 * 60;
    const kstNow = new Date(now.getTime() + kstOffset * 60 * 1000);
    const currentYear = kstNow.getFullYear();
    const currentMonth = kstNow.getMonth() + 1;

    // 이번 달 시작일과 종료일 (UTC로 변환)
    const monthStart = new Date(Date.UTC(currentYear, currentMonth - 1, 1, 0, 0, 0, 0));
    const monthEnd = new Date(Date.UTC(currentYear, currentMonth, 0, 23, 59, 59, 999));

    // 이번 달 매출 (전송된 청구서의 final_amount 합계)
    // + 이번 달 금액권 매출 (amountBasedRevenue) 계산을 위해 계약 정보 포함
    const thisMonthInvoices = await this.prisma.invoice.findMany({
      where: {
        user_id: userId,
        year: currentYear,
        month: currentMonth,
        send_status: 'sent',
      },
      select: {
        id: true,
        final_amount: true,
        invoice_number: true,
        contract_id: true,
        contract: {
          select: {
            id: true,
            policy_snapshot: true,
            ended_at: true,
          },
        },
      },
    });
    
    let thisMonthRevenue = 0;
    let thisMonthAmountBasedRevenue = 0;

    for (const inv of thisMonthInvoices) {
      const amount = inv.final_amount || 0;
      thisMonthRevenue += amount;

      const snapshot = (inv.contract?.policy_snapshot ?? {}) as Record<string, unknown>;
      const totalSessions =
        typeof snapshot.total_sessions === 'number'
          ? snapshot.total_sessions
          : (snapshot.total_sessions as number | undefined) ?? 0;
      const isAmountBased = totalSessions === 0; // 금액권 (ended_at은 표시용일 뿐, 판별에 사용하지 않음)
      
      if (isAmountBased) {
        thisMonthAmountBasedRevenue += amount;
      }
    }

    // 이번 달 이용권 발행 수 (이번 달 생성된 계약)
    const thisMonthContracts = await this.prisma.contract.count({
      where: {
        user_id: userId,
        created_at: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
    });

    // 이번 달 사용 처리 금액(금액권) 합계 (사용 + 소멸)
    const thisMonthUsageAmountAgg = await this.prisma.attendanceLog.aggregate({
      where: {
        user_id: userId,
        occurred_at: {
          gte: monthStart,
          lte: monthEnd,
        },
        status: { in: ['present', 'vanish'] }, // 사용과 소멸 모두 포함
        voided: false,
        amount: { not: null },
      },
      _sum: {
        amount: true,
      },
    });
    const thisMonthUsageAmount = thisMonthUsageAmountAgg._sum.amount || 0;

    // 이번 달 사용 처리 횟수(횟수권) 합계 (사용 + 소멸)
    const thisMonthUsageCount = await this.prisma.attendanceLog.count({
      where: {
        user_id: userId,
        occurred_at: {
          gte: monthStart,
          lte: monthEnd,
        },
        status: { in: ['present', 'vanish'] }, // 사용과 소멸 모두 포함
        voided: false,
        amount: null,
      },
    });

    // 이번 달 발행된 횟수권의 서비스 횟수 합계 (분모)
    const thisMonthSessionContracts = await this.prisma.contract.findMany({
      where: {
        user_id: userId,
        created_at: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
      select: {
        policy_snapshot: true,
        ended_at: true,
      },
    });

    let thisMonthIssuedSessions = 0;
    for (const contract of thisMonthSessionContracts) {
      const snapshot = (contract.policy_snapshot ?? {}) as Record<string, unknown>;
      const totalSessions =
        typeof snapshot.total_sessions === 'number'
          ? snapshot.total_sessions
          : (snapshot.total_sessions as number | undefined) ?? 0;
      // 횟수권: total_sessions > 0 이고 ended_at 가 없거나 있어도, "발행된 서비스 총 횟수" 에 포함
      if (totalSessions > 0) {
        thisMonthIssuedSessions += totalSessions;
      }
    }

    // 활성 이용권 수 (계약 중인 계약)
    const activeContracts = await this.prisma.contract.count({
      where: {
        user_id: userId,
        status: { in: ['confirmed', 'sent'] },
      },
    });

    // 종료된 이용권 수 (ended_at 이 현재보다 과거인 계약)
    const endedContracts = await this.prisma.contract.count({
      where: {
        user_id: userId,
        ended_at: {
          lt: kstNow,
        },
      },
    });

    // 이용권 사용률 계산 (평균) - 최적화: 배치 쿼리 사용
    const contractsWithUsage = await this.prisma.contract.findMany({
      where: {
        user_id: userId,
        status: { in: ['confirmed', 'sent'] },
      },
      select: {
        id: true,
        policy_snapshot: true,
        monthly_amount: true,
        ended_at: true,
      },
    });

    let totalUsageRate = 0;
    let contractsWithRate = 0;

    if (contractsWithUsage.length > 0) {
      const contractIds = contractsWithUsage.map((c) => c.id);

      // 배치 쿼리: 모든 계약의 출결 기록을 한 번에 조회
      const allAttendanceLogs = await this.prisma.attendanceLog.findMany({
        where: {
          user_id: userId,
          contract_id: { in: contractIds },
          voided: false,
        },
        select: {
          contract_id: true,
          amount: true,
        },
      });

      // 계약별로 출결 기록 그룹화
      const logsByContract = new Map<number, Array<{ amount: number | null }>>();
      allAttendanceLogs.forEach((log) => {
        if (!logsByContract.has(log.contract_id)) {
          logsByContract.set(log.contract_id, []);
        }
        logsByContract.get(log.contract_id)!.push({ amount: log.amount });
      });

      for (const contract of contractsWithUsage) {
        const policySnapshot = (contract.policy_snapshot || {}) as any;
        const totalSessions = policySnapshot.total_sessions || 0;
        const monthlyAmount = contract.monthly_amount || 0;

        if (totalSessions > 0) {
          // 횟수권: 사용된 횟수 / 총 횟수
          const logs = logsByContract.get(contract.id) || [];
          const usedSessions = logs.length;
          const rate = (usedSessions / totalSessions) * 100;
          totalUsageRate += rate;
          contractsWithRate++;
        } else if (monthlyAmount > 0 && contract.ended_at) {
          // 금액권: 사용된 금액 / 총 금액
          const logs = logsByContract.get(contract.id) || [];
          const usedAmount = logs.reduce((sum, log) => sum + (log.amount || 0), 0);
          const rate = (usedAmount / monthlyAmount) * 100;
          totalUsageRate += rate;
          contractsWithRate++;
        }
      }
    }

    const usageRate = contractsWithRate > 0 ? totalUsageRate / contractsWithRate : 0;

    // 사용률 계산
    // 금액권 사용율: (이번 달 금액권 사용처리 금액 / 이번 달 금액권 매출) × 100
    const amountBasedUsageRate =
      thisMonthAmountBasedRevenue > 0
        ? Math.min((thisMonthUsageAmount / thisMonthAmountBasedRevenue) * 100, 100)
        : 0;

    // 횟수권 사용율: (이번 달 횟수권 사용처리 횟수 / 이번 달 발행된 횟수권의 서비스 횟수 합계) × 100
    const sessionBasedUsageRate =
      thisMonthIssuedSessions > 0
        ? Math.min((thisMonthUsageCount / thisMonthIssuedSessions) * 100, 100)
        : 0;

    return {
      thisMonthRevenue,
      thisMonthContracts,
      thisMonthUsageAmount,
      thisMonthUsageCount,
      activeContracts,
      endedContracts,
      amountBasedUsageRate,
      sessionBasedUsageRate,
      usageRate: Math.min(usageRate, 100), // legacy 필드
    };
  }

  async getMonthlyRevenue(userId: number) {
    // 현재 연도 기준으로 1월~12월 데이터 조회 - 최적화: 한 번의 쿼리로 모든 월 데이터 조회
    const now = new Date();
    const kstOffset = 9 * 60;
    const kstNow = new Date(now.getTime() + kstOffset * 60 * 1000);
    const currentYear = kstNow.getFullYear();

    // 한 번의 쿼리로 올해 모든 월의 데이터 조회
    const allInvoices = await this.prisma.invoice.findMany({
      where: {
        user_id: userId,
        year: currentYear,
        send_status: 'sent',
      },
      select: {
        month: true,
        final_amount: true,
      },
    });

    // 월별로 그룹화하여 합계 계산
    const monthlyRevenueMap = new Map<number, number>();
    for (let month = 1; month <= 12; month++) {
      monthlyRevenueMap.set(month, 0);
    }

    allInvoices.forEach((inv) => {
      const current = monthlyRevenueMap.get(inv.month) || 0;
      monthlyRevenueMap.set(inv.month, current + (inv.final_amount || 0));
    });

    // 배열로 변환
    const monthlyData: Array<{ year: number; month: number; revenue: number }> = [];
    for (let month = 1; month <= 12; month++) {
      monthlyData.push({
        year: currentYear,
        month,
        revenue: monthlyRevenueMap.get(month) || 0,
      });
    }

    return monthlyData;
  }

  async getMonthlyContracts(userId: number) {
    // 현재 연도 기준으로 1월~12월 데이터 조회 - 최적화: 한 번의 쿼리로 모든 월 데이터 조회
    const now = new Date();
    const kstOffset = 9 * 60;
    const kstNow = new Date(now.getTime() + kstOffset * 60 * 1000);
    const currentYear = kstNow.getFullYear();

    // 올해 시작일과 종료일
    const yearStart = new Date(Date.UTC(currentYear, 0, 1, 0, 0, 0, 0));
    const yearEnd = new Date(Date.UTC(currentYear, 11, 31, 23, 59, 59, 999));

    // 한 번의 쿼리로 올해 모든 계약 조회
    const allContracts = await this.prisma.contract.findMany({
      where: {
        user_id: userId,
        created_at: {
          gte: yearStart,
          lte: yearEnd,
        },
      },
      select: {
        created_at: true,
      },
    });

    // 월별로 그룹화하여 카운트
    const monthlyCountMap = new Map<number, number>();
    for (let month = 1; month <= 12; month++) {
      monthlyCountMap.set(month, 0);
    }

    allContracts.forEach((contract) => {
      const contractDate = new Date(contract.created_at);
      const month = contractDate.getUTCMonth() + 1; // 0-based to 1-based
      if (month >= 1 && month <= 12) {
        const current = monthlyCountMap.get(month) || 0;
        monthlyCountMap.set(month, current + 1);
      }
    });

    // 배열로 변환
    const monthlyData: Array<{ year: number; month: number; count: number }> = [];
    for (let month = 1; month <= 12; month++) {
      monthlyData.push({
        year: currentYear,
        month,
        count: monthlyCountMap.get(month) || 0,
      });
    }

    return monthlyData;
  }

  async getMonthlyUsageAmount(userId: number) {
    // 현재 연도 기준으로 1월~12월 데이터 조회 - 최적화: 한 번의 쿼리로 모든 월 데이터 조회
    const now = new Date();
    const kstOffset = 9 * 60;
    const kstNow = new Date(now.getTime() + kstOffset * 60 * 1000);
    const currentYear = kstNow.getFullYear();

    // 올해 시작일과 종료일
    const yearStart = new Date(Date.UTC(currentYear, 0, 1, 0, 0, 0, 0));
    const yearEnd = new Date(Date.UTC(currentYear, 11, 31, 23, 59, 59, 999));

    // 한 번의 쿼리로 올해 모든 출결 기록 조회
    const allAttendanceLogs = await this.prisma.attendanceLog.findMany({
      where: {
        user_id: userId,
        occurred_at: {
          gte: yearStart,
          lte: yearEnd,
        },
        status: { in: ['present', 'vanish'] }, // 사용과 소멸 모두 포함
        voided: false,
        amount: { not: null },
      },
      select: {
        occurred_at: true,
        amount: true,
      },
    });

    // 월별로 그룹화하여 합계 계산
    const monthlyAmountMap = new Map<number, number>();
    for (let month = 1; month <= 12; month++) {
      monthlyAmountMap.set(month, 0);
    }

    allAttendanceLogs.forEach((log) => {
      const logDate = new Date(log.occurred_at);
      const month = logDate.getUTCMonth() + 1; // 0-based to 1-based
      if (month >= 1 && month <= 12) {
        const current = monthlyAmountMap.get(month) || 0;
        monthlyAmountMap.set(month, current + (log.amount || 0));
      }
    });

    // 배열로 변환
    const monthlyData: Array<{ year: number; month: number; amount: number }> = [];
    for (let month = 1; month <= 12; month++) {
      monthlyData.push({
        year: currentYear,
        month,
        amount: monthlyAmountMap.get(month) || 0,
      });
    }

    return monthlyData;
  }

  async getMonthlyUsageCount(userId: number) {
    // 현재 연도 기준으로 1월~12월 데이터 조회 - 최적화: 한 번의 쿼리로 모든 월 데이터 조회
    const now = new Date();
    const kstOffset = 9 * 60;
    const kstNow = new Date(now.getTime() + kstOffset * 60 * 1000);
    const currentYear = kstNow.getFullYear();

    // 올해 시작일과 종료일
    const yearStart = new Date(Date.UTC(currentYear, 0, 1, 0, 0, 0, 0));
    const yearEnd = new Date(Date.UTC(currentYear, 11, 31, 23, 59, 59, 999));

    // 한 번의 쿼리로 올해 모든 출결 기록 조회
    const allAttendanceLogs = await this.prisma.attendanceLog.findMany({
      where: {
        user_id: userId,
        occurred_at: {
          gte: yearStart,
          lte: yearEnd,
        },
        status: { in: ['present', 'vanish'] }, // 사용과 소멸 모두 포함
        voided: false,
        amount: null, // 횟수권만
      },
      select: {
        occurred_at: true,
      },
    });

    // 월별로 그룹화하여 카운트
    const monthlyCountMap = new Map<number, number>();
    for (let month = 1; month <= 12; month++) {
      monthlyCountMap.set(month, 0);
    }

    allAttendanceLogs.forEach((log) => {
      const logDate = new Date(log.occurred_at);
      const month = logDate.getUTCMonth() + 1; // 0-based to 1-based
      if (month >= 1 && month <= 12) {
        const current = monthlyCountMap.get(month) || 0;
        monthlyCountMap.set(month, current + 1);
      }
    });

    // 배열로 변환
    const monthlyData: Array<{ year: number; month: number; count: number }> = [];
    for (let month = 1; month <= 12; month++) {
      monthlyData.push({
        year: currentYear,
        month,
        count: monthlyCountMap.get(month) || 0,
      });
    }

    return monthlyData;
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

    if (contracts.length === 0) {
      return [];
    }

    // student가 null인 계약 제외
    const validContracts = contracts.filter((c) => c.student !== null);
    if (validContracts.length === 0) {
      return [];
    }

    const contractIds = validContracts.map((c) => c.id);

    // 배치 쿼리: 모든 계약의 출결 기록을 한 번에 조회 (N+1 쿼리 해결)
    const allAttendanceLogs = await this.prisma.attendanceLog.findMany({
      where: {
        user_id: userId,
        contract_id: { in: contractIds },
        voided: false,
        status: { in: ['present', 'absent', 'substitute', 'vanish'] },
      },
      select: {
        contract_id: true,
        amount: true,
      },
    });

    // 계약별로 출결 기록 그룹화
    const logsByContract = new Map<number, Array<{ amount: number | null }>>();
    allAttendanceLogs.forEach((log) => {
      if (!logsByContract.has(log.contract_id)) {
        logsByContract.set(log.contract_id, []);
      }
      logsByContract.get(log.contract_id)!.push({ amount: log.amount });
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

    for (const contract of validContracts) {
      if (!contract.student) {
        continue;
      }

      const snapshot = (contract.policy_snapshot ?? {}) as Record<string, unknown>;
      const totalSessions = typeof snapshot.total_sessions === 'number' ? snapshot.total_sessions : 0;

      // 횟수권: 사용된 횟수 계산 (totalSessions > 0, ended_at은 표시용일 뿐, 판별에 사용하지 않음)
      if (totalSessions > 0) {
        const logs = logsByContract.get(contract.id) || [];
        const usedSessions = logs.length;

        const remainingSessions = totalSessions - usedSessions;
        // 3회 미만 (remainingSessions < 3, 즉 remainingSessions <= 2)
        if (remainingSessions < 3) {
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

      // 금액권: 잔여금액 계산 (totalSessions === 0, ended_at은 표시용일 뿐, 판별에 사용하지 않음, 뷰티앱: 잔여금액 20,000원 이하)
      if (totalSessions === 0) {
        const logs = logsByContract.get(contract.id) || [];
        const amountUsed = logs.reduce((sum, log) => sum + (log.amount || 0), 0);
        const totalAmount = contract.monthly_amount || 0;
        const remainingAmount = Math.max(totalAmount - amountUsed, 0);
        
        // 잔여금액 20,000원 이하
        if (remainingAmount <= 20000) {
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

    return contracts
      .filter((contract) => contract.student !== null)
      .map((contract) => ({
        id: contract.id,
        studentId: contract.student!.id,
        studentName: contract.student!.name,
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

