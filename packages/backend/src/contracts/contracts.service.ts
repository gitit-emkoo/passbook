import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContractDto, BillingType, AbsencePolicy, ContractStatus } from './dto/create-contract.dto';
import { UpdateContractStatusDto } from './dto/update-contract-status.dto';
import { ExtendContractDto } from './dto/extend-contract.dto';
import { Prisma } from '@prisma/client';
import { InvoicesService } from '../invoices/invoices.service';

@Injectable()
export class ContractsService {
  constructor(
    private prisma: PrismaService,
    private invoicesService: InvoicesService,
  ) {}

  /**
   * 계약서 생성
   * policy_snapshot을 생성 시점에 고정 저장
   */
  async create(userId: number, dto: CreateContractDto) {
    // 수강생이 해당 사용자의 것인지 확인
    const student = await this.prisma.student.findFirst({
      where: {
        id: dto.student_id,
        user_id: userId,
      },
    });

    if (!student) {
      throw new NotFoundException('수강생을 찾을 수 없습니다.');
    }

    // policy_snapshot 생성 (생성 시점 규정 고정 저장)
    // 프론트에서 전송한 policy_snapshot이 있으면 그대로 사용, 없으면 새로 생성
    const frontendSnapshot = (dto as any).policy_snapshot || {};
    const policySnapshot = {
      billing_type: dto.billing_type,
      absence_policy: dto.absence_policy,
      monthly_amount: dto.monthly_amount,
      recipient_policy: dto.recipient_policy,
      recipient_targets: dto.recipient_targets,
      // 프론트에서 전송한 횟수제 정보 포함 (total_sessions, per_session_amount)
      ...(frontendSnapshot.total_sessions ? { total_sessions: frontendSnapshot.total_sessions } : {}),
      ...(frontendSnapshot.per_session_amount ? { per_session_amount: frontendSnapshot.per_session_amount } : {}),
      ...(frontendSnapshot.planned_count_override ? { planned_count_override: frontendSnapshot.planned_count_override } : {}),
      // 계좌 정보 포함
      ...(frontendSnapshot.account_info ? { account_info: frontendSnapshot.account_info } : {}),
      created_at: new Date().toISOString(),
    };

    // 계약서 생성
    const contract = await this.prisma.contract.create({
      data: {
        user_id: userId,
        student_id: dto.student_id,
        subject: dto.subject,
        day_of_week: dto.day_of_week,
        time: dto.time ?? null,
        billing_type: dto.billing_type as BillingType,
        absence_policy: dto.absence_policy as AbsencePolicy,
        monthly_amount: dto.monthly_amount,
        recipient_policy: dto.recipient_policy,
        recipient_targets: dto.recipient_targets,
        policy_snapshot: policySnapshot,
        planned_count_override: dto.planned_count_override ?? null,
        attendance_requires_signature: dto.attendance_requires_signature ?? false,
        teacher_signature: dto.teacher_signature ?? null,
        student_signature: dto.student_signature ?? null,
        started_at: dto.started_at ? new Date(dto.started_at) : null,
        ended_at: dto.ended_at ? new Date(dto.ended_at) : null,
        status: (dto.status ?? ContractStatus.draft) as ContractStatus,
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            phone: true,
            guardian_name: true,
            guardian_phone: true,
          },
        },
      },
    });

    return contract;
  }

  /**
   * 사용자의 모든 계약서 조회
   */
  async findAll(userId: number) {
    const contracts = await this.prisma.contract.findMany({
      where: {
        user_id: userId,
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            phone: true,
            guardian_name: true,
            guardian_phone: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });
    console.log(`[Contracts] findAll userId=${userId} found ${contracts.length} contracts`);
    return contracts;
  }

  /**
   * 특정 계약서 조회
   */
  async findOne(userId: number, id: number) {
    const contract = await this.prisma.contract.findFirst({
      where: {
        id,
        user_id: userId,
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            phone: true,
            guardian_name: true,
            guardian_phone: true,
          },
        },
      },
    });

    if (!contract) {
      throw new NotFoundException('계약서를 찾을 수 없습니다.');
    }

    return contract;
  }

  /**
   * 오늘 수업 조회
   * 오늘 요일과 시간에 맞는 계약서 + 대체 수업(substitute_at)이 오늘인 계약서 반환
   */
  async findTodayClasses(userId: number) {
    const today = new Date();
    const todayDayOfWeek = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][today.getDay()];
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

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
      select: {
        id: true,
        subject: true,
        time: true,
        day_of_week: true,
        attendance_requires_signature: true,
        billing_type: true,
        absence_policy: true,
        monthly_amount: true,
        student: {
          select: {
            id: true,
            name: true,
            phone: true,
            guardian_name: true,
            guardian_phone: true,
          },
        },
      },
    });

    // 1. 오늘 요일이 포함된 계약서 필터링
    const todayContractsByDay = contracts.filter((contract) => {
      const dayOfWeekArray = contract.day_of_week as string[];
      // day_of_week가 없거나 빈 배열이면 제외
      if (!Array.isArray(dayOfWeekArray) || dayOfWeekArray.length === 0) {
        return false;
      }
      // 'ANY' (무관/기타)가 포함되어 있으면 모든 요일에 표시
      if (dayOfWeekArray.includes('ANY')) {
        return true;
      }
      // 오늘 요일이 포함되어 있는지 확인
      return dayOfWeekArray.includes(todayDayOfWeek);
    });

    // 2. 대체 수업(substitute_at)이 오늘인 출결 로그 찾기
    const substituteLogs = await this.prisma.attendanceLog.findMany({
      where: {
        user_id: userId,
        status: 'substitute',
        substitute_at: {
          gte: todayStart,
          lte: todayEnd,
        },
        voided: false,
      },
      select: {
        id: true,
        contract_id: true,
        occurred_at: true, // 원래 수업 날짜
      },
    });

    // 3. 대체 수업의 contract_id로 계약서 찾기
    const substituteContractIds = new Set(substituteLogs.map((log) => log.contract_id));
    const substituteLogsByContractId = new Map<number, Date>();
    substituteLogs.forEach((log) => {
      substituteLogsByContractId.set(log.contract_id, log.occurred_at);
    });
    const substituteContracts = contracts.filter((contract) =>
      substituteContractIds.has(contract.id),
    );

    // 4. 두 리스트 합치기 (중복 제거)
    const allContractIds = new Set<number>();
    const todayContracts: typeof contracts = [];

    // 오늘 요일 계약서 추가
    todayContractsByDay.forEach((contract) => {
      if (!allContractIds.has(contract.id)) {
        allContractIds.add(contract.id);
        todayContracts.push(contract);
      }
    });

    // 대체 수업 계약서 추가
    substituteContracts.forEach((contract) => {
      if (!allContractIds.has(contract.id)) {
        allContractIds.add(contract.id);
        todayContracts.push(contract);
      }
    });

    // 5. 오늘 날짜에 이미 출석 로그가 있는 계약서 조회
    // - occurred_at이 오늘인 경우만 "이미 처리됨"으로 표시
    // - substitute_at이 오늘이지만 occurred_at이 오늘이 아닌 경우(대체 수업)는 오늘에 새로운 출결 처리가 가능해야 함
    const contractIds = todayContracts.map((c) => c.id);
    const attendanceLogs = await this.prisma.attendanceLog.findMany({
      where: {
        user_id: userId,
        contract_id: {
          in: contractIds,
        },
        occurred_at: {
          gte: todayStart,
          lte: todayEnd,
        },
        voided: false,
      },
      select: {
        id: true,
        contract_id: true,
        status: true,
      },
    });

    // contract_id를 키로 하는 Map 생성
    // 오늘 날짜에 실제로 발생한 출결(occurred_at이 오늘)만 "이미 처리됨"으로 표시
    const attendanceLogMap = new Map<number, number>();
    attendanceLogs.forEach((log) => {
      attendanceLogMap.set(log.contract_id, log.id);
    });

    // 각 계약서에 출석 로그 여부와 ID 추가
    return todayContracts.map((contract) => {
      const attendanceLogId = attendanceLogMap.get(contract.id);
      const isSubstitute = substituteContractIds.has(contract.id);
      const originalOccurredAt = isSubstitute ? substituteLogsByContractId.get(contract.id) : null;
      return {
        ...contract,
        hasAttendanceLog: attendanceLogId !== undefined,
        attendanceLogId: attendanceLogId || null,
        isSubstitute: isSubstitute,
        originalOccurredAt: originalOccurredAt ? originalOccurredAt.toISOString() : null,
      };
    });
  }

  /**
   * 계약서 상태 업데이트
   * 선불 계약의 경우 'sent' 상태로 변경 시 청구서 자동 생성
   */
  async updateStatus(userId: number, id: number, dto: UpdateContractStatusDto) {
    const contract = await this.prisma.contract.findFirst({
      where: {
        id,
        user_id: userId,
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            phone: true,
            guardian_name: true,
            guardian_phone: true,
          },
        },
      },
    });

    if (!contract) {
      throw new NotFoundException('계약서를 찾을 수 없습니다.');
    }

    const data: Prisma.ContractUpdateInput = {
      status: dto.status as ContractStatus,
    };

    if (dto.teacher_signature !== undefined) {
      data.teacher_signature = dto.teacher_signature;
    }

    if (dto.student_signature !== undefined) {
      data.student_signature = dto.student_signature;
    }

    const updatedContract = await this.prisma.contract.update({
      where: { id },
      data,
      include: {
        student: {
          select: {
            id: true,
            name: true,
            phone: true,
            guardian_name: true,
            guardian_phone: true,
          },
        },
      },
    });

    // 선불 계약이고 'sent' 상태로 변경된 경우 청구서 자동 생성
    if (contract.billing_type === 'prepaid' && dto.status === 'sent' && contract.status !== 'sent') {
      try {
        await this.createPrepaidInvoice(userId, contract);
        console.log(`[Contracts] Prepaid invoice created for contract ${id}`);
      } catch (error: any) {
        console.error(`[Contracts] Failed to create prepaid invoice for contract ${id}:`, error?.message);
        // 청구서 생성 실패해도 계약서 상태 업데이트는 유지
      }
    }

    return updatedContract;
  }

  /**
   * 계약 연장 처리
   * 횟수제: total_sessions 증가
   * 월단위: ended_at 업데이트
   * 연장 이력은 policy_snapshot.extensions에 저장
   */
  async extend(userId: number, id: number, dto: ExtendContractDto) {
    const contract = await this.prisma.contract.findFirst({
      where: {
        id,
        user_id: userId,
      },
    });

    if (!contract) {
      throw new NotFoundException('계약서를 찾을 수 없습니다.');
    }

    const snapshot = (contract.policy_snapshot ?? {}) as Record<string, any>;
    const totalSessions = typeof snapshot.total_sessions === 'number' ? snapshot.total_sessions : 0;
    const extensions = Array.isArray(snapshot.extensions) ? snapshot.extensions : [];

    // 횟수제 연장
    if (dto.added_sessions && dto.added_sessions > 0) {
      if (totalSessions === 0) {
        throw new BadRequestException('횟수제 계약이 아닙니다.');
      }

      const newTotalSessions = totalSessions + dto.added_sessions;
      const extensionRecord = {
        type: 'sessions',
        added_sessions: dto.added_sessions,
        previous_total: totalSessions,
        new_total: newTotalSessions,
        extended_at: new Date().toISOString(),
        extended_by: userId,
      };

      const updatedSnapshot = {
        ...snapshot,
        total_sessions: newTotalSessions,
        extensions: [...extensions, extensionRecord],
      };

      await this.prisma.contract.update({
        where: { id },
        data: {
          policy_snapshot: updatedSnapshot,
        },
      });

      return { success: true, message: `${dto.added_sessions}회가 추가되었습니다.` };
    }

    // 월단위 연장
    if (dto.extended_end_date) {
      if (!contract.ended_at) {
        throw new BadRequestException('기간이 설정되지 않은 계약입니다.');
      }

      const previousEnd = new Date(contract.ended_at);
      const newEnd = new Date(dto.extended_end_date);

      if (newEnd <= previousEnd) {
        throw new BadRequestException('연장 종료일은 현재 종료일보다 이후여야 합니다.');
      }

      const extensionRecord = {
        type: 'period',
        previous_end: previousEnd.toISOString(),
        new_end: newEnd.toISOString(),
        extended_at: new Date().toISOString(),
        extended_by: userId,
      };

      const updatedSnapshot = {
        ...snapshot,
        extensions: [...extensions, extensionRecord],
      };

      await this.prisma.contract.update({
        where: { id },
        data: {
          ended_at: newEnd,
          policy_snapshot: updatedSnapshot,
        },
      });

      return { success: true, message: '계약 기간이 연장되었습니다.' };
    }

    throw new BadRequestException('연장 정보가 올바르지 않습니다.');
  }

  /**
   * 선불 계약 전송 시 초기 청구서 생성
   * 이전 달로 설정하여 지난 정산 섹션에 포함
   */
  private async createPrepaidInvoice(userId: number, contract: any) {
    const now = new Date();
    // 이전 달 계산
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const year = prevMonth.getFullYear();
    const month = prevMonth.getMonth() + 1;

    // 이미 선불 청구서가 생성되었는지 확인 (중복 방지)
    const existingInvoice = await this.prisma.invoice.findUnique({
      where: {
        student_id_contract_id_year_month: {
          student_id: contract.student_id,
          contract_id: contract.id,
          year,
          month,
        },
      },
    });

    if (existingInvoice) {
      console.log(`[Contracts] Prepaid invoice already exists for contract ${contract.id}, year ${year}, month ${month}`);
      return existingInvoice;
    }

    // policy_snapshot에서 base_amount 가져오기
    const policySnapshot = (contract.policy_snapshot ?? {}) as Record<string, any>;
    const baseAmount =
      typeof policySnapshot.monthly_amount === 'number'
        ? policySnapshot.monthly_amount
        : contract.monthly_amount;

    // 선불 초기 청구서는 차감 없이 base_amount 그대로
    // 계약서 전송 시점에 발행되므로 출결 기록은 없음
    const sendHistory = [
      {
        invoice_id: null, // 생성 전이므로 null
        student_name: contract.student.name,
        success: true,
        sent_to: Array.isArray(contract.recipient_targets) ? contract.recipient_targets : [],
        channel: 'contract_send', // 계약서 전송과 동시 발송
        sent_at: new Date().toISOString(),
      },
    ] as Prisma.InputJsonValue;

    const invoice = await this.prisma.invoice.create({
      data: {
        user_id: userId,
        student_id: contract.student_id,
        contract_id: contract.id,
        year,
        month,
        base_amount: baseAmount,
        auto_adjustment: 0,
        manual_adjustment: 0,
        final_amount: baseAmount,
        planned_count: null, // 선불 초기 청구서는 예정 회차 없음
        send_status: 'sent', // 계약서와 동시 전송
        send_to: contract.recipient_targets ?? Prisma.JsonNull,
        send_history: sendHistory,
      },
    });

    return invoice;
  }

  /**
   * 계약서 HTML 생성 (공개 엔드포인트)
   */
  async generateContractHtml(contractId: number): Promise<string> {
    // 공개 엔드포인트: userId 검증 없이 계약서 조회
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            phone: true,
            guardian_name: true,
            guardian_phone: true,
          },
        },
      },
    });

    if (!contract) {
      throw new NotFoundException('계약서를 찾을 수 없습니다.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: contract.user_id },
      select: { name: true, org_code: true },
    });

    const businessName = user?.org_code || '김쌤';

    const DAY_LABELS: { [key: string]: string } = {
      SUN: '일',
      MON: '월',
      TUE: '화',
      WED: '수',
      THU: '목',
      FRI: '금',
      SAT: '토',
    };

    const BILLING_TYPE_LABELS: { [key: string]: string } = {
      prepaid: '선불',
      postpaid: '후불',
    };

    const ABSENCE_POLICY_LABELS: { [key: string]: string } = {
      carry_over: '회차 이월',
      deduct_next: '차감',
      vanish: '소멸',
    };

    const formatDays = (days: string[]): string => {
      return days.map((day) => DAY_LABELS[day] || day).join(', ');
    };

    const formatDate = (dateString: string | null | undefined): string => {
      if (!dateString) return '-';
      const date = new Date(dateString);
      if (Number.isNaN(date.getTime())) return '-';
      return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    };

    // 연장 기록 포맷팅
    const formatExtensionHistory = (extensions: any[]): string[] => {
      if (!Array.isArray(extensions) || extensions.length === 0) return [];
      
      return extensions.map((ext: any) => {
        const extendedDate = ext.extended_at ? new Date(ext.extended_at) : null;
        const dateStr = extendedDate
          ? `${extendedDate.getFullYear()}/${String(extendedDate.getMonth() + 1).padStart(2, '0')}/${String(extendedDate.getDate()).padStart(2, '0')}`
          : '';

        if (ext.type === 'sessions') {
          // 횟수제 연장: "25/11/20 계약연장 (+5회)"
          return `${dateStr} 계약연장 (+${ext.added_sessions}회)`;
        } else if (ext.type === 'period') {
          // 월단위 연장: "25/11/20 계약연장 (2025.11.20 ~ 2025.12.20)"
          const prevEnd = ext.previous_end ? new Date(ext.previous_end) : null;
          const newEnd = ext.new_end ? new Date(ext.new_end) : null;
          if (prevEnd && newEnd) {
            const formatDateShort = (d: Date) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
            return `${dateStr} 계약연장 (${formatDateShort(prevEnd)} ~ ${formatDateShort(newEnd)})`;
          }
          return `${dateStr} 계약연장`;
        }
        return `${dateStr} 계약연장`;
      });
    };

    const policySnapshot = (contract.policy_snapshot ?? {}) as Record<string, any>;
    const extensions = Array.isArray(policySnapshot.extensions) ? policySnapshot.extensions : [];
    const extensionHistory = formatExtensionHistory(extensions);

    const html = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>계약서</title>
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
    .section {
      margin-bottom: 20px;
    }
    .section-title {
      font-size: 18px;
      font-weight: 700;
      color: #111111;
      margin-bottom: 20px;
    }
    .info-row {
      margin-bottom: 16px;
    }
    .info-label {
      font-size: 13px;
      color: #8e8e93;
      margin-bottom: 4px;
    }
    .info-value {
      font-size: 16px;
      color: #111111;
      font-weight: 500;
    }
    .divider {
      height: 1px;
      background-color: #f0f0f3;
      margin: 16px 0;
    }
    .signature-row {
      display: flex;
      gap: 16px;
      margin-top: 20px;
    }
    .signature-column {
      flex: 1;
    }
    .signature-label {
      font-size: 13px;
      color: #8e8e93;
      margin-bottom: 8px;
    }
    .signature-image {
      width: 100%;
      max-height: 120px;
      border-radius: 12px;
      border: 1px solid #e5e5ea;
      object-fit: contain;
    }
    .extension-section {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
    }
    .extension-title {
      font-size: 16px;
      font-weight: 600;
      color: #111111;
      margin-bottom: 12px;
    }
    .extension-item {
      padding: 8px 0;
      border-bottom: 1px solid #f0f0f0;
    }
    .extension-item:last-child {
      border-bottom: none;
    }
    .extension-text {
      font-size: 14px;
      color: #333333;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="section">
      <div class="section-title">계약서 정보</div>
      
      <div class="info-row">
        <div class="info-label">수강생</div>
        <div class="info-value">${contract.student.name}</div>
      </div>
      
      ${contract.student.phone ? `
      <div class="info-row">
        <div class="info-label">연락처</div>
        <div class="info-value">${contract.student.phone}</div>
      </div>
      ` : ''}

      ${contract.student.guardian_name ? `
      <div class="info-row">
        <div class="info-label">보호자</div>
        <div class="info-value">${contract.student.guardian_name}${contract.student.guardian_phone ? ` (${contract.student.guardian_phone})` : ''}</div>
      </div>
      ` : ''}

      <div class="divider"></div>

      <div class="info-row">
        <div class="info-label">과목</div>
        <div class="info-value">${contract.subject}</div>
      </div>

      <div class="info-row">
        <div class="info-label">수업 요일</div>
        <div class="info-value">${formatDays(contract.day_of_week as string[])}</div>
      </div>

      <div class="info-row">
        <div class="info-label">수업 시간</div>
        <div class="info-value">${contract.time || '-'}</div>
      </div>

      <div class="divider"></div>

      <div class="info-row">
        <div class="info-label">계약 시작일</div>
        <div class="info-value">${formatDate(contract.started_at as string | null)}</div>
      </div>

      <div class="info-row">
        <div class="info-label">계약 종료일</div>
        <div class="info-value">${formatDate(contract.ended_at as string | null)}</div>
      </div>

      <div class="divider"></div>

      <div class="info-row">
        <div class="info-label">월 금액</div>
        <div class="info-value">${contract.monthly_amount.toLocaleString()}원</div>
      </div>

      <div class="info-row">
        <div class="info-label">결제 방식</div>
        <div class="info-value">${BILLING_TYPE_LABELS[contract.billing_type] || contract.billing_type}</div>
      </div>

      <div class="info-row">
        <div class="info-label">결석 처리</div>
        <div class="info-value">${
          contract.absence_policy === 'deduct_next'
            ? '차감'
            : ABSENCE_POLICY_LABELS[contract.absence_policy] || contract.absence_policy
        }</div>
      </div>
    </div>

    ${contract.teacher_signature || contract.student_signature ? `
    <div class="section">
      <div class="section-title">서명</div>
      <div class="signature-row">
        <div class="signature-column">
          <div class="signature-label">강사 서명</div>
          ${contract.teacher_signature ? `<img src="${contract.teacher_signature}" class="signature-image" alt="강사 서명" />` : '<div style="padding: 20px; text-align: center; color: #8e8e93;">서명이 없습니다</div>'}
        </div>
        <div class="signature-column">
          <div class="signature-label">수강생 서명</div>
          ${contract.student_signature ? `<img src="${contract.student_signature}" class="signature-image" alt="수강생 서명" />` : '<div style="padding: 20px; text-align: center; color: #8e8e93;">서명이 없습니다</div>'}
        </div>
      </div>
      ${extensionHistory.length > 0 ? `
      <div class="extension-section">
        <div class="extension-title">계약 변경</div>
        ${extensionHistory.map((record: string) => `
        <div class="extension-item">
          <div class="extension-text">${record}</div>
        </div>
        `).join('')}
      </div>
      ` : ''}
    </div>
    ` : extensionHistory.length > 0 ? `
    <div class="section">
      <div class="section-title">서명</div>
      <div class="signature-row">
        <div class="signature-column">
          <div class="signature-label">강사 서명</div>
          <div style="padding: 20px; text-align: center; color: #8e8e93;">서명이 없습니다</div>
        </div>
        <div class="signature-column">
          <div class="signature-label">수강생 서명</div>
          <div style="padding: 20px; text-align: center; color: #8e8e93;">서명이 없습니다</div>
        </div>
      </div>
      <div class="extension-section">
        <div class="extension-title">계약 변경</div>
        ${extensionHistory.map((record: string) => `
        <div class="extension-item">
          <div class="extension-text">${record}</div>
        </div>
        `).join('')}
      </div>
    </div>
    ` : ''}
  </div>
</body>
</html>
    `.trim();

    return html;
  }
}
