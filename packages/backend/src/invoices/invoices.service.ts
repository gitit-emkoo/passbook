import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceCalculationService } from './invoice-calculation.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class InvoicesService {
  constructor(
    private prisma: PrismaService,
    private calculationService: InvoiceCalculationService,
    private notificationsService: NotificationsService,
  ) {}

  /**
   * 이번 달 정산 목록 조회 (on-demand 생성)
   * 해당 월의 invoice가 없으면 생성
   */
  async getCurrentMonthInvoices(userId: number) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    // 활성화된 계약서 조회
    const contracts = await this.prisma.contract.findMany({
      where: {
        user_id: userId,
        status: {
          in: ['confirmed', 'sent'],
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
            phone: true,
          },
        },
      },
    });

    const invoices = [];

    for (const rawContract of contracts) {
      const contract = this.normalizeContract(rawContract);
      // 이미 invoice가 있는지 확인
      let invoice = await this.prisma.invoice.findUnique({
        where: {
          student_id_contract_id_year_month: {
            student_id: contract.student_id,
            contract_id: contract.id,
            year,
            month,
          },
        },
      });

      // 없으면 생성
      if (!invoice) {
        invoice = await this.createInvoiceForContract(userId, contract, year, month);
      }

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

    return invoices;
  }

  /**
   * 특정 계약서의 해당 월 invoice 생성
   */
  private async createInvoiceForContract(
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

    // auto_adjustment 계산
    const autoAdjustment = this.calculationService.calculateAutoAdjustment(
      normalizedContract,
      attendanceLogs,
      year,
      month,
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

    // period_start, period_end 계산 (계약 기간과 billing_day 기준)
    let periodStart: Date | null = null;
    let periodEnd: Date | null = null;
    const billingDay = normalizedContract.billing_day;
    const contractStartDate = normalizedContract.started_at
      ? new Date(normalizedContract.started_at)
      : null;
    const contractEndDate = normalizedContract.ended_at
      ? new Date(normalizedContract.ended_at)
      : null;

    if (billingDay && billingDay >= 1 && billingDay <= 31) {
      // period_start: 이전 달의 billing_day
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;
      const billingDayStart = new Date(prevYear, prevMonth - 1, billingDay);
      billingDayStart.setHours(0, 0, 0, 0);

      // period_end: 이번 달의 billing_day
      const billingDayEnd = new Date(year, month - 1, billingDay);
      billingDayEnd.setHours(23, 59, 59, 999);

      // 계약 시작일이 있으면 period_start는 계약 시작일과 billing_day 중 더 늦은 날짜
      if (contractStartDate) {
        contractStartDate.setHours(0, 0, 0, 0);
        periodStart = contractStartDate > billingDayStart ? contractStartDate : billingDayStart;
      } else {
        periodStart = billingDayStart;
      }

      // 계약 종료일이 있으면 period_end는 계약 종료일과 billing_day 중 더 이른 날짜
      if (contractEndDate) {
        contractEndDate.setHours(23, 59, 59, 999);
        periodEnd = contractEndDate < billingDayEnd ? contractEndDate : billingDayEnd;
      } else {
        periodEnd = billingDayEnd;
      }
    } else {
      // billing_day가 없으면 계약 기간을 그대로 사용
      if (contractStartDate) {
        periodStart = new Date(contractStartDate);
        periodStart.setHours(0, 0, 0, 0);
      }
      if (contractEndDate) {
        periodEnd = new Date(contractEndDate);
        periodEnd.setHours(23, 59, 59, 999);
      }
    }

    return this.prisma.invoice.create({
      data: {
        user_id: userId,
        student_id: normalizedContract.student_id,
        contract_id: normalizedContract.id,
        year,
        month,
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
   * 특정 계약/연-월의 인보이스를 재계산하여 upsert
   */
  async recalculateForContractMonth(userId: number, contractId: number, occurredAt: Date) {
    const year = occurredAt.getFullYear();
    const month = occurredAt.getMonth() + 1;

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

    // 해당 월의 Attendance 로그
    const attendanceLogs = await this.prisma.attendanceLog.findMany({
      where: { user_id: userId, contract_id: contract.id, voided: false },
    });

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
      account_snapshot: accountInfo,
    };

    const existing = await this.prisma.invoice.findUnique({
      where: {
        student_id_contract_id_year_month: {
          student_id: contract.student_id,
          contract_id: contract.id,
          year,
          month,
        },
      },
    });
    if (!existing) {
      return this.prisma.invoice.create({
        data: { ...invoiceData, send_status: 'not_sent' },
      });
    }
    return this.prisma.invoice.update({
      where: { id: existing.id },
      data: {
        auto_adjustment: finalAutoAdjustment,
        final_amount: baseAmount + finalAutoAdjustment + existing.manual_adjustment,
        base_amount: baseAmount,
        planned_count: plannedCount,
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

      // TODO: 실제 SMS/Kakao 전송 로직 구현
      // 현재는 상태만 업데이트
      const sendResult = {
        invoice_id: invoice.id,
        student_name: invoice.student.name,
        success: true,
        sent_to: recipientTargets,
        channel,
        sent_at: new Date().toISOString(),
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
          `${studentName} 수강생에게 ${year}년 ${month}월 청구서가 전송되었습니다.`,
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
      const billingDay = contract?.billing_day;
      const periodEnd = invoice.period_end ? new Date(invoice.period_end) : null;
      const periodStart = invoice.period_start ? new Date(invoice.period_start) : null;

      // 전송 완료된 청구서는 "전송한 청구서" 섹션에 추가
      if (invoice.send_status === 'sent') {
        const key = `${invoice.year}-${String(invoice.month).padStart(2, '0')}`;
        if (!sentInvoices.has(key)) {
          sentInvoices.set(key, {
            year: invoice.year,
            month: invoice.month,
            invoices: [],
          });
        }
        sentInvoices.get(key)?.invoices.push(invoice);
        continue;
      }

      // 청구일 계산 (해당 invoice의 year/month 기준)
      let billingDate: Date | null = null;
      if (billingDay && billingDay >= 1 && billingDay <= 31) {
        // 해당 invoice의 year/month의 billing_day가 청구일
        billingDate = new Date(invoice.year, invoice.month - 1, billingDay);
        billingDate.setHours(0, 0, 0, 0);
      }

      // 계약 종료일 확인
      const contractEndDate = contract?.ended_at
        ? new Date(contract.ended_at)
        : null;
      if (contractEndDate) {
        contractEndDate.setHours(0, 0, 0, 0);
      }

      // period_end가 있고 아직 지나지 않았으면 "정산중"
      if (periodEnd && periodEnd > now) {
        inProgress.push(invoice);
        continue;
      }

      // 후불 계약이고 계약 종료일이 오늘이면 "오늘청구" (마지막 청구서)
      if (
        contract?.billing_type === 'postpaid' &&
        contractEndDate &&
        today.getTime() === contractEndDate.getTime()
      ) {
        todayBilling.push(invoice);
        continue;
      }

      // 청구일이 도래했거나 지났으면 "오늘청구"
      if (billingDate && today >= billingDate) {
        todayBilling.push(invoice);
        continue;
      }

      // period_end가 지났지만 청구일이 아직 도래하지 않았으면 "정산중"
      if (periodEnd && periodEnd <= now && billingDate && today < billingDate) {
        inProgress.push(invoice);
        continue;
      }

      // period_end가 없거나 billing_day가 없으면 기본적으로 "정산중"에 포함
      if (!periodEnd || !billingDay) {
        inProgress.push(invoice);
      }
    }

    // 전송한 청구서를 월별로 정렬
    const sentInvoicesArray = Array.from(sentInvoices.values()).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
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
    };

    return {
      ...contract,
      policy_snapshot: normalizedSnapshot,
      day_of_week: Array.isArray(contract.day_of_week) ? contract.day_of_week : [],
      billing_day: contract.billing_day ?? null,
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
            billing_type: true,
            policy_snapshot: true,
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

    // 청구월 계산 (선불/후불에 따라)
    const billingType = invoice.contract.billing_type;
    let billingMonthText = '';
    if (billingType === 'prepaid') {
      // 선불: 출결 기준 월 표시, 청구 대상은 다음 달 (예: 11월(12월분))
      const nextMonth = invoice.month === 12 ? 1 : invoice.month + 1;
      const nextYear = invoice.month === 12 ? invoice.year + 1 : invoice.year;
      billingMonthText = `${invoice.year}년 ${invoice.month}월(${nextYear}년 ${nextMonth}월분)`;
    } else {
      // 후불: 현재 달 표시 (예: 11월(11월분))
      billingMonthText = `${invoice.year}년 ${invoice.month}월(${invoice.month}월분)`;
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
        console.log('[Invoice HTML] Updated account_snapshot from user.settings');
      } catch (err) {
        console.error('[Invoice HTML] Failed to update account_snapshot', err);
      }
    }
    
    const accountInfo = accountSnapshot || policyAccountInfo || userAccountInfo || null;
    const bankName = accountInfo?.bank_name || '';
    const accountNumber = accountInfo?.account_number || '';
    const accountHolder = accountInfo?.account_holder || '';

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
      padding: 20px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.05);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 2px solid #f0f0f3;
    }
    .header-title {
      font-size: 24px;
      font-weight: 700;
      color: #111111;
      margin-bottom: 8px;
    }
    .billing-month {
      font-size: 16px;
      color: #666666;
      margin-top: 8px;
    }
    .amount-info {
      background-color: #f9f9f9;
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    .amount-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
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
      font-size: 20px;
      font-weight: bold;
      color: #007AFF;
      margin-top: 12px;
      text-align: right;
      padding-top: 12px;
      border-top: 1px solid #e0e0e0;
    }
    .account-section {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #f0f0f3;
    }
    .account-title {
      font-size: 16px;
      font-weight: 600;
      color: #111111;
      margin-bottom: 12px;
    }
    .account-info {
      font-size: 14px;
      color: #333333;
      margin-bottom: 4px;
    }
    .account-number {
      font-size: 16px;
      font-weight: 600;
      color: #007AFF;
      margin-bottom: 4px;
      cursor: pointer;
      user-select: all;
      -webkit-user-select: all;
      padding: 8px;
      background-color: #f0f7ff;
      border-radius: 8px;
      display: inline-block;
      transition: background-color 0.2s;
    }
    .account-number:hover {
      background-color: #e0efff;
    }
    .account-number:active {
      background-color: #cce5ff;
    }
    .copy-hint {
      font-size: 12px;
      color: #666666;
      margin-top: 4px;
      font-style: italic;
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
      <div class="header-title">청구서 (${businessName})</div>
      <div class="billing-month">${billingMonthText}</div>
    </div>

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

    <div class="account-section">
      <div class="account-title">입금 계좌</div>
      ${bankName ? `<div class="account-info">${bankName}</div>` : '<div class="account-info" style="color: #999;">은행 정보 없음</div>'}
      ${accountNumber ? `
        <div class="account-number" onclick="copyAccountNumber('${accountNumber}')" id="account-number">${accountNumber}</div>
        <div class="copy-hint">계좌번호를 탭하면 복사됩니다</div>
      ` : '<div class="account-info" style="color: #999;">계좌번호 없음</div>'}
      ${accountHolder ? `<div class="account-info">예금주: ${accountHolder}</div>` : '<div class="account-info" style="color: #999;">예금주 정보 없음</div>'}
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
