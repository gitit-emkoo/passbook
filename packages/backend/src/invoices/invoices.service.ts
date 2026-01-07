import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceCalculationService } from './invoice-calculation.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SmsService } from '../sms/sms.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private prisma: PrismaService,
    private calculationService: InvoiceCalculationService,
    private notificationsService: NotificationsService,
    private smsService: SmsService,
    private configService: ConfigService,
  ) {}

  /**
   * 이번 달 정산 목록 조회 (on-demand 생성)
   * 해당 월의 invoice가 없으면 생성
   */
  async getCurrentMonthInvoices(userId: number) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    // 활성화된 계약서 조회 (월단위만, 일시납부 제외)
    const contracts = await this.prisma.contract.findMany({
      where: {
        user_id: userId,
        status: {
          in: ['confirmed', 'sent'],
        },
        payment_schedule: { not: 'lump_sum' }, // 일시납부 제외
        student: {
          is_active: true,
        },
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
    });

    const invoices = [];

    for (const rawContract of contracts) {
      const contract = this.normalizeContract(rawContract);
      
      // 일시납부 계약은 월단위 로직에서 제외
      if (contract.payment_schedule === 'lump_sum') {
        continue;
      }
      
      const policy = contract.policy_snapshot as Record<string, any>;
      const totalSessions = typeof policy?.total_sessions === 'number' ? policy.total_sessions : 0;
      // 뷰티앱: 금액권과 횟수권 모두 선불 횟수 계약 로직 사용
      // 횟수권: totalSessions > 0 && !ended_at
      // 금액권: totalSessions === 0 && ended_at 또는 totalSessions > 0 && ended_at
      const isSessionBased = totalSessions > 0 && !contract.ended_at; // 횟수권
      const isAmountBased = contract.ended_at; // 금액권 (유효기간이 있음)
      const isPrepaidSessionBased = (isSessionBased || isAmountBased) && contract.billing_type === 'prepaid';
      
      // 뷰티앱에서는 선불 횟수 계약만 사용
      // 선불 횟수 계약: 이미 생성된 청구서만 조회 (정산서는 회차 소진 시점 또는 연장 시점에 생성됨)
      if (isPrepaidSessionBased) {
        // 첫 정산서만 조회 (invoice_number: 1)
        const invoice = await this.prisma.invoice.findUnique({
          where: {
            student_id_contract_id_year_month_invoice_number: {
              student_id: contract.student_id,
              contract_id: contract.id,
              year,
              month,
              invoice_number: 1,
            },
          },
        });
        if (invoice) {
          invoices.push({
            ...invoice,
            student: contract.student,
            contract: {
              id: contract.id,
              subject: contract.subject,
              billing_type: contract.billing_type,
              absence_policy: contract.absence_policy,
              policy_snapshot: contract.policy_snapshot,
            },
          });
        }
        continue;
      }
    }

    return invoices;
  }

  /**
   * 특정 계약서의 해당 월 invoice 생성
   */
  /**
   * 일시납부 정산서 생성
   * - 선불: 계약시작일 하루전 생성/마감, 계약일부터 오늘청구 섹션 노출
   * - 후불: 계약일 생성, 계약종료일 마감, 계약종료일 다음날부터 오늘청구 섹션 노출
   */
  private async createLumpSumInvoice(userId: number, contract: any) {
    const normalizedContract = this.normalizeContract(contract);
    const policy = normalizedContract.policy_snapshot as Record<string, any>;
    const baseAmount =
      typeof policy.monthly_amount === 'number'
        ? policy.monthly_amount
        : normalizedContract.monthly_amount;

    const contractStartDate = normalizedContract.started_at
      ? new Date(normalizedContract.started_at)
      : null;
    const contractEndDate = normalizedContract.ended_at
      ? new Date(normalizedContract.ended_at)
      : null;

    if (!contractStartDate || !contractEndDate) {
      throw new BadRequestException('일시납부 계약은 시작일과 종료일이 필요합니다.');
    }

    // period_start, period_end는 계약 기간 전체
    // UTC로 저장된 날짜를 UTC 기준으로 정확히 변환 (Date.UTC 사용)
    const periodStart = new Date(Date.UTC(
      contractStartDate.getUTCFullYear(),
      contractStartDate.getUTCMonth(),
      contractStartDate.getUTCDate(),
      0, 0, 0, 0
    ));
    const periodEnd = new Date(Date.UTC(
      contractEndDate.getUTCFullYear(),
      contractEndDate.getUTCMonth(),
      contractEndDate.getUTCDate(),
      23, 59, 59, 999
    ));

    // year/month 결정
    let invoiceYear: number;
    let invoiceMonth: number;

    if (normalizedContract.billing_type === 'prepaid') {
      // 선불: 계약 시작일이 속한 달 (UTC 날짜 부분 사용)
      invoiceYear = contractStartDate.getUTCFullYear();
      invoiceMonth = contractStartDate.getUTCMonth() + 1;
    } else {
      // 후불: 계약 종료일이 속한 달 (UTC 날짜 부분 사용)
      invoiceYear = contractEndDate.getUTCFullYear();
      invoiceMonth = contractEndDate.getUTCMonth() + 1;
    }

    // 출결 기록 조회 (전체 계약 기간)
    const attendanceLogs = await this.prisma.attendanceLog.findMany({
      where: {
        user_id: userId,
        contract_id: normalizedContract.id,
        voided: false,
        occurred_at: {
          gte: periodStart,
          lte: periodEnd,
        },
      },
    });

    // auto_adjustment 계산 (전체 계약 기간 기준)
    const autoAdjustment = this.calculationService.calculateAutoAdjustment(
      normalizedContract,
      attendanceLogs,
      invoiceYear,
      invoiceMonth,
      periodStart,
      periodEnd,
    );

    // final_amount 계산
    const finalAmount = baseAmount + autoAdjustment + 0; // manual_adjustment는 0

    // 계좌 정보를 account_snapshot에 저장
    const accountInfo = (policy as any)?.account_info || null;

    // 예정 수업 횟수 계산 (전체 계약 기간)
    // 일시납부는 전체 계약 기간의 수업 횟수를 계산해야 함
    let plannedCount = normalizedContract.planned_count_override;
    if (!plannedCount && normalizedContract.day_of_week && Array.isArray(normalizedContract.day_of_week)) {
      // 전체 계약 기간의 수업 횟수 계산
      const dayOfWeekArray = normalizedContract.day_of_week as string[];
      const targetDays = dayOfWeekArray
        .map((day) => {
          const mapping: Record<string, number> = {
            SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
          };
          return mapping[day.toUpperCase()] ?? -1;
        })
        .filter((day) => day !== -1);
      
      let count = 0;
      const start = new Date(periodStart);
      const end = new Date(periodEnd);
      for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
        if (targetDays.includes(date.getDay())) {
          count++;
        }
      }
      plannedCount = count;
    }

    return this.prisma.invoice.create({
      data: {
        user_id: userId,
        student_id: normalizedContract.student_id,
        contract_id: normalizedContract.id,
        year: invoiceYear,
        month: invoiceMonth,
        base_amount: baseAmount,
        auto_adjustment: autoAdjustment,
        manual_adjustment: 0,
        final_amount: finalAmount,
        planned_count: plannedCount,
        period_start: periodStart,
        period_end: periodEnd,
        send_status: 'not_sent',
        account_snapshot: accountInfo,
      },
    });
  }

  async createInvoiceForContract(
    userId: number,
    contract: any,
    year: number,
    month: number,
  ) {
    const normalizedContract = this.normalizeContract(contract);
    const policy = normalizedContract.policy_snapshot;
    const baseAmount =
      typeof policy.monthly_amount === 'number'
        ? policy.monthly_amount
        : normalizedContract.monthly_amount;

    // 예정 수업 횟수 계산
    const plannedCount =
      normalizedContract.planned_count_override ??
      this.calculationService.calculatePlannedCount(
        normalizedContract.day_of_week as string[],
        year,
        month,
      );

    // 해당 월의 출결 기록 조회
    const attendanceLogs = await this.prisma.attendanceLog.findMany({
      where: {
        user_id: userId,
        contract_id: normalizedContract.id,
        voided: false,
      },
    });

    // period_start, period_end 계산
    // 확정 개념: 후불의 경우 period와 정산서 기간이 같음
    // - 첫 정산서: period_start=계약 시작일, period_end=첫 달 마지막일
    // - 두번째 정산서: period_start=첫 달 마지막일 다음날, period_end=두번째 달 마지막일
    let periodStart: Date | null = null;
    let periodEnd: Date | null = null;
    const billingDay = normalizedContract.billing_day;
    const contractStartDate = normalizedContract.started_at
      ? new Date(normalizedContract.started_at)
      : null;
    const contractEndDate = normalizedContract.ended_at
      ? new Date(normalizedContract.ended_at)
      : null;

    if (billingDay && billingDay >= 1 && billingDay <= 31 && contractStartDate) {
      // 이미 생성된 청구서 개수 확인 (현재 생성 중인 청구서가 몇 번째인지 판단)
      const existingInvoices = await this.prisma.invoice.findMany({
        where: {
          user_id: userId,
          student_id: normalizedContract.student_id,
          contract_id: normalizedContract.id,
        },
        orderBy: {
          created_at: 'asc',
        },
      });
      
      const currentInvoiceNumber = existingInvoices.length + 1;
      
      if (currentInvoiceNumber === 1) {
        // 첫 정산서: period_start=계약 시작일, period_end=다음 달 billing_day 하루 전
        // 확정 개념: 후불 한달 계약 (12.12~1.11일)의 경우
        // period_start=12.12일, period_end=1.11일 (다음 달 청구일 하루 전)
        periodStart = new Date(contractStartDate);
        periodStart.setHours(0, 0, 0, 0);
        
        // period_end는 계약 시작일의 다음 달 billing_day 하루 전
        const startYear = contractStartDate.getFullYear();
        const startMonth = contractStartDate.getMonth() + 1;
        const nextMonth = startMonth === 12 ? 1 : startMonth + 1;
        const nextYear = startMonth === 12 ? startYear + 1 : startYear;
        periodEnd = new Date(nextYear, nextMonth - 1, billingDay);
        periodEnd.setDate(periodEnd.getDate() - 1); // 청구일 하루 전
        periodEnd.setHours(23, 59, 59, 999);
        
        // 계약 종료일이 더 이르면 조정
        if (contractEndDate) {
          contractEndDate.setHours(23, 59, 59, 999);
          if (contractEndDate < periodEnd) {
            periodEnd.setTime(contractEndDate.getTime());
          }
        }
      } else {
        // 두번째 정산서 이상: period_start=이전 정산서의 period_end 다음날, period_end=이번 달 billing_day 하루 전
        // 이전 정산서의 period_end 찾기
        const previousInvoice = existingInvoices[existingInvoices.length - 1];
        if (previousInvoice?.period_end) {
          const previousPeriodEnd = new Date(previousInvoice.period_end);
          periodStart = new Date(previousPeriodEnd);
          periodStart.setDate(periodStart.getDate() + 1); // 다음날
          periodStart.setHours(0, 0, 0, 0);
        } else {
          // 이전 정산서의 period_end가 없으면 이번 달 billing_day 기준으로 계산
          const prevMonth = month === 1 ? 12 : month - 1;
          const prevYear = month === 1 ? year - 1 : year;
          const prevBillingDay = new Date(prevYear, prevMonth - 1, billingDay);
          periodStart = new Date(prevBillingDay);
          periodStart.setDate(periodStart.getDate() + 1);
          periodStart.setHours(0, 0, 0, 0);
        }
        
        // period_end는 다음 달의 billing_day 하루 전
        // 후불의 경우: period_start가 속한 달의 다음 달 billing_day 하루 전
        const periodStartMonth = periodStart.getMonth() + 1;
        const periodStartYear = periodStart.getFullYear();
        const nextMonth = periodStartMonth === 12 ? 1 : periodStartMonth + 1;
        const nextYear = periodStartMonth === 12 ? periodStartYear + 1 : periodStartYear;
        periodEnd = new Date(nextYear, nextMonth - 1, billingDay);
        periodEnd.setDate(periodEnd.getDate() - 1); // 청구일 하루 전
        periodEnd.setHours(23, 59, 59, 999);
        
        // 계약 종료일이 더 이르면 조정
        if (contractEndDate) {
          contractEndDate.setHours(23, 59, 59, 999);
          if (contractEndDate < periodEnd) {
            periodEnd.setTime(contractEndDate.getTime());
          }
        }
      }
    } else {
      // billing_day가 없거나 계약 시작일이 없으면 계약 기간을 그대로 사용
      if (contractStartDate) {
        periodStart = new Date(contractStartDate);
        periodStart.setHours(0, 0, 0, 0);
      }
      if (contractEndDate) {
        periodEnd = new Date(contractEndDate);
        periodEnd.setHours(23, 59, 59, 999);
      }
    }

    // auto_adjustment 계산 (period_start, period_end 전달)
    const autoAdjustment = this.calculationService.calculateAutoAdjustment(
      normalizedContract,
      attendanceLogs,
      year,
      month,
      periodStart,
      periodEnd,
    );

    // 이전 달 결석 반영 (차월차감/이월 정책일 때)
    const previousMonthAdjustment = this.calculationService.calculatePreviousMonthAdjustment(
      normalizedContract,
      attendanceLogs,
      year,
      month,
    );

    // 최종 auto_adjustment = 이번 달 계산 + 이전 달 반영
    const finalAutoAdjustment = autoAdjustment + previousMonthAdjustment;

    // final_amount 계산
    const finalAmount = baseAmount + finalAutoAdjustment + 0; // manual_adjustment는 0

    // 계좌 정보를 account_snapshot에 저장 (policy_snapshot에서 가져오기)
    const accountInfo = (policy as any)?.account_info || null;

    // 후불: year/month는 period_end 다음날(청구일) 기준으로 설정
    let invoiceYear = year;
    let invoiceMonth = month;
    if (normalizedContract.billing_type === 'postpaid' && periodEnd) {
      const dueDate = new Date(periodEnd);
      dueDate.setDate(dueDate.getDate() + 1); // 마감일 다음날 = 청구일
      invoiceYear = dueDate.getFullYear();
      invoiceMonth = dueDate.getMonth() + 1;
    }

    // 첫 정산서이므로 invoice_number: 1
    return this.prisma.invoice.create({
      data: {
        user_id: userId,
        student_id: normalizedContract.student_id,
        contract_id: normalizedContract.id,
        year: invoiceYear,
        month: invoiceMonth,
        invoice_number: 1, // 첫 정산서
        base_amount: baseAmount,
        auto_adjustment: finalAutoAdjustment,
        manual_adjustment: 0,
        final_amount: finalAmount,
        planned_count: plannedCount,
        period_start: periodStart,
        period_end: periodEnd,
        send_status: 'not_sent',
        account_snapshot: accountInfo,
      },
    });
  }

  /**
   * 기간계약(월단위) 선불의 두번째/세번째 청구서 생성
   * billing_day 기준으로 월별 청구서 생성
   * 
   * 출결기록은 연장단위로 구분하여 반영:
   * - 첫 계약(7.5~8.5)의 출결기록은 두번째 청구서(8.5~9.5)에 반영
   * - 두번째 계약(8.5~9.5)의 출결기록은 세번째 청구서(9.5~10.5)에 반영
   * - 연장 시점을 기준으로 이전 계약의 출결기록만 가져옴
   */
  async createPrepaidMonthlyInvoice(
    userId: number,
    contract: any,
    year: number,
    month: number,
    billingDate: Date,
  ) {
    const normalizedContract = this.normalizeContract(contract);
    const policy = normalizedContract.policy_snapshot as Record<string, any>;
    const baseAmount =
      typeof policy.monthly_amount === 'number'
        ? policy.monthly_amount
        : normalizedContract.monthly_amount;

    // 연장 이력 확인
    const extensions = Array.isArray(policy.extensions) ? policy.extensions : [];
    
    // 이미 생성된 청구서 개수 확인 (현재 생성 중인 청구서가 몇 번째인지 판단)
    const existingInvoices = await this.prisma.invoice.findMany({
      where: {
        user_id: userId,
        student_id: normalizedContract.student_id,
        contract_id: normalizedContract.id,
      },
      orderBy: {
        created_at: 'asc',
      },
    });
    
    // 현재 생성 중인 청구서 번호 (1=첫 계약, 2=2회 연장, 3=3회 연장...)
    const currentInvoiceNumber = existingInvoices.length + 1;
    
    // period_start, period_end 계산
    // 확정 개념: 선불 여러달 계약
    // - 첫 정산서: period_start=period_end=계약시작일 하루 전 (같은 날)
    // - 두번째 정산서: 생성일=12.9, period_start=12.9, period_end=1.8 (다음 달 청구일 하루 전)
    // - 세번째 정산서: 생성일=1.9, period_start=1.9, period_end=2.8 (다음 달 청구일 하루 전)
    const billingDay = normalizedContract.billing_day;
    const contractStartDate = normalizedContract.started_at
      ? new Date(normalizedContract.started_at)
      : null;
    const contractEndDate = normalizedContract.ended_at
      ? new Date(normalizedContract.ended_at)
      : null;
    
    let periodStart: Date;
    let periodEnd: Date;
    
    if (currentInvoiceNumber === 1) {
      // 첫 정산서: period_start=계약 시작일, period_end=다음 달 billing_day 전날
      if (contractStartDate && billingDay) {
        periodStart = new Date(contractStartDate);
        periodStart.setHours(0, 0, 0, 0);

        // 다음 달 billing_day 계산
        const startYear = contractStartDate.getFullYear();
        const startMonth = contractStartDate.getMonth() + 1;
        const nextMonth = startMonth === 12 ? 1 : startMonth + 1;
        const nextYear = startMonth === 12 ? startYear + 1 : startYear;
        periodEnd = new Date(nextYear, nextMonth - 1, billingDay);
        periodEnd.setDate(periodEnd.getDate() - 1); // 청구일 전날
        periodEnd.setHours(23, 59, 59, 999);

        // 계약 종료일이 더 이르면 조정
        if (contractEndDate) {
          contractEndDate.setHours(23, 59, 59, 999);
          if (contractEndDate < periodEnd) {
            periodEnd.setTime(contractEndDate.getTime());
          }
        }
      } else {
        throw new Error('계약 시작일 또는 billing_day가 없습니다.');
      }
    } else {
      // 두번째 정산서 이상: period_start=생성일, period_end=다음 달 청구일 하루 전
      // 예: 두번째 정산서 생성일=12.9, period_start=12.9, period_end=1.8
      // 생성일은 첫 정산서 마감일 다음날 또는 직전 정산서 마감일 다음날
      const previousInvoice = existingInvoices[existingInvoices.length - 1];
      if (previousInvoice?.period_end) {
        // 직전 정산서의 period_end 다음날이 period_start
        const previousPeriodEnd = new Date(previousInvoice.period_end);
        periodStart = new Date(previousPeriodEnd);
        periodStart.setDate(periodStart.getDate() + 1);
        periodStart.setHours(0, 0, 0, 0);
      } else {
        // 이전 정산서가 없으면 생성일 기준
        periodStart = new Date(year, month - 1, billingDay);
        periodStart.setDate(periodStart.getDate() + 1);
        periodStart.setHours(0, 0, 0, 0);
      }
      
      // period_end는 다음 달의 청구일 하루 전
      // 확정 개념: 두번째 정산서 마감일=1.8일, 세번째 정산서 마감일=2.8일
      // 예: year=2026, month=1이면 period_end=1.8일 (2월 청구일 하루 전)
      // 다음 달 계산
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      periodEnd = new Date(nextYear, nextMonth - 1, billingDay);
      periodEnd.setDate(periodEnd.getDate() - 1); // 다음 달 청구일 하루 전
      periodEnd.setHours(23, 59, 59, 999);
      
      // 계약 종료일이 더 이르면 조정
      if (contractEndDate) {
        contractEndDate.setHours(23, 59, 59, 999);
        if (contractEndDate < periodEnd) {
          periodEnd.setTime(contractEndDate.getTime());
        }
      }
    }

    // 출결 기록 조회 (연장단위로 구분)
    let attendanceLogs = await this.prisma.attendanceLog.findMany({
      where: {
        user_id: userId,
        contract_id: normalizedContract.id,
        voided: false,
      },
      orderBy: {
        occurred_at: 'asc',
      },
    });

    // 연장 이력이 있으면 이전 계약의 출결기록만 필터링
    if (extensions.length > 0 && currentInvoiceNumber > 1) {
      if (currentInvoiceNumber === 2) {
        // 2회 연장의 청구서: 최초 계약의 출결기록만
        // 최초 계약 시점부터 첫 연장 시점 이전까지
        const firstExtension = extensions[0];
        const firstExtensionDate = firstExtension.extended_at 
          ? new Date(firstExtension.extended_at)
          : null;
        
        if (firstExtensionDate) {
          attendanceLogs = attendanceLogs.filter((log) => {
            const logDate = new Date(log.occurred_at);
            return logDate < firstExtensionDate;
          });
        }
      } else if (currentInvoiceNumber > 2 && currentInvoiceNumber <= extensions.length + 1) {
        // 3회 연장 이상의 청구서: 이전 연장의 첫 출결부터 이번 연장 전까지
        // 예: 3회 연장 시 → 2회 연장 시점부터 3회 연장 시점 이전까지
        const previousExtension = extensions[currentInvoiceNumber - 3]; // 이전 연장
        const currentExtension = extensions[currentInvoiceNumber - 2]; // 현재 연장
        
        const previousExtensionDate = previousExtension.extended_at 
          ? new Date(previousExtension.extended_at)
          : null;
        const currentExtensionDate = currentExtension.extended_at 
          ? new Date(currentExtension.extended_at)
          : null;
        
        if (previousExtensionDate && currentExtensionDate) {
          attendanceLogs = attendanceLogs.filter((log) => {
            const logDate = new Date(log.occurred_at);
            return logDate >= previousExtensionDate && logDate < currentExtensionDate;
          });
        }
      }
      // currentInvoiceNumber === 1인 경우는 첫 계약이므로 필터링 없음 (전체 출결기록 사용)
    }

    // auto_adjustment 계산 (이전 계약의 출결 기록 기준)
    const autoAdjustment = this.calculationService.calculateAutoAdjustment(
      normalizedContract,
      attendanceLogs,
      year,
      month,
      periodStart,
      periodEnd,
    );

    // 이전 달 결석 반영은 없음 (기간계약 선불은 월단위로 구분)
    const previousMonthAdjustment = 0;

    // 최종 auto_adjustment
    const finalAutoAdjustment = autoAdjustment + previousMonthAdjustment;

    // final_amount 계산
    const finalAmount = baseAmount + finalAutoAdjustment;

    // 계좌 정보를 account_snapshot에 저장
    const accountInfo = policy?.account_info || null;

    return this.prisma.invoice.create({
      data: {
        user_id: userId,
        student_id: normalizedContract.student_id,
        contract_id: normalizedContract.id,
        year,
        month,
        invoice_number: currentInvoiceNumber, // 첫 계약=1, 연장1=2, 연장2=3...
        base_amount: baseAmount,
        auto_adjustment: finalAutoAdjustment,
        manual_adjustment: 0,
        final_amount: finalAmount,
        planned_count: null, // 기간계약 선불은 예정 회차 없음
        period_start: periodStart,
        period_end: periodEnd,
        send_status: 'not_sent', // 두번째/세번째 청구서는 아직 전송 안됨
        account_snapshot: accountInfo,
      },
    });
  }

  /**
   * 횟수계약(계약기간없음) 청구서 생성
   * 후불: 횟수 모두 차감되었을 때만 호출됨
   * 선불: 최초 계약횟수 소진 시점에 호출됨
   * 청구서 실제 발송일이 속하는 달로 저장
   * 
   * 출결기록은 연장단위로 구분하여 반영:
   * - 첫 계약의 출결기록은 두번째 계약(연장)의 청구서에 반영
   * - 연장 시점을 기준으로 이전 계약의 출결기록만 가져옴
   */
  async createInvoiceForSessionBasedContract(
    userId: number,
    contract: any,
    year: number,
    month: number,
  ): Promise<any> {
    const normalizedContract = this.normalizeContract(contract);
    const policy = normalizedContract.policy_snapshot as Record<string, any>;
    const monthlyAmount =
      typeof policy.monthly_amount === 'number'
        ? policy.monthly_amount
        : normalizedContract.monthly_amount;

    // 연장 이력 확인
    const extensions = Array.isArray(policy.extensions) ? policy.extensions : [];
    console.log(`[Invoice] createInvoiceForSessionBasedContract: contract_id=${normalizedContract.id}, extensions.length=${extensions.length}`);
    if (extensions.length > 0) {
      extensions.forEach((ext, idx) => {
        console.log(`[Invoice] Extension ${idx + 1}: added_sessions=${ext.added_sessions}, extension_amount=${ext.extension_amount}`);
      });
    }
    const totalSessions = typeof policy.total_sessions === 'number' ? policy.total_sessions : 0;
    // 금액권 판단: totalSessions가 0이거나 ended_at이 있으면 금액권
    const isAmountBased = totalSessions === 0 || normalizedContract.ended_at;
    const isSessionBased = totalSessions > 0 && !normalizedContract.ended_at; // 횟수권
    
    // 최초 계약 총회차(연장분 제외)를 구해 단가 산정에 사용 (횟수권만)
    const addedSessionsTotal = extensions.reduce(
      (sum: number, ext: any) => sum + (ext.added_sessions || 0),
      0,
    );
    const originalTotalSessions = totalSessions - addedSessionsTotal > 0
      ? totalSessions - addedSessionsTotal
      : totalSessions;

    // 단가 계산: 횟수권만 계산, 금액권은 단가가 없음
    let perSession = 0;
    if (isSessionBased) {
      // 우선 per_session_amount, 없으면 최초 계약 금액/최초 계약 회차
      perSession =
        typeof (policy as any).per_session_amount === 'number' && (policy as any).per_session_amount > 0
          ? (policy as any).per_session_amount
          : 0;
      if (!perSession && originalTotalSessions > 0 && monthlyAmount) {
        perSession = monthlyAmount / originalTotalSessions;
      }
      // perSession이 여전히 0이면 monthlyAmount를 안전값으로 사용
      if (!perSession || perSession <= 0) {
        perSession = monthlyAmount && totalSessions > 0 ? monthlyAmount / totalSessions : 0;
      }
    }
    
    // 이미 생성된 청구서 개수 확인 (현재 생성 중인 청구서가 몇 번째인지 판단)
    const existingInvoices = await this.prisma.invoice.findMany({
      where: {
        user_id: userId,
        student_id: normalizedContract.student_id,
        contract_id: normalizedContract.id,
      },
    });
    
    // 현재 생성 중인 청구서 번호 (1=첫 계약, 2=2회 연장, 3=3회 연장...)
    const currentInvoiceNumber = existingInvoices.length + 1;
    
    // 전체 출결기록 가져오기
    let attendanceLogs = await this.prisma.attendanceLog.findMany({
      where: {
        user_id: userId,
        contract_id: normalizedContract.id,
        voided: false,
      },
      orderBy: {
        occurred_at: 'asc',
      },
    });

    // 출결기록을 연장단위로 구분하여 필터링
    // 각 연장마다 이전 연장의 첫 출결부터 이번 연장 전까지의 출결기록만 반영
    if (extensions.length > 0 && currentInvoiceNumber > 1) {
      if (currentInvoiceNumber === 2) {
        // 2회 연장의 청구서: 최초 계약의 출결기록만 (1회~10회)
        // 최초 계약 시점부터 2회 연장 시점 이전까지
        const firstExtension = extensions[0];
        const firstExtensionDate = firstExtension.extended_at 
          ? new Date(firstExtension.extended_at)
          : null;
        
        if (firstExtensionDate) {
          attendanceLogs = attendanceLogs.filter((log) => {
            const logDate = new Date(log.occurred_at);
            return logDate < firstExtensionDate;
          });
        }
      } else if (currentInvoiceNumber > 2 && currentInvoiceNumber <= extensions.length + 1) {
        // 3회 연장 이상의 청구서: 이전 연장의 첫 출결부터 이번 연장 전까지
        // 예: 3회 연장 시 → 2회 연장 시점부터 3회 연장 시점 이전까지 (11회~20회)
        const previousExtension = extensions[currentInvoiceNumber - 3]; // 이전 연장
        const currentExtension = extensions[currentInvoiceNumber - 2]; // 현재 연장
        
        const previousExtensionDate = previousExtension.extended_at 
          ? new Date(previousExtension.extended_at)
          : null;
        const currentExtensionDate = currentExtension.extended_at 
          ? new Date(currentExtension.extended_at)
          : null;
        
        if (previousExtensionDate && currentExtensionDate) {
          attendanceLogs = attendanceLogs.filter((log) => {
            const logDate = new Date(log.occurred_at);
            return logDate >= previousExtensionDate && logDate < currentExtensionDate;
          });
        }
      }
      // currentInvoiceNumber === 1인 경우는 첫 계약이므로 필터링 없음 (전체 출결기록 사용)
    }

    // period_start, period_end는 없음 (횟수계약은 계약기간없음)
    const periodStart: Date | null = null;
    const periodEnd: Date | null = null;

    // auto_adjustment 계산 (이전 계약의 출결 기록 기준)
    const autoAdjustment = this.calculationService.calculateAutoAdjustment(
      normalizedContract,
      attendanceLogs,
      year,
      month,
      periodStart,
      periodEnd,
    );

    // 이전 달 결석 반영은 없음 (횟수계약은 계약기간없음)
    const previousMonthAdjustment = 0;

    // 최종 auto_adjustment
    const finalAutoAdjustment = autoAdjustment + previousMonthAdjustment;

    // base_amount 계산 (연장 정산서의 경우 extension_amount 우선 사용)
    let baseAmount = monthlyAmount;
    console.log(`[Invoice] baseAmount calculation: currentInvoiceNumber=${currentInvoiceNumber}, extensions.length=${extensions.length}, monthlyAmount=${monthlyAmount}`);
    if (currentInvoiceNumber > 1 && extensions.length >= currentInvoiceNumber - 1) {
      const extension = extensions[currentInvoiceNumber - 2];
      const added = extension?.added_sessions || 0;
      console.log(`[Invoice] Extension found: added_sessions=${added}, extension_amount=${extension?.extension_amount}, extension object:`, JSON.stringify(extension));
      
      // extension_amount가 있으면 우선 사용 (사용자가 직접 입력한 금액)
      if (extension?.extension_amount && extension.extension_amount > 0) {
        baseAmount = extension.extension_amount;
        console.log(`[Invoice] Extension baseAmount from extension_amount: ${baseAmount}`);
      } else if (perSession > 0 && added > 0) {
        // extension_amount가 없으면 단가 * 연장 회차로 계산
        baseAmount = perSession * added;
        console.log(`[Invoice] Extension baseAmount calculated: ${baseAmount} = ${perSession} * ${added}`);
      } else {
        console.log(`[Invoice] Extension baseAmount NOT calculated: extension_amount=${extension?.extension_amount}, perSession=${perSession}, added=${added}`);
      }
    } else {
      console.log(`[Invoice] Not extension invoice: currentInvoiceNumber=${currentInvoiceNumber}, extensions.length=${extensions.length}`);
    }
    console.log(`[Invoice] Final baseAmount: ${baseAmount}`);

    // final_amount 계산
    const finalAmount = baseAmount + finalAutoAdjustment;

    // 계좌 정보를 account_snapshot에 저장
    const accountInfo = policy?.account_info || null;

    // 기존 정산서 확인 (unique constraint 방지)
    // invoice_number를 포함하여 같은 달에 여러 청구서 허용
    const existingInvoice = await this.prisma.invoice.findUnique({
      where: {
        student_id_contract_id_year_month_invoice_number: {
          student_id: normalizedContract.student_id,
          contract_id: normalizedContract.id,
          year,
          month,
          invoice_number: currentInvoiceNumber,
        },
      },
    });

    if (existingInvoice) {
      // 기존 정산서가 있으면 업데이트 (base_amount 등이 변경되었을 수 있음)
      // currentInvoiceNumber를 다시 계산
      const allInvoices = await this.prisma.invoice.findMany({
        where: {
          user_id: userId,
          student_id: normalizedContract.student_id,
          contract_id: normalizedContract.id,
        },
        orderBy: {
          created_at: 'asc',
        },
      });
      const updatedCurrentInvoiceNumber = allInvoices.findIndex(inv => inv.id === existingInvoice.id) + 1;
      
      // 뷰티앱: 같은 달에 여러 청구서 허용 (invoice_number로 구분)
      // 기존 정산서가 있으면 업데이트만 수행
      
      // 연장 정산서인 경우 base_amount 재계산
      let updatedBaseAmount = baseAmount;
      console.log(`[Invoice] Updating existing invoice ${existingInvoice.id}: updatedCurrentInvoiceNumber=${updatedCurrentInvoiceNumber}, extensions.length=${extensions.length}, baseAmount=${baseAmount}, perSession=${perSession}`);
      if (updatedCurrentInvoiceNumber > 1 && extensions.length >= updatedCurrentInvoiceNumber - 1) {
        const extension = extensions[updatedCurrentInvoiceNumber - 2];
        const added = extension?.added_sessions || 0;
        
        // extension_amount가 있으면 우선 사용 (사용자가 직접 입력한 금액)
        if (extension?.extension_amount && extension.extension_amount > 0) {
          updatedBaseAmount = extension.extension_amount;
          console.log(`[Invoice] Updated baseAmount from extension_amount: ${updatedBaseAmount}`);
        } else if (perSession > 0 && added > 0) {
          // extension_amount가 없으면 단가 * 연장 회차로 계산
          updatedBaseAmount = perSession * added;
          console.log(`[Invoice] Updated baseAmount: ${updatedBaseAmount} = ${perSession} * ${added}`);
        } else {
          console.log(`[Invoice] Updated baseAmount NOT calculated: extension_amount=${extension?.extension_amount}, perSession=${perSession}, added=${added}`);
        }
      } else {
        console.log(`[Invoice] Not extension invoice: updatedCurrentInvoiceNumber=${updatedCurrentInvoiceNumber}, extensions.length=${extensions.length}`);
      }
      
      const updatedFinalAmount = updatedBaseAmount + finalAutoAdjustment;
      
      return this.prisma.invoice.update({
        where: { id: existingInvoice.id },
        data: {
          base_amount: updatedBaseAmount,
          auto_adjustment: finalAutoAdjustment,
          final_amount: updatedFinalAmount,
          account_snapshot: accountInfo,
        },
      });
    }

    return this.prisma.invoice.create({
      data: {
        user_id: userId,
        student_id: normalizedContract.student_id,
        contract_id: normalizedContract.id,
        year,
        month,
        invoice_number: currentInvoiceNumber, // 첫 계약=1, 연장1=2, 연장2=3...
        base_amount: baseAmount,
        auto_adjustment: finalAutoAdjustment,
        manual_adjustment: 0,
        final_amount: finalAmount,
        planned_count: null, // 횟수계약은 예정 회차 없음
        period_start: periodStart,
        period_end: periodEnd,
        send_status: 'not_sent',
        account_snapshot: accountInfo,
      },
    });
  }

  /**
   * 특정 계약/연-월의 인보이스를 재계산하여 upsert
   * 출결 기록이 발생한 날짜가 속한 정산서를 찾아서 재계산
   */
  async recalculateForContractMonth(userId: number, contractId: number, occurredAt: Date) {
    const rawContract = await this.prisma.contract.findFirst({
      where: { id: contractId, user_id: userId },
      include: {
        student: {
          select: { id: true, name: true, phone: true },
        },
      },
    });
    if (!rawContract) {
      throw new NotFoundException('계약서를 찾을 수 없습니다.');
    }
    const contract = this.normalizeContract(rawContract);

    // 출결 기록이 발생한 날짜가 속한 정산서 찾기
    // 후불 계약의 경우 정산서의 year/month는 period_end의 다음날 기준이므로,
    // 출결 기록 발생일의 year/month로는 정확한 정산서를 찾을 수 없음
    // 따라서 period_start ~ period_end 범위로 정산서를 찾아야 함
    const occurredDateOnly = new Date(occurredAt);
    occurredDateOnly.setHours(0, 0, 0, 0);
    
    const allInvoices = await this.prisma.invoice.findMany({
      where: {
        user_id: userId,
        contract_id: contract.id,
      },
      orderBy: {
        created_at: 'asc',
      },
    });

    // 출결 기록이 발생한 날짜가 속한 정산서 찾기
    let targetInvoice = null;
    for (const invoice of allInvoices) {
      if (invoice.period_start && invoice.period_end) {
        const periodStart = new Date(invoice.period_start);
        periodStart.setHours(0, 0, 0, 0);
        const periodEnd = new Date(invoice.period_end);
        periodEnd.setHours(23, 59, 59, 999);
        
        if (occurredDateOnly >= periodStart && occurredDateOnly <= periodEnd) {
          targetInvoice = invoice;
          break;
        }
      }
    }

    // 정산서를 찾지 못한 경우, 출결 기록 발생일의 year/month로 찾기 시도 (기존 로직)
    // 같은 달에 여러 청구서가 있을 수 있으므로 findMany 사용
    if (!targetInvoice) {
      const year = occurredAt.getFullYear();
      const month = occurredAt.getMonth() + 1;
      const invoices = await this.prisma.invoice.findMany({
        where: {
          student_id: contract.student_id,
          contract_id: contract.id,
          year,
          month,
        },
        orderBy: {
          invoice_number: 'asc',
        },
      });
      // 첫 정산서 우선 사용 (없으면 가장 최근 것)
      targetInvoice = invoices[0] || invoices[invoices.length - 1] || null;
    }

    // 정산서를 찾지 못한 경우, 계약 정보를 기반으로 year/month 계산
    let year: number;
    let month: number;
    if (targetInvoice) {
      year = targetInvoice.year;
      month = targetInvoice.month;
    } else {
      // 기존 로직: 출결 기록 발생일의 year/month 사용
      year = occurredAt.getFullYear();
      month = occurredAt.getMonth() + 1;
    }

    // 해당 계약의 모든 Attendance 로그 (period_start ~ period_end 범위 필터링은 calculateAutoAdjustment에서 처리)
    const attendanceLogs = await this.prisma.attendanceLog.findMany({
      where: { user_id: userId, contract_id: contract.id, voided: false },
    });

    // 정산서를 찾은 경우, 해당 정산서의 period_start, period_end 사용
    // 찾지 못한 경우에만 새로 계산
    let periodStart: Date | null = null;
    let periodEnd: Date | null = null;
    
    if (targetInvoice && targetInvoice.period_start && targetInvoice.period_end) {
      // 기존 정산서의 period_start, period_end 사용
      periodStart = new Date(targetInvoice.period_start);
      periodEnd = new Date(targetInvoice.period_end);
    } else {
      // 정산서를 찾지 못한 경우, period_start, period_end 계산 (계약 기간과 billing_day 기준)
      const billingDay = contract.billing_day;
      const contractStartDate = contract.started_at ? new Date(contract.started_at) : null;
      const contractEndDate = contract.ended_at ? new Date(contract.ended_at) : null;

      if (billingDay && billingDay >= 1 && billingDay <= 31) {
        const prevMonth = month === 1 ? 12 : month - 1;
        const prevYear = month === 1 ? year - 1 : year;
        const billingDayStart = new Date(prevYear, prevMonth - 1, billingDay);
        billingDayStart.setHours(0, 0, 0, 0);

        const billingDayEnd = new Date(year, month - 1, billingDay);
        billingDayEnd.setHours(23, 59, 59, 999);

        if (contractStartDate) {
          contractStartDate.setHours(0, 0, 0, 0);
          periodStart = contractStartDate > billingDayStart ? contractStartDate : billingDayStart;
        } else {
          periodStart = billingDayStart;
        }

        if (contractEndDate) {
          contractEndDate.setHours(23, 59, 59, 999);
          periodEnd = contractEndDate < billingDayEnd ? contractEndDate : billingDayEnd;
        } else {
          periodEnd = billingDayEnd;
        }
      } else {
        if (contractStartDate) {
          periodStart = new Date(contractStartDate);
          periodStart.setHours(0, 0, 0, 0);
        }
        if (contractEndDate) {
          periodEnd = new Date(contractEndDate);
          periodEnd.setHours(23, 59, 59, 999);
        }
      }
    }

    // 예정 회차
    const plannedCount =
      contract.planned_count_override ??
      this.calculationService.calculatePlannedCount(contract.day_of_week, year, month);

    const policy = contract.policy_snapshot;
    const baseAmount =
      typeof policy.monthly_amount === 'number' ? policy.monthly_amount : contract.monthly_amount;

    const autoAdjustment = this.calculationService.calculateAutoAdjustment(
      contract,
      attendanceLogs,
      year,
      month,
      periodStart,
      periodEnd,
    );
    const previousMonthAdjustment = this.calculationService.calculatePreviousMonthAdjustment(
      contract,
      attendanceLogs,
      year,
      month,
    );
    const finalAutoAdjustment = autoAdjustment + previousMonthAdjustment;
    
    // 계좌 정보를 account_snapshot에 저장 (policy_snapshot에서 가져오기)
    const accountInfo = (policy as any)?.account_info || null;
    
    const invoiceData = {
      user_id: userId,
      student_id: contract.student_id,
      contract_id: contract.id,
      year,
      month,
      base_amount: baseAmount,
      auto_adjustment: finalAutoAdjustment,
      manual_adjustment: 0,
      final_amount: baseAmount + finalAutoAdjustment,
      planned_count: plannedCount,
      period_start: periodStart,
      period_end: periodEnd,
      account_snapshot: accountInfo,
    };

    // 첫 정산서만 확인 (invoice_number: 1)
    const existing = await this.prisma.invoice.findUnique({
      where: {
        student_id_contract_id_year_month_invoice_number: {
          student_id: contract.student_id,
          contract_id: contract.id,
          year,
          month,
          invoice_number: 1,
        },
      },
    });
    if (!existing) {
      return this.prisma.invoice.create({
        data: { ...invoiceData, invoice_number: 1, send_status: 'not_sent' }, // 첫 정산서
      });
    }
    return this.prisma.invoice.update({
      where: { id: existing.id },
      data: {
        auto_adjustment: finalAutoAdjustment,
        final_amount: baseAmount + finalAutoAdjustment + existing.manual_adjustment,
        base_amount: baseAmount,
        planned_count: plannedCount,
        period_start: periodStart,
        period_end: periodEnd,
        account_snapshot: accountInfo,
      },
    });
  }

  /**
   * Invoice 수정 (manual_adjustment)
   */
  async updateInvoice(
    userId: number,
    invoiceId: number,
    manualAdjustment: number,
    manualReason?: string,
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        user_id: userId,
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice를 찾을 수 없습니다.');
    }

    // final_amount 재계산
    const finalAmount = invoice.base_amount + invoice.auto_adjustment + manualAdjustment;

    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        manual_adjustment: manualAdjustment,
        manual_reason: manualReason ?? null,
        final_amount: finalAmount,
      },
    });
  }

  /**
   * 청구서를 오늘청구로 이동 (조기 청구)
   */
  async moveToTodayBilling(userId: number, invoiceId: number) {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        user_id: userId,
      },
    });

    if (!invoice) {
      throw new NotFoundException('청구서를 찾을 수 없습니다.');
    }

    // 이미 전송된 청구서는 이동 불가
    if (invoice.send_status === 'sent') {
      throw new BadRequestException('이미 전송된 청구서는 이동할 수 없습니다.');
    }

    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { force_to_today_billing: true },
    });
  }

  /**
   * Invoice 재계산 (출결 변경 시 호출)
   */
  async recalculateInvoice(userId: number, invoiceId: number) {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        user_id: userId,
      },
      include: {
        contract: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice를 찾을 수 없습니다.');
    }

    // 출결 기록 재조회
    const attendanceLogs = await this.prisma.attendanceLog.findMany({
      where: {
        user_id: userId,
        contract_id: invoice.contract_id,
        voided: false,
      },
    });

    const contractForCalc = this.normalizeContract(invoice.contract);

    const autoAdjustment = this.calculationService.calculateAutoAdjustment(
      contractForCalc,
      attendanceLogs,
      invoice.year,
      invoice.month,
      invoice.period_start ? new Date(invoice.period_start) : null,
      invoice.period_end ? new Date(invoice.period_end) : null,
    );

    // 이전 달 반영 재계산
    const previousMonthAdjustment = this.calculationService.calculatePreviousMonthAdjustment(
      contractForCalc,
      attendanceLogs,
      invoice.year,
      invoice.month,
    );

    const finalAutoAdjustment = autoAdjustment + previousMonthAdjustment;

    // final_amount 재계산
    const finalAmount = invoice.base_amount + finalAutoAdjustment + invoice.manual_adjustment;

    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        auto_adjustment: finalAutoAdjustment,
        final_amount: finalAmount,
      },
    });
  }

  /**
   * 청구서 전송
   */
  async sendInvoices(userId: number, invoiceIds: number[], channel: 'sms' | 'kakao' | 'link') {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        id: {
          in: invoiceIds,
        },
        user_id: userId,
      },
      include: {
        contract: true,
        student: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
    });

    const results = [];

    for (const invoice of invoices) {
      const recipientTargets = invoice.contract.recipient_targets as string[];
      const sendHistory = invoice.send_history as any[] || [];

      // 전송 시점의 표시 기간 계산 (뷰티앱: 오직 선불 횟수 계약 로직만 사용)
      let displayPeriodStart: string | null = null;
      let displayPeriodEnd: string | null = null;
      
      const policySnapshot = invoice.contract.policy_snapshot as any;
      const totalSessions = typeof policySnapshot?.total_sessions === 'number' ? policySnapshot.total_sessions : 0;
      const isSessionBased = totalSessions > 0 && !invoice.contract.ended_at; // 횟수권
      const isAmountBased = invoice.contract.ended_at; // 금액권 (유효기간이 있음)

      // 날짜를 YYYY-MM-DD 문자열로 변환하는 헬퍼 함수
      const parseDateToLocalString = (dateValue: Date | string): string => {
        if (dateValue instanceof Date) {
          // UTC로 저장된 날짜를 로컬 시간대로 변환하여 표시
          const year = dateValue.getFullYear();
          const month = String(dateValue.getMonth() + 1).padStart(2, '0');
          const day = String(dateValue.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        }
        return dateValue.includes('T') ? dateValue.split('T')[0] : dateValue;
      };

      // 뷰티앱: 오직 선불 횟수 계약 로직만 사용
      if (isSessionBased) {
        // 횟수권: "(횟수)" 형식으로 표시
        const extensions = Array.isArray(policySnapshot?.extensions) ? policySnapshot.extensions : [];
        const existingInvoices = await this.prisma.invoice.findMany({
          where: {
            user_id: invoice.user_id,
            contract_id: invoice.contract_id,
          },
          orderBy: {
            created_at: 'asc',
          },
        });
        const currentInvoiceNumber = existingInvoices.findIndex((inv) => inv.id === invoice.id) + 1;
        let sessionCount = 0;
        if (currentInvoiceNumber === 1) {
          sessionCount = extensions.reduce((sum: number, ext: any) => sum - (ext.added_sessions || 0), totalSessions);
        } else if (currentInvoiceNumber > 1 && extensions.length >= currentInvoiceNumber - 1) {
          const extension = extensions[currentInvoiceNumber - 2];
          sessionCount = extension?.added_sessions || 0;
        } else {
          sessionCount = totalSessions;
        }
        displayPeriodStart = `${sessionCount}`;
        displayPeriodEnd = '회';
      } else if (isAmountBased && invoice.contract.started_at && invoice.contract.ended_at) {
        // 금액권: 유효기간(계약 시작일 ~ 계약 종료일) 표시 (표시용만)
        displayPeriodStart = parseDateToLocalString(invoice.contract.started_at);
        displayPeriodEnd = parseDateToLocalString(invoice.contract.ended_at);
      }

      // SMS 발송 (channel === 'sms'인 경우)
      let smsSuccess = false;
      if (channel === 'sms') {
        try {
          const recipientPhone = recipientTargets?.[0] || invoice.student?.phone;
          if (recipientPhone) {
            const apiBaseUrl = this.configService.get<string>('API_BASE_URL') || '';
            const invoiceLink = `${apiBaseUrl}/api/v1/invoices/${invoice.id}/view`;
            const message = `[Passbook] 청구서가 발행되었습니다.\n확인 링크: ${invoiceLink}`;
            
            const smsResult = await this.smsService.sendSms({
              to: recipientPhone,
              message,
            });

            if (smsResult.success) {
              smsSuccess = true;
              this.logger.log(`[Invoices] SMS sent successfully for invoice ${invoice.id} to ${recipientPhone}`);
            } else {
              this.logger.error(`[Invoices] SMS send failed for invoice ${invoice.id}: ${smsResult.error}`);
            }
          } else {
            this.logger.warn(`[Invoices] No recipient phone found for invoice ${invoice.id}`);
          }
        } catch (error: any) {
          // SMS 실패해도 청구서 상태 업데이트는 유지
          this.logger.error(`[Invoices] Failed to send SMS for invoice ${invoice.id}:`, error?.message || error);
        }
      }

      const sendResult = {
        invoice_id: invoice.id,
        student_name: invoice.student.name,
        success: channel === 'sms' ? smsSuccess : true, // SMS인 경우 실제 발송 성공 여부 반영
        sent_to: recipientTargets,
        channel,
        sent_at: new Date().toISOString(),
        display_period_start: displayPeriodStart, // 전송 시점의 표시 기간 시작일 저장
        display_period_end: displayPeriodEnd, // 전송 시점의 표시 기간 종료일 저장
      };

      sendHistory.push(sendResult);

      // Invoice 상태 업데이트
      await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          send_status: 'sent',
          send_to: recipientTargets,
          send_history: sendHistory,
        },
      });

      results.push(sendResult);
    }

    // 청구서 전송 완료 알림 (각 청구서마다 개별 알림 생성)
    for (const invoice of invoices) {
      try {
        const studentName = invoice.student.name;
        const year = invoice.year;
        const month = invoice.month;
        
        await this.notificationsService.createAndSendNotification(
          userId,
          'settlement',
          '청구서 전송 완료',
          `${studentName} 고객에게 ${year}년 ${month}월 청구서가 전송되었습니다.`,
          '/settlements',
          {
            relatedId: `invoice:${invoice.id}`,
          },
        );
      } catch (error) {
        // 알림 실패해도 전송 결과는 반환
        console.error('[Invoices] Failed to send notification:', error);
      }
    }

    return results;
  }

  /**
   * 전송 가능한 Invoice 목록 조회
   */
  async getSendableInvoices(userId: number) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const invoices = await this.prisma.invoice.findMany({
      where: {
        user_id: userId,
        year,
        month,
        send_status: {
          in: ['not_sent', 'partial'],
        },
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        contract: {
          select: {
            id: true,
            subject: true,
            recipient_targets: true,
          },
        },
      },
    });

    const sendable = [];
    const notSendable = [];

    for (const invoice of invoices) {
      const recipientTargets = invoice.contract.recipient_targets as string[];
      if (recipientTargets && recipientTargets.length > 0) {
        sendable.push(invoice);
      } else {
        notSendable.push(invoice);
      }
    }

    return {
      sendable,
      not_sendable: notSendable,
    };
  }

  /**
   * 지난 정산 목록 조회 (월 기준 그룹)
   */
  async getInvoiceHistory(userId: number, limitMonths = 3) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    const rawInvoices = await this.prisma.invoice.findMany({
      where: {
        user_id: userId,
        OR: [
          { year: { lt: currentYear } },
          {
            year: currentYear,
            month: { lt: currentMonth },
          },
        ],
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        contract: {
          select: {
            id: true,
            subject: true,
            policy_snapshot: true,
            billing_type: true,
            absence_policy: true,
            monthly_amount: true,
            recipient_policy: true,
            recipient_targets: true,
            day_of_week: true,
            started_at: true,
            ended_at: true,
          },
        },
      },
      orderBy: [
        { year: 'desc' },
        { month: 'desc' },
        { created_at: 'desc' },
      ],
    });

    const grouped = new Map<
      string,
      {
        year: number;
        month: number;
        invoices: any[];
      }
    >();
    const orderedKeys: string[] = [];

    for (const invoice of rawInvoices) {
      const key = `${invoice.year}-${String(invoice.month).padStart(2, '0')}`;

      if (!grouped.has(key)) {
        if (orderedKeys.length >= limitMonths) {
          break;
        }
        grouped.set(key, {
          year: invoice.year,
          month: invoice.month,
          invoices: [],
        });
        orderedKeys.push(key);
      }

      const group = grouped.get(key);
      if (group) {
        group.invoices.push({
          ...invoice,
          contract: {
            id: invoice.contract?.id,
            subject: invoice.contract?.subject,
            billing_type: invoice.contract?.billing_type,
            absence_policy: invoice.contract?.absence_policy,
            policy_snapshot: invoice.contract?.policy_snapshot,
            started_at: invoice.contract?.started_at,
            ended_at: invoice.contract?.ended_at,
          },
        });
      }
    }

    return orderedKeys
      .map((key) => grouped.get(key))
      .filter((group): group is { year: number; month: number; invoices: any[] } => Boolean(group));
  }

  /**
   * 정산 섹션별로 청구서 조회
   * - 정산중: 수업료 기간이 진행 중이거나 종료되었지만 청구일이 아직 도래하지 않음
   * - 오늘청구: 청구일이 도래했거나 지났지만 아직 전송되지 않음
   * - 전송한 청구서: 전송 완료된 청구서 (월별 그룹)
   */
  async getInvoicesBySections(userId: number) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    today.setHours(0, 0, 0, 0);

    // 뷰티앱에서는 일시납부 계약 처리가 필요 없음 (선불 횟수 계약만 사용)

    // 뷰티앱에서는 여러달 계약 자동 생성이 필요 없음 (선불 횟수 계약만 사용)

    // 뷰티앱에서는 후불 횟수제 연장 정산서 생성이 필요 없음 (선불 횟수 계약만 사용)

    // 뷰티앱에서는 후불 계약의 첫 정산서 생성이 필요 없음 (선불 횟수 계약만 사용)

    // 모든 활성 계약서의 청구서 조회 (전송 완료 포함)
    const allInvoices = await this.prisma.invoice.findMany({
      where: {
        user_id: userId,
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        contract: {
          select: {
            id: true,
            subject: true,
            billing_type: true,
            absence_policy: true,
            policy_snapshot: true,
            billing_day: true,
            started_at: true,
            ended_at: true,
            payment_schedule: true,
            status: true,
          },
        },
      },
      orderBy: [
        { year: 'desc' },
        { month: 'desc' },
        { created_at: 'desc' },
      ],
    });

    const inProgress: any[] = [];
    const todayBilling: any[] = [];
    const sentInvoices = new Map<string, { year: number; month: number; invoices: any[] }>();

    for (const invoice of allInvoices) {
      const contract = invoice.contract;

      // 전송 완료된 청구서는 "전송한 청구서" 섹션에 추가 (최우선 처리)
      // 확정 개념: 횟수계약은 정산중 섹션에 노출되지 않음
      if (invoice.send_status === 'sent') {
        const key = `${invoice.year}-${String(invoice.month).padStart(2, '0')}`;
        if (!sentInvoices.has(key)) {
          sentInvoices.set(key, {
            year: invoice.year,
            month: invoice.month,
            invoices: [],
          });
        }
        
        // 전송 시점에 저장된 표시 기간 정보 가져오기 (send_history의 마지막 항목)
        let displayPeriodStart: string | null = null;
        let displayPeriodEnd: string | null = null;
        const sendHistory = invoice.send_history as any[] || [];
        if (sendHistory.length > 0) {
          const lastSend = sendHistory[sendHistory.length - 1];
          displayPeriodStart = lastSend?.display_period_start || null;
          displayPeriodEnd = lastSend?.display_period_end || null;
        }
        
        // 전송한 청구서에 contract 정보 및 저장된 표시 기간 포함
        sentInvoices.get(key)?.invoices.push({
          ...invoice,
          contract: {
            id: invoice.contract?.id,
            subject: invoice.contract?.subject,
            billing_type: invoice.contract?.billing_type,
            absence_policy: invoice.contract?.absence_policy,
            policy_snapshot: invoice.contract?.policy_snapshot,
            started_at: invoice.contract?.started_at,
            ended_at: invoice.contract?.ended_at,
          },
          display_period_start: displayPeriodStart, // 전송 시점에 저장된 표시 기간 시작일
          display_period_end: displayPeriodEnd, // 전송 시점에 저장된 표시 기간 종료일
        });
        
        continue; // 전송 완료된 청구서는 여기서 종료
      }

      // force_to_today_billing이 true면 무조건 "오늘청구"에 포함 (전송 완료된 정산서 제외)
      if (invoice.force_to_today_billing) {
        console.log(`[InvoicesService] Invoice ${invoice.id} moved to todayBilling (force_to_today_billing=true)`);
        todayBilling.push(invoice);
        continue;
      }

      // 뷰티앱에서는 일시납부 계약, 후불 계약, 기간계약 처리가 필요 없음 (선불 횟수 계약만 사용)

      // 선불 횟수 계약 처리 (뷰티앱의 유일한 정산 로직)
      // 확정 개념: 선불 횟수 계약은 정산중 섹션에 노출되지 않음
      const policy = contract?.policy_snapshot as Record<string, any> | undefined;
      const totalSessions = typeof policy?.total_sessions === 'number' ? policy.total_sessions : 0;
      // 뷰티앱: 금액권과 횟수권 모두 선불 횟수 계약 로직 사용
      // 횟수권: totalSessions > 0 && !ended_at
      // 금액권: totalSessions === 0 && ended_at 또는 totalSessions > 0 && ended_at
      const isSessionBased = totalSessions > 0 && !contract?.ended_at; // 횟수권
      const isAmountBased = contract?.ended_at; // 금액권 (유효기간이 있음)
      const isPrepaidSessionBased = (isSessionBased || isAmountBased) && contract?.billing_type === 'prepaid';
      
      if (isPrepaidSessionBased) {
        // 선불 횟수계약/금액권: 첫번째 청구서는 계약서 전송 시점에 생성되어 "오늘청구"에 노출
        // 두번째/세번째 청구서는 생성 시점(해당 횟수 소진 시점 또는 연장 시점)부터 "오늘청구"에 노출
        if (invoice.send_status === 'not_sent') {
          todayBilling.push(invoice);
          continue;
        }
      }
    }

    // 전송한 청구서를 전송일 기준으로 정렬
    // 각 invoice의 send_history에서 마지막 sent_at을 추출하여 정렬
    const getLastSentAt = (invoice: any): Date => {
      const sendHistory = invoice.send_history as any[] || [];
      if (sendHistory.length > 0) {
        const lastSent = sendHistory[sendHistory.length - 1];
        if (lastSent?.sent_at) {
          return new Date(lastSent.sent_at);
        }
      }
      // send_history가 없으면 created_at 사용 (fallback)
      return new Date(invoice.created_at);
    };

    // 각 월별 그룹 내에서도 전송일 기준으로 정렬
    for (const group of sentInvoices.values()) {
      group.invoices.sort((a: any, b: any) => {
        const sentAtA = getLastSentAt(a);
        const sentAtB = getLastSentAt(b);
        return sentAtB.getTime() - sentAtA.getTime(); // 최신순
      });
    }

    // 월별 그룹 자체도 가장 최근 전송일 기준으로 정렬
    const sentInvoicesArray = Array.from(sentInvoices.values()).sort((a, b) => {
      // 각 그룹의 가장 최근 전송일 찾기
      const getGroupLatestSentAt = (group: { invoices: any[] }): Date => {
        if (group.invoices.length === 0) return new Date(0);
        const latestInvoice = group.invoices[0]; // 이미 정렬되어 있으므로 첫 번째가 최신
        return getLastSentAt(latestInvoice);
      };

      const latestA = getGroupLatestSentAt(a);
      const latestB = getGroupLatestSentAt(b);
      return latestB.getTime() - latestA.getTime(); // 최신순
    });

    return {
      inProgress,
      todayBilling,
      sentInvoices: sentInvoicesArray,
    };
  }

  /**
   * 계약서의 policy_snapshot과 기타 JSON 필드를 안전하게 정규화합니다.
   */
  private normalizeContract(contract: any) {
    const snapshot = (contract.policy_snapshot ?? {}) as Record<string, any>;

    const normalizedSnapshot = {
      billing_type: snapshot.billing_type ?? contract.billing_type,
      absence_policy: snapshot.absence_policy ?? contract.absence_policy,
      monthly_amount:
        typeof snapshot.monthly_amount === 'number'
          ? snapshot.monthly_amount
          : contract.monthly_amount,
      per_session_amount:
        typeof snapshot.per_session_amount === 'number'
          ? snapshot.per_session_amount
          : (contract as any).per_session_amount,
      payment_schedule: contract.payment_schedule ?? 'monthly',
      total_sessions:
        typeof snapshot.total_sessions === 'number'
          ? snapshot.total_sessions
          : (contract as any).total_sessions,
      recipient_policy: snapshot.recipient_policy ?? contract.recipient_policy ?? 'student_only',
      recipient_targets:
        Array.isArray(snapshot.recipient_targets)
          ? snapshot.recipient_targets
          : Array.isArray(contract.recipient_targets)
          ? contract.recipient_targets
          : [],
      // extensions 배열 포함 (연장 정산서 금액 계산에 필요)
      extensions: Array.isArray(snapshot.extensions) ? snapshot.extensions : [],
    };

    return {
      ...contract,
      policy_snapshot: normalizedSnapshot,
      day_of_week: Array.isArray(contract.day_of_week) ? contract.day_of_week : [],
      billing_day: contract.billing_day ?? null,
      payment_schedule: contract.payment_schedule ?? 'monthly',
    };
  }

  /**
   * 청구서 HTML 생성 (공개 엔드포인트)
   */
  async generateInvoiceHtml(invoiceId: number): Promise<string> {
    // 공개 엔드포인트: userId 검증 없이 청구서 조회
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        contract: {
          select: {
            id: true,
            subject: true,
            billing_type: true,
            policy_snapshot: true,
            started_at: true,
            ended_at: true,
            billing_day: true,
            payment_schedule: true,
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('청구서를 찾을 수 없습니다.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: invoice.user_id },
      select: { name: true, org_code: true, settings: true },
    });

    const businessName = user?.org_code || '김쌤';

    // 일시납부 계약 확인 (월단위 로직과 완전 분리)
    const isLumpSum = invoice.contract.payment_schedule === 'lump_sum';
    
    // 횟수제 계약 확인 (금액권 포함)
    const policySnapshot = invoice.contract.policy_snapshot as any;
    const totalSessions = typeof policySnapshot?.total_sessions === 'number' ? policySnapshot.total_sessions : 0;
    // 뷰티앱: 금액권과 횟수권 모두 선불 횟수 계약 로직 사용
    // 횟수권: totalSessions > 0 && !ended_at
    // 금액권: totalSessions === 0 && ended_at 또는 totalSessions > 0 && ended_at
    const isSessionBased = totalSessions > 0 && !invoice.contract.ended_at; // 횟수권
    const isAmountBased = invoice.contract.ended_at && invoice.contract.billing_type === 'prepaid'; // 금액권 (유효기간이 있고 선불)
    const isPrepaidSessionBased = (isSessionBased || isAmountBased); // 선불 횟수 계약 또는 금액권

    // 청구월 계산
    // 확정 개념: period_start/period_end는 출결 기록 필터링용
    // 청구서 표시 기간은 실제 수업료에 해당하는 기간(계약 시작일~종료일)
    // 선불 횟수제 계약: "청구월 (횟수)" 형식
    // 선불 금액권: "청구월" 형식 (기간 표시 없음)
    let billingMonthText = '';
    
    // 일시납부 계약: 계약 기간 전체를 표시 (월단위 로직과 완전 분리)
    if (isLumpSum && invoice.contract.started_at && invoice.contract.ended_at) {
      const parseDate = (dateValue: Date | string): { year: number; month: number; day: number } => {
        if (dateValue instanceof Date) {
          // UTC로 저장된 날짜를 로컬 시간대로 변환하여 표시
          // 예: 2025-12-17T15:00:00.000Z (한국 시간 12-18 00:00) -> 12월 18일로 표시
          return {
            year: dateValue.getFullYear(),
            month: dateValue.getMonth() + 1,
            day: dateValue.getDate(),
          };
        } else {
          const date = new Date(dateValue);
          return {
            year: date.getFullYear(),
            month: date.getMonth() + 1,
            day: date.getDate(),
          };
        }
      };
      
      const startDate = parseDate(invoice.contract.started_at);
      const endDate = parseDate(invoice.contract.ended_at);
      
      const startYearShort = String(startDate.year).slice(-2);
      const endYearShort = String(endDate.year).slice(-2);
      billingMonthText = `${invoice.year}년${invoice.month}월 (${startYearShort}.${startDate.month}.${startDate.day}일~${endYearShort}.${endDate.month}.${endDate.day}일)`;
    } else if (isPrepaidSessionBased) {
      // 선불 횟수 계약 또는 금액권: "청구월" 또는 "청구월 (횟수)" 형식
      if (isAmountBased) {
        // 금액권: "청구월" 형식만 표시 (기간 표시 없음)
        billingMonthText = `${invoice.year}년 ${invoice.month}월`;
      } else if (isSessionBased) {
        // 횟수제 계약(선불/후불 공통): "청구월 (횟수)" 형식
        // 연장 이력 확인하여 현재 정산서가 몇 번째인지 확인
        const extensions = Array.isArray(policySnapshot?.extensions) ? policySnapshot.extensions : [];
        const existingInvoices = await this.prisma.invoice.findMany({
          where: {
            user_id: invoice.user_id,
            contract_id: invoice.contract_id,
          },
          orderBy: {
            created_at: 'asc',
          },
        });
        
        const currentInvoiceNumber = existingInvoices.findIndex(inv => inv.id === invoice.id) + 1;
        let sessionCount = 0;
        
        if (currentInvoiceNumber === 1) {
          // 첫 계약: 총 횟수에서 연장 횟수 제외
          sessionCount = extensions.reduce((sum: number, ext: any) => {
            return sum - (ext.added_sessions || 0);
          }, totalSessions);
        } else if (currentInvoiceNumber > 1 && extensions.length >= currentInvoiceNumber - 1) {
          // 연장 계약: 해당 연장으로 추가된 횟수
          const extension = extensions[currentInvoiceNumber - 2];
          sessionCount = extension?.added_sessions || 0;
        } else {
          // 기본값: 총 횟수 사용
          sessionCount = totalSessions;
        }
        
        billingMonthText = `${invoice.year}년 ${invoice.month}월 (${sessionCount}회)`;
      }
    } else if (invoice.period_start && invoice.period_end && invoice.contract.started_at && invoice.contract.ended_at) {
      // 첫 정산서 판단: period_start와 period_end가 같은 날인지 확인
      // Prisma Date 객체를 안전하게 날짜 문자열로 변환하여 비교
      const parseDateToLocalString = (dateValue: Date | string): string => {
        if (dateValue instanceof Date) {
          // Date 객체를 로컬 시간대 기준으로 YYYY-MM-DD 문자열로 변환
          const year = dateValue.getFullYear();
          const month = String(dateValue.getMonth() + 1).padStart(2, '0');
          const day = String(dateValue.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        } else {
          // 문자열인 경우 날짜 부분만 추출
          return dateValue.includes('T') ? dateValue.split('T')[0] : dateValue;
        }
      };
      
      const periodStartStr = parseDateToLocalString(invoice.period_start);
      const periodEndStr = parseDateToLocalString(invoice.period_end);
      const isFirstInvoice = periodStartStr === periodEndStr;
      const isPostpaid = invoice.contract.billing_type === 'postpaid';
      
      // 후불의 경우: period_start~period_end를 그대로 표시 (출결기록 기간 = 청구서 표시 기간)
      if (isPostpaid && invoice.period_start && invoice.period_end) {
        const parseDate = (dateValue: Date | string): { year: number; month: number; day: number } => {
          if (dateValue instanceof Date) {
            return {
              year: dateValue.getFullYear(),
              month: dateValue.getMonth() + 1,
              day: dateValue.getDate(),
            };
          } else {
            const dateStr = dateValue.includes('T') ? dateValue.split('T')[0] : dateValue;
            const [year, month, day] = dateStr.split('-').map(Number);
            return { year, month, day };
          }
        };
        
        const startDate = parseDate(invoice.period_start);
        const endDate = parseDate(invoice.period_end);
        
        const startYearShort = String(startDate.year).slice(-2);
        const endYearShort = String(endDate.year).slice(-2);
        billingMonthText = `${invoice.year}년${invoice.month}월 (${startYearShort}.${startDate.month}.${startDate.day}일~${endYearShort}.${endDate.month}.${endDate.day}일)`;
      } else if (isFirstInvoice) {
        // 선불 첫 정산서: 계약 시작일~다음 달 청구일 하루 전 표시
        // 확정 개념: 첫 정산서는 12.9~1.8일분 (계약 시작일~다음 달 청구일 하루 전)
        // 중요: period_start/period_end는 출결 기록 필터링용(계약 시작일 하루 전)
        // 청구서 표시 기간은 계약 시작일~다음 달 청구일 하루 전을 사용해야 함
        const parseContractDate = (dateValue: Date | string): { year: number; month: number; day: number } => {
          let dateStr: string;
          
          if (dateValue instanceof Date) {
            // Date 객체인 경우: 로컬 시간대 기준으로 날짜 문자열 추출
            // ISO 문자열로 변환하면 UTC 기준이 되므로, 직접 로컬 시간대 기준으로 추출
            const year = dateValue.getFullYear();
            const month = dateValue.getMonth() + 1;
            const day = dateValue.getDate();
            return { year, month, day };
          } else {
            // 문자열인 경우: 날짜 부분만 추출
            dateStr = dateValue.includes('T') ? dateValue.split('T')[0] : dateValue;
            const [year, month, day] = dateStr.split('-').map(Number);
            return { year, month, day };
          }
        };
        
        // 계약 시작일을 안전하게 파싱
        const startDate = parseContractDate(invoice.contract.started_at);
        
        // 다음 달 청구일 하루 전 계산
        const contract = invoice.contract;
        // billing_day는 contract 테이블에 직접 저장되어 있음 (계약 시작일의 일자)
        const billingDay = contract.billing_day || 7;
        
        // 계약 시작일의 다음 달 계산
        const nextMonth = startDate.month === 12 ? 1 : startDate.month + 1;
        const nextYear = startDate.month === 12 ? startDate.year + 1 : startDate.year;
        const displayEnd = new Date(nextYear, nextMonth - 1, billingDay);
        displayEnd.setDate(displayEnd.getDate() - 1); // 다음 달 청구일 하루 전
        
        const startYearShort = String(startDate.year).slice(-2);
        const endYearShort = String(displayEnd.getFullYear()).slice(-2);
        billingMonthText = `${invoice.year}년${invoice.month}월 (${startYearShort}.${startDate.month}.${startDate.day}일~${endYearShort}.${displayEnd.getMonth() + 1}.${displayEnd.getDate()}일)`;
      } else {
        // 선불 두번째 이상 정산서: period_start/period_end 사용 (마감일 다음날~다음 달 청구일)
        // 후불은 위에서 이미 처리됨 (period_start~period_end 그대로 표시)
        if (!isPostpaid) {
          const startDate = new Date(invoice.period_start);
          const endDate = new Date(invoice.period_end);
          
          // UTC로 저장된 경우를 고려하여 로컬 시간대로 변환
          const startLocal = new Date(
            startDate.getUTCFullYear(),
            startDate.getUTCMonth(),
            startDate.getUTCDate(),
            0, 0, 0, 0
          );
          const endLocal = new Date(
            endDate.getUTCFullYear(),
            endDate.getUTCMonth(),
            endDate.getUTCDate(),
            0, 0, 0, 0
          );
          
          // 마감일 다음날이 표시 시작일
          const displayStart = new Date(endLocal);
          displayStart.setDate(displayStart.getDate() + 1);
          
          // 표시 종료일은 다음 달의 청구일 (계약의 billing_day 사용)
          const contract = invoice.contract;
          const policySnapshot = contract.policy_snapshot as any;
          const billingDay = policySnapshot?.billing_day || 7;
          const nextMonth = displayStart.getMonth() + 1;
          const nextYear = nextMonth === 12 ? displayStart.getFullYear() + 1 : displayStart.getFullYear();
          const adjustedMonth = nextMonth === 12 ? 0 : nextMonth;
          const displayEnd = new Date(nextYear, adjustedMonth, billingDay);
          
          const startYear = displayStart.getFullYear();
          const startMonth = displayStart.getMonth() + 1;
          const startDay = displayStart.getDate();
          const endYear = displayEnd.getFullYear();
          const endMonth = displayEnd.getMonth() + 1;
          const endDay = displayEnd.getDate();
          
          const startYearShort = String(startYear).slice(-2);
          const endYearShort = String(endYear).slice(-2);
          billingMonthText = `${invoice.year}년${invoice.month}월 (${startYearShort}.${startMonth}.${startDay}일~${endYearShort}.${endMonth}.${endDay}일)`;
        }
      }
    } else {
      // period_start/period_end가 없는 경우 기존 로직 사용
      const billingType = invoice.contract.billing_type;
      if (billingType === 'prepaid') {
        const nextMonth = invoice.month === 12 ? 1 : invoice.month + 1;
        const nextYear = invoice.month === 12 ? invoice.year + 1 : invoice.year;
        billingMonthText = `${invoice.year}년 ${invoice.month}월(${nextYear}년 ${nextMonth}월분)`;
      } else {
        billingMonthText = `${invoice.year}년 ${invoice.month}월(${invoice.month}월분)`;
      }
    }

    // 자동 조정 사유 계산
    let autoAdjustmentDetail = '';
    if (invoice.auto_adjustment < 0) {
      const policySnapshot = invoice.contract.policy_snapshot as any;
      const perSession = policySnapshot?.per_session_amount;
      if (perSession && perSession > 0) {
        const absentCount = Math.round(Math.abs(invoice.auto_adjustment) / perSession);
        if (absentCount > 0) {
          autoAdjustmentDetail = `(결석 ${absentCount}회 차감)`;
        }
      }
    }

    // 계좌 정보 (우선순위: account_snapshot > policy_snapshot > user.settings)
    let accountSnapshot = invoice.account_snapshot as any;
    const policyAccountInfo = (invoice.contract.policy_snapshot as any)?.account_info;
    const userSettings = user?.settings as any;
    const userAccountInfo = userSettings?.account_info;
    
    // account_snapshot이 없고 user.settings에 계좌정보가 있으면 업데이트
    if (!accountSnapshot && userAccountInfo) {
      try {
        await this.prisma.invoice.update({
          where: { id: invoiceId },
          data: { account_snapshot: userAccountInfo },
        });
        accountSnapshot = userAccountInfo;
      } catch (err) {
        console.error('[Invoice HTML] Failed to update account_snapshot', err);
      }
    }
    
    const accountInfo = accountSnapshot || policyAccountInfo || userAccountInfo || null;
    const bankName = accountInfo?.bank_name || '';
    const accountNumber = accountInfo?.account_number || '';
    const accountHolder = accountInfo?.account_holder || '';

    // 이용권 명과 이용권 내용 가져오기
    const contractSubject = invoice.contract.subject || '';
    const lessonNotes = (invoice.contract.policy_snapshot as any)?.lesson_notes || null;
    
    const html = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>청구서</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background-color: #f2f2f7;
      padding: 16px;
      line-height: 1.6;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 16px;
      padding: 0;
      box-shadow: 0 2px 10px rgba(0,0,0,0.05);
      overflow: hidden;
    }
    .header {
      background-color: #0f1b4d;
      color: #ffffff;
      padding: 14px 20px;
      text-align: center;
    }
    .header-slogan {
      font-size: 13px;
      color: rgba(255, 255, 255, 0.9);
      margin-bottom: 6px;
      font-weight: 400;
    }
    .header-title {
      font-size: 28px;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 2px;
      letter-spacing: -0.5px;
    }
    .header-subtitle {
      font-size: 16px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.95);
      margin-top: 2px;
    }
    .footer-note {
      font-size: 12px;
      color: #ffffff;
      text-align: center;
      margin: 24px -24px -24px;
      padding: 16px 24px;
      background-color: #0f1b4d;
      line-height: 1.6;
    }
    .billing-info {
      padding: 16px 20px;
      background-color: #ffffff;
    }
    .info-section {
      margin-bottom: 16px;
    }
    .info-section-title {
      font-size: 16px;
      font-weight: 700;
      color: #111111;
      margin-bottom: 12px;
    }
    .info-section-value {
      font-size: 16px;
      font-weight: 600;
      color: #111111;
      line-height: 1.5;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 10px;
    }
    .info-row:last-child {
      margin-bottom: 0;
    }
    .info-label {
      font-size: 14px;
      color: #666666;
      flex: 0 0 100px;
    }
    .info-value {
      font-size: 14px;
      color: #111111;
      font-weight: 500;
      flex: 1;
      text-align: right;
    }
    .amount-info {
      background-color: #f9f9f9;
      padding: 14px 16px;
      border-radius: 12px;
      margin-bottom: 12px;
    }
    .amount-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .amount-row:last-of-type {
      margin-bottom: 0;
    }
    .amount-label {
      font-size: 14px;
      color: #666666;
    }
    .amount-value {
      font-size: 14px;
      color: #000000;
      font-weight: 500;
    }
    .final-amount {
      font-size: 18px;
      font-weight: 700;
      color: #1d42d8;
      margin-top: 6px;
      text-align: right;
      padding-top: 6px;
      border-top: 1px solid #e0e0e0;
    }
    .account-section {
      margin-top: 0;
      padding-top: 0;
      border-top: none;
    }
    .account-title {
      font-size: 16px;
      font-weight: 600;
      color: #111111;
      margin-bottom: 6px;
    }
    .account-info {
      font-size: 14px;
      color: #333333;
      margin-bottom: 4px;
    }
    .account-number {
      font-size: 16px;
      font-weight: 600;
      color: #1d42d8;
      margin-bottom: 4px;
      cursor: pointer;
      user-select: all;
      -webkit-user-select: all;
      padding: 10px 12px;
      background-color: #f0f4ff;
      border-radius: 8px;
      display: inline-block;
      transition: background-color 0.2s;
    }
    .account-number:hover {
      background-color: #e0e9ff;
    }
    .account-number:active {
      background-color: #cce0ff;
    }
    .copy-hint {
      font-size: 12px;
      color: #666666;
      margin-top: 8px;
      font-style: normal;
    }
    .divider {
      height: 1px;
      background-color: #f0f0f3;
      margin: 16px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-slogan">샵과 고객 모두 만족하는 투명한 이용권 관리</div>
      <div class="header-title">Pass Book</div>
      <div class="header-subtitle">청구서</div>
    </div>

    <div class="billing-info">
      <div class="info-section">
        <div class="info-section-title">청구정보</div>
        <div class="info-row">
          <div class="info-label">수강생명</div>
          <div class="info-value">${invoice.student.name}</div>
        </div>
        <div class="info-row">
          <div class="info-label">상호명</div>
          <div class="info-value">${businessName}</div>
        </div>
        <div class="info-row">
          <div class="info-label">청구 월</div>
          <div class="info-value">${billingMonthText}</div>
        </div>
        ${contractSubject ? `
        <div class="info-row">
          <div class="info-label">이용권 명</div>
          <div class="info-value">${contractSubject}</div>
        </div>
        ` : ''}
        ${lessonNotes ? `
        <div class="info-row">
          <div class="info-label">이용권 내용</div>
          <div class="info-value">${lessonNotes}</div>
        </div>
        ` : ''}
      </div>
    </div>

    <div class="billing-info">
      <div class="info-section-title">청구금액</div>
      <div class="amount-info">
      <div class="amount-row">
        <div class="amount-label">계약금액</div>
        <div class="amount-value">${invoice.base_amount.toLocaleString()}원</div>
      </div>
      <div class="amount-row">
        <div class="amount-label">차감금액 ${autoAdjustmentDetail}</div>
        <div class="amount-value">${invoice.auto_adjustment >= 0 ? '+' : ''}${invoice.auto_adjustment.toLocaleString()}원</div>
      </div>
      ${invoice.manual_adjustment != null && invoice.manual_adjustment !== 0 ? `
      <div class="amount-row">
        <div class="amount-label">수동 조정${invoice.manual_reason ? ` <span style="color: ${invoice.manual_adjustment < 0 ? '#ff3b30' : '#007AFF'}; font-weight: 500;">(${invoice.manual_reason})</span>` : ''}</div>
        <div class="amount-value" style="color: ${invoice.manual_adjustment < 0 ? '#ff3b30' : '#007AFF'};">
          ${invoice.manual_adjustment >= 0 ? '+' : ''}${invoice.manual_adjustment.toLocaleString()}원
        </div>
      </div>
      ` : ''}
      <div class="final-amount">최종 금액: ${invoice.final_amount.toLocaleString()}원</div>
      </div>
    </div>

    <div class="billing-info">
      <div class="info-section">
        <div class="info-section-title">입금계좌</div>
        <div class="account-section">
      ${bankName ? `<div class="account-info">${bankName}</div>` : '<div class="account-info" style="color: #999;">은행 정보 없음</div>'}
      ${accountNumber ? `
        <div class="account-number" onclick="copyAccountNumber('${accountNumber}')" id="account-number">${accountNumber}</div>
      ` : '<div class="account-info" style="color: #999;">계좌번호 없음</div>'}
      ${accountHolder ? `<div class="account-info">예금주: ${accountHolder}</div>` : '<div class="account-info" style="color: #999;">예금주 정보 없음</div>'}
      ${accountNumber ? `<div class="copy-hint">(계좌번호를 터치하여 복사할 수 있습니다.)</div>` : ''}
        </div>
      </div>
      <div class="footer-note">"본 청구서는 패스 북 시스템을 통해 자동 계산되어<br>발송된 청구서입니다."</div>
    </div>
  </div>
  <script>
    function copyAccountNumber(accountNumber) {
      const element = document.getElementById('account-number');
      
      // Clipboard API 사용 시도
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(accountNumber).then(function() {
          if (element) {
            const originalText = element.textContent;
            element.textContent = '복사되었습니다!';
            element.style.backgroundColor = '#d4edda';
            setTimeout(function() {
              element.textContent = originalText;
              element.style.backgroundColor = '#f0f7ff';
            }, 1500);
          }
        }).catch(function(err) {
          console.error('복사 실패:', err);
          // Clipboard API 실패 시 fallback 사용
          fallbackCopy(accountNumber, element);
        });
      } else {
        // Clipboard API를 지원하지 않는 경우 fallback 사용
        fallbackCopy(accountNumber, element);
      }
    }
    
    function fallbackCopy(accountNumber, element) {
      // textarea를 사용한 복사 방법
      const textArea = document.createElement('textarea');
      textArea.value = accountNumber;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      textArea.style.top = '-9999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      try {
        const successful = document.execCommand('copy');
        if (successful && element) {
          const originalText = element.textContent;
          element.textContent = '복사되었습니다!';
          element.style.backgroundColor = '#d4edda';
          setTimeout(function() {
            element.textContent = originalText;
            element.style.backgroundColor = '#f0f7ff';
          }, 1500);
        } else {
          // 복사 실패 시 계좌번호를 선택 가능하게 표시
          if (element) {
            element.style.userSelect = 'text';
            element.style.webkitUserSelect = 'text';
            alert('계좌번호를 선택하여 복사해주세요: ' + accountNumber);
          }
        }
      } catch (err) {
        console.error('복사 실패:', err);
        if (element) {
          element.style.userSelect = 'text';
          element.style.webkitUserSelect = 'text';
          alert('계좌번호를 선택하여 복사해주세요: ' + accountNumber);
        }
      }
      
      document.body.removeChild(textArea);
    }
  </script>
</body>
</html>
    `.trim();

    return html;
  }
}
