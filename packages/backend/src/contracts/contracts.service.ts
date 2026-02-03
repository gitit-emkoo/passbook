import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContractDto, BillingType, AbsencePolicy, ContractStatus } from './dto/create-contract.dto';
import { UpdateContractStatusDto } from './dto/update-contract-status.dto';
import { ExtendContractDto } from './dto/extend-contract.dto';
import { Prisma } from '@prisma/client';
import { InvoicesService } from '../invoices/invoices.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RescheduleSessionDto } from './dto/reschedule-session.dto';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { SmsService } from '../sms/sms.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);

  constructor(
    private prisma: PrismaService,
    private invoicesService: InvoicesService,
    private notificationsService: NotificationsService,
    private smsService: SmsService,
    private configService: ConfigService,
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
    
    // total_sessions 판별: 프론트엔드에서 전달한 값이 있으면 사용, 없거나 0이면 0으로 설정 (금액권)
    // 횟수권은 반드시 total_sessions > 0으로 전송되어야 함
    const totalSessions = frontendSnapshot.total_sessions !== undefined && frontendSnapshot.total_sessions !== null && frontendSnapshot.total_sessions > 0
      ? frontendSnapshot.total_sessions
      : 0; // 금액권은 total_sessions = 0으로 명시적으로 설정
    
    const policySnapshot = {
      billing_type: dto.billing_type,
      absence_policy: dto.absence_policy,
      monthly_amount: dto.monthly_amount,
      recipient_policy: dto.recipient_policy,
      recipient_targets: dto.recipient_targets,
      // total_sessions: 프론트엔드에서 전달한 값이 있으면 사용, 없거나 0이면 0 (금액권으로 명시)
      total_sessions: totalSessions,
      // 프론트에서 전송한 per_session_amount, planned_count_override 포함
      ...(frontendSnapshot.per_session_amount ? { per_session_amount: frontendSnapshot.per_session_amount } : {}),
      ...(frontendSnapshot.planned_count_override ? { planned_count_override: frontendSnapshot.planned_count_override } : {}),
      // 계좌 정보 포함
      ...(frontendSnapshot.account_info ? { account_info: frontendSnapshot.account_info } : {}),
      // 수업 내용 특약 포함
      ...(frontendSnapshot.lesson_notes ? { lesson_notes: frontendSnapshot.lesson_notes } : {}),
      created_at: new Date().toISOString(),
    };

    // billing_day 계산: started_at의 일자 (1-31)
    // 날짜 문자열(YYYY-MM-DD)을 로컬 시간대로 파싱
    const parseLocalDate = (dateString: string): Date => {
      const [year, month, day] = dateString.split('-').map(Number);
      return new Date(year, month - 1, day, 0, 0, 0, 0);
    };
    
    const startedAt = dto.started_at ? parseLocalDate(dto.started_at) : null;
    const endedAt = dto.ended_at ? parseLocalDate(dto.ended_at) : null;
    const billingDay = startedAt ? startedAt.getDate() : null;

    // 계약서 생성
    const contract = await this.prisma.contract.create({
      data: {
        user_id: userId,
        student_id: dto.student_id,
        subject: dto.subject,
        day_of_week: dto.day_of_week ?? [], // 뷰티 앱에서는 빈 배열 허용 (예약 방식 사용)
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
        started_at: startedAt,
        ended_at: endedAt,
        billing_day: billingDay,
        payment_schedule: (dto.payment_schedule ?? 'monthly') as 'monthly' | 'lump_sum' | null,
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
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Contracts] findAll userId=${userId} found ${contracts.length} contracts`);
    }
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
    // UTC 기준으로 오늘 날짜 생성 (시간대 문제 방지)
    const todayStart = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0));
    const todayEnd = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999));
    
    // 로컬 시간 기준으로도 생성 (비교용)
    const todayLocalStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const todayLocalEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    // 뷰티 앱: 오늘 날짜에 예약된 Reservation 조회
    // reserved_date는 DateTime 타입이지만 날짜만 저장되므로, 날짜만 비교
    // 두 가지 방식으로 조회 시도 (UTC와 로컬 시간)
    const todayReservations = await (this.prisma as any).reservation.findMany({
      where: {
        OR: [
          {
            reserved_date: {
              gte: todayStart,
              lte: todayEnd,
            },
          },
          {
            reserved_date: {
              gte: todayLocalStart,
              lte: todayLocalEnd,
            },
          },
        ],
      },
      select: {
        id: true,
        contract_id: true,
        reserved_date: true,
        reserved_time: true,
      },
    });
    

    // 예약된 계약 ID 목록
    const reservedContractIds = todayReservations.map((r: any) => r.contract_id);
    
    if (reservedContractIds.length === 0) {
      return [];
    }

    // 예약된 계약서 조회
    const contracts = await this.prisma.contract.findMany({
      where: {
        user_id: userId,
        id: {
          in: reservedContractIds,
        },
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
        started_at: true,
        ended_at: true,
        policy_snapshot: true,
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

    // 예약 정보를 contract_id로 매핑
    const reservationMap = new Map<number, { id: number; reserved_time?: string | null }>();
    todayReservations.forEach((r: any) => {
      reservationMap.set(r.contract_id, {
        id: r.id,
        reserved_time: r.reserved_time,
      });
    });

    // 뷰티 앱: 예약된 계약서만 오늘 예약으로 표시
    const todayContracts = contracts;

    // 오늘 날짜에 이미 출석 로그가 있는 계약서 조회
    // occurred_at만 확인 (substitute_at은 대체일 정보일 뿐, 해당 날짜의 출결 처리 여부와 무관)
    // UTC와 로컬 시간 기준으로 두 가지 범위 모두 조회 (시간대 문제 방지)
    const contractIds = todayContracts.map((c) => c.id);
    const attendanceLogs = await this.prisma.attendanceLog.findMany({
      where: {
        user_id: userId,
        contract_id: {
          in: contractIds,
        },
        OR: [
          {
            occurred_at: {
              gte: todayStart,
              lte: todayEnd,
            },
          },
          {
            occurred_at: {
              gte: todayLocalStart,
              lte: todayLocalEnd,
            },
          },
        ],
        voided: false,
      },
      select: {
        id: true,
        contract_id: true,
        status: true,
        occurred_at: true,
      },
      orderBy: {
        occurred_at: 'desc', // 최신 로그 우선
      },
    });

    // contract_id를 키로 하는 Map 생성
    const attendanceLogMap = new Map<number, { id: number; status: string }>();
    attendanceLogs.forEach((log) => {
      attendanceLogMap.set(log.contract_id, { id: log.id, status: log.status });
    });

    // 각 계약서에 출석 로그 여부와 ID, 예약 정보, sessions_used 추가
    return Promise.all(
      todayContracts.map(async (contract) => {
        const attendanceLogInfo = attendanceLogMap.get(contract.id);
        const attendanceLogId = attendanceLogInfo?.id;
        const reservationInfo = reservationMap.get(contract.id);
        const reservationId = reservationInfo?.id || null;
        const reservedTime = reservationInfo?.reserved_time || contract.time || null;
        
        // sessions_used 계산 (횟수제 계약인 경우)
        // amount_used 계산 (금액권인 경우)
        const snapshot = (contract.policy_snapshot ?? {}) as Record<string, any>;
        const totalSessions = typeof snapshot.total_sessions === 'number' ? snapshot.total_sessions : 0;
        let sessionsUsed = 0;
        let amountUsed = 0;
        if (totalSessions > 0) {
          // 횟수제 계약: 사용된 횟수 계산
          sessionsUsed = await this.prisma.attendanceLog.count({
            where: {
              user_id: userId,
              contract_id: contract.id,
              voided: false,
              status: {
                in: ['present', 'absent', 'substitute', 'vanish'],
              },
            },
          });
        } else if (totalSessions === 0) {
          // 금액권 계약: 사용된 금액 합계 계산 (ended_at은 표시용일 뿐, 판별에 사용하지 않음)
          const attendanceLogsWithAmount = await this.prisma.attendanceLog.findMany({
            where: {
              user_id: userId,
              contract_id: contract.id,
              voided: false,
              status: { in: ['present', 'absent', 'substitute', 'vanish'] },
              amount: { not: null },
            } as any,
            select: {
              amount: true,
            } as any,
          });
          amountUsed = attendanceLogsWithAmount.reduce((sum, log: any) => sum + (log.amount || 0), 0);
        }
        
        return {
          ...contract,
          hasAttendanceLog: attendanceLogId !== undefined,
          attendanceLogId: attendanceLogId || null,
          reservation_id: reservationId,
          time: reservedTime, // 예약 시간 또는 계약 시간
          sessions_used: sessionsUsed,
          amount_used: amountUsed,
        };
      })
    );
  }

  /**
   * 사전 일정 변경 (계약 기간 내에서 특정 수업일을 다른 날로 이동)
   */
  async rescheduleSession(userId: number, contractId: number, dto: RescheduleSessionDto) {
    const contract = await this.prisma.contract.findFirst({
      where: {
        id: contractId,
        user_id: userId,
      },
    });

    if (!contract) {
      throw new NotFoundException('계약서를 찾을 수 없습니다.');
    }

    if (dto.student_id && dto.student_id !== contract.student_id) {
      throw new BadRequestException('수강생 정보가 일치하지 않습니다.');
    }

    // 날짜 파싱 (시간은 00:00으로 맞춰서 날짜 단위 비교)
    const parseDateOnly = (value: string): Date => {
      // 'YYYY-MM-DD'를 타임존 영향 없이 Date로 변환
      const parts = value.split('-').map(Number);
      if (parts.length !== 3) {
        throw new BadRequestException('유효하지 않은 날짜 형식입니다.');
      }
      const [year, month, day] = parts;
      const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      if (Number.isNaN(date.getTime())) {
        throw new BadRequestException('유효하지 않은 날짜 형식입니다.');
      }
      return date;
    };

    const originalDate = parseDateOnly(dto.original_date);
    const newDate = parseDateOnly(dto.new_date);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 과거 날짜는 이동 불가
    if (originalDate < today || newDate < today) {
      throw new BadRequestException('지난 날짜는 일정 변경이 불가능합니다.');
    }

    // 계약 기간 내인지 검사
    const startedAt = contract.started_at ? new Date(contract.started_at) : null;
    const endedAt = contract.ended_at ? new Date(contract.ended_at) : null;

    const inContractRange = (d: Date) => {
      if (startedAt && d < new Date(startedAt.getFullYear(), startedAt.getMonth(), startedAt.getDate())) {
        return false;
      }
      if (endedAt && d > new Date(endedAt.getFullYear(), endedAt.getMonth(), endedAt.getDate())) {
        return false;
      }
      return true;
    };

    if (!inContractRange(originalDate) || !inContractRange(newDate)) {
      throw new BadRequestException('계약 기간 밖의 날짜는 선택할 수 없습니다.');
    }

    // 0) 기존 대체 출결이 원복 시나리오인지 확인
    //    (예: 12일 결석→대체 13일 후, 13일을 다시 12일로 되돌리는 경우)
    const substituteLog = await this.prisma.attendanceLog.findFirst({
      where: {
        user_id: userId,
        contract_id: contractId,
        voided: false,
        status: 'substitute',
        substitute_at: {
          gte: originalDate,
          lte: new Date(originalDate.getFullYear(), originalDate.getMonth(), originalDate.getDate(), 23, 59, 59, 999),
        },
      },
      select: {
        id: true,
        occurred_at: true,
      },
    });

    if (substituteLog) {
      const occurredDate = new Date(substituteLog.occurred_at);
      occurredDate.setHours(0, 0, 0, 0);
      // 원래 수업일로 되돌리는 경우: 대체 출결을 무효화하고 일정 예외 생성/업데이트는 건너뜀
      if (occurredDate.getTime() === newDate.getTime()) {
        await this.prisma.attendanceLog.update({
          where: { id: substituteLog.id },
          data: {
            voided: true,
            void_reason: 'Rescheduled back to original date',
          },
        });
        return {
          success: true,
          scheduleException: null,
        };
      }
    }

    // 새 날짜에 이미 출결 로그가 있는 경우, 일정 이동을 위해 무효 처리
    const existingNewDateAttendance = await this.prisma.attendanceLog.findMany({
      where: {
        user_id: userId,
        contract_id: contractId,
        voided: false,
        occurred_at: {
          gte: newDate,
          lte: new Date(newDate.getFullYear(), newDate.getMonth(), newDate.getDate(), 23, 59, 59, 999),
        },
      },
      select: { id: true },
    });

    if (existingNewDateAttendance.length > 0) {
      await this.prisma.attendanceLog.updateMany({
        where: {
          id: {
            in: existingNewDateAttendance.map((l) => l.id),
          },
        },
        data: {
          voided: true,
          void_reason: 'Rescheduled to this date',
        },
      });
    }

    // 이미 해당 원래 날짜에 대한 일정 변경이 존재하는지 확인 (중복 방지)
    const existing = await this.prisma.scheduleException.findFirst({
      where: {
        contract_id: contractId,
        original_date: {
          gte: originalDate,
          lte: new Date(originalDate.getFullYear(), originalDate.getMonth(), originalDate.getDate(), 23, 59, 59, 999),
        },
      },
      select: {
        id: true,
        new_date: true,
      },
    });

    if (existing) {
      // 동일 원본 날짜가 이미 변경된 경우: 업데이트 혹은 취소(원복) 처리
      const existingNewDate = new Date(existing.new_date);
      existingNewDate.setHours(0, 0, 0, 0);

      // 원복하려는 경우(새 날짜가 원래 날짜와 동일): 예외 레코드 삭제
      if (newDate.getTime() === originalDate.getTime()) {
        await this.prisma.scheduleException.delete({ where: { id: existing.id } });
        return {
          success: true,
          scheduleException: null,
        };
      }

      // 다른 날짜로 재변경: 기존 레코드 업데이트
      const updated = await this.prisma.scheduleException.update({
        where: { id: existing.id },
        data: {
          new_date: newDate,
          reason: dto.reason ?? null,
        },
      });
      return {
        success: true,
        scheduleException: updated,
      };
    }

    // 해당 원래 날짜에 이미 출결이 기록된 경우 일정 변경 불가
    const existingAttendance = await this.prisma.attendanceLog.findFirst({
      where: {
        user_id: userId,
        contract_id: contractId,
        voided: false,
        occurred_at: {
          gte: originalDate,
          lte: new Date(originalDate.getFullYear(), originalDate.getMonth(), originalDate.getDate(), 23, 59, 59, 999),
        },
      },
    });

    if (existingAttendance) {
      throw new BadRequestException('이미 출결이 기록된 수업일은 변경할 수 없습니다.');
    }

    // 일정 예외 생성
    const scheduleException = await this.prisma.scheduleException.create({
      data: {
        user_id: userId,
        student_id: contract.student_id,
        contract_id: contract.id,
        original_date: originalDate,
        new_date: newDate,
        reason: dto.reason ?? null,
      },
    });

    return {
      success: true,
      scheduleException,
    };
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
    // 선불 계약: 계약서 발송 시 첫 정산서 생성 (월단위만, 일시납부 제외)
    if (contract.billing_type === 'prepaid' && dto.status === 'sent' && contract.status !== 'sent') {
      try {
        // 일시납부 계약은 월단위 정산서 생성 로직에서 제외
        if (contract.payment_schedule === 'lump_sum') {
          // 일시납부 계약은 getInvoicesBySections에서 별도로 처리됨
          return updatedContract;
        }
        
        // contract에 student 정보가 포함되어 있는지 확인
        if (!contract.student) {
          throw new Error('Student information is missing from contract');
        }
        const invoice = await this.createPrepaidInvoice(userId, contract);
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[Contracts] Prepaid invoice created for contract ${id}, invoice id: ${invoice.id}, year: ${invoice.year}, month: ${invoice.month}, send_status: ${invoice.send_status}`);
        }
        
        // 확정 개념: 계약서 발송과 청구서 발송은 분리됨
        // 선불 청구서는 생성되어 오늘청구 섹션에 표시되며, 사용자가 수동으로 전송해야 함
        // 따라서 계약서 전송 시 청구서 전송 완료 알림은 발송하지 않음
      } catch (error: any) {
        console.error(`[Contracts] Failed to create prepaid invoice for contract ${id}:`, error?.message);
        // 청구서 생성 실패해도 계약서 상태 업데이트는 유지
      }
    }
    
    // 후불 계약: 계약서 발송 시 첫 정산서 생성
    if (contract.billing_type === 'postpaid' && dto.status === 'sent' && contract.status !== 'sent') {
      try {
        if (!contract.student) {
          throw new Error('Student information is missing from contract');
        }
        const policySnapshot = (contract.policy_snapshot ?? {}) as Record<string, any>;
        const totalSessions = typeof policySnapshot.total_sessions === 'number' ? policySnapshot.total_sessions : 0;
        const isSessionBased = totalSessions > 0; // 횟수권 (ended_at과 무관하게 totalSessions만으로 판별)

        if (isSessionBased) {
          // 횟수제 후불: 계약서 전송 시 정산서 생성 (정산중 섹션 노출용)
          const now = new Date();
          const year = now.getFullYear();
          const month = now.getMonth() + 1;

          // 첫 정산서만 확인 (invoice_number: 1)
          const existingInvoice = await this.prisma.invoice.findFirst({
            where: {
              student_id: contract.student_id,
              contract_id: contract.id,
              year,
              month,
              invoice_number: 1,
            } as any,
          });

          if (!existingInvoice) {
            const invoice = await this.invoicesService.createInvoiceForSessionBasedContract(userId, contract, year, month);
            if (process.env.NODE_ENV !== 'production') {
              console.log(`[Contracts] Postpaid session invoice created for contract ${id}, invoice id: ${invoice.id}, year: ${invoice.year}, month: ${invoice.month}, send_status: ${invoice.send_status}`);
            }
          }
        } else {
          // 일시납부 계약은 월단위 정산서 생성 로직에서 제외
          if (contract.payment_schedule === 'lump_sum') {
            // 일시납부 계약은 getInvoicesBySections에서 별도로 처리됨
            return updatedContract;
          }
          
          if (!contract.started_at || !contract.billing_day) {
            throw new Error('Contract start date or billing day is missing');
          }
          
          // 후불 첫 정산서의 year/month 계산: period_end 다음날(다음 청구일) 기준
          // 예: period_end=1.8일이면 다음 청구일=1.9일, year/month=2026/1
          const contractStartDate = new Date(contract.started_at);
          const startYear = contractStartDate.getFullYear();
          const startMonth = contractStartDate.getMonth() + 1;
          const nextMonth = startMonth === 12 ? 1 : startMonth + 1;
          const nextYear = startMonth === 12 ? startYear + 1 : startYear;
          const periodEnd = new Date(nextYear, nextMonth - 1, contract.billing_day);
          
          // period_end 다음날(다음 청구일)의 year/month
          const nextBillingDate = new Date(periodEnd);
          nextBillingDate.setDate(nextBillingDate.getDate() + 1);
          const invoiceYear = nextBillingDate.getFullYear();
          const invoiceMonth = nextBillingDate.getMonth() + 1;
          
          // 첫 정산서만 확인 (invoice_number: 1)
          const existingInvoice = await this.prisma.invoice.findFirst({
            where: {
              student_id: contract.student_id,
              contract_id: contract.id,
              year: invoiceYear,
              month: invoiceMonth,
              invoice_number: 1,
            } as any,
          });
          
          if (!existingInvoice) {
            const invoice = await this.invoicesService.createInvoiceForContract(userId, contract, invoiceYear, invoiceMonth);
            if (process.env.NODE_ENV !== 'production') {
              console.log(`[Contracts] Postpaid invoice created for contract ${id}, invoice id: ${invoice.id}, year: ${invoice.year}, month: ${invoice.month}, send_status: ${invoice.send_status}`);
            }
          }
        }
      } catch (error: any) {
        console.error(`[Contracts] Failed to create postpaid invoice for contract ${id}:`, error?.message);
        // 청구서 생성 실패해도 계약서 상태 업데이트는 유지
      }
    }

    // 계약서 전송 완료 알림 (이벤트 기반)
    if (dto.status === 'sent' && contract.status !== 'sent') {
      try {
        const studentName = updatedContract.student?.name || contract.student?.name || '고객';
        await this.notificationsService.createAndSendNotification(
          userId,
          'contract',
          '이용권 계약 전송완료',
          `${studentName}님의 이용권 계약이 성공적으로 전송되었습니다.`,
          `/contracts/${id}`,
          {
            relatedId: `contract:${id}`,
            skipDuplicateCheck: true, // 계약서 전송은 매번 알림 생성
          },
        );
      } catch (error: any) {
        // 알림 실패해도 상태 업데이트는 유지
        this.logger.error(`[Contracts] Failed to send notification for contract ${id}:`, error?.message || error);
      }

      // SMS 발송 (계약서 링크)
      try {
        const recipientTargets = (contract.recipient_targets as string[]) || [];
        const recipientPhone = 
          recipientTargets[0] ||
          updatedContract.student?.phone ||
          contract.student?.phone;
        
        if (recipientPhone) {
          const publicUrlFromEnv = this.configService.get<string>('PUBLIC_URL');
          const apiBaseUrl = this.configService.get<string>('API_BASE_URL');
          const publicUrl = publicUrlFromEnv || apiBaseUrl || 'https://passbook.today';
          
          // 디버깅: 환경변수 값 확인
          this.logger.log(`[Contracts] PUBLIC_URL env: ${publicUrlFromEnv || 'NOT SET'}, API_BASE_URL: ${apiBaseUrl || 'NOT SET'}, Using: ${publicUrl}`);
          
          // PUBLIC_URL 필수 검증
          if (!publicUrl || publicUrl.trim() === '') {
            const errorMsg = '[Contracts] PUBLIC_URL is not configured. Cannot send SMS with incomplete URL.';
            this.logger.error(errorMsg);
            throw new Error(errorMsg);
          }
          
          const contractLink = `${publicUrl}/api/v1/contracts/${id}/view`;
          const message = `[Passbook] 계약서\n${contractLink}`;
          
          this.logger.log(`[Contracts] Sending SMS with link: ${contractLink}`);
          
          const smsResult = await this.smsService.sendSms({
            to: recipientPhone,
            message,
          });

          if (smsResult.success) {
            this.logger.log(`[Contracts] SMS sent successfully for contract ${id} to ${recipientPhone}`);
          } else {
            this.logger.error(`[Contracts] SMS send failed for contract ${id}: ${smsResult.error}`);
          }
        } else {
          this.logger.warn(`[Contracts] No recipient phone found for contract ${id}`);
        }
      } catch (error: any) {
        // SMS 실패해도 계약서 상태 업데이트는 유지
        this.logger.error(`[Contracts] Failed to send SMS for contract ${id}:`, error?.message || error);
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
        extension_amount: dto.extension_amount || null, // 연장 정산서 금액 (사용자 입력)
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

      const updatedContract = await this.prisma.contract.update({
        where: { id },
        data: {
          policy_snapshot: updatedSnapshot,
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

      // 확정 개념: 선불 횟수 계약 (횟수 모두 소진 후 연장처리)
      // 연장 처리 시점에 정산서 생성/마감
      if (contract.billing_type === 'prepaid') {
        // 첫 계약의 사용된 횟수 계산 (연장 처리 시점 이전까지)
        const previousContractUsedSessions = await this.prisma.attendanceLog.count({
          where: {
            user_id: userId,
            contract_id: contract.id,
            voided: false,
            status: { in: ['present', 'absent', 'substitute', 'vanish'] },
            occurred_at: {
              lt: new Date(extensionRecord.extended_at),
            },
          },
        });

        // 첫 계약의 총 횟수 (연장 전 원래 횟수)
        const firstContractTotalSessions = extensionRecord.previous_total 
          ? extensionRecord.previous_total 
          : totalSessions;

        // 확정 개념: 횟수 모두 소진 후 연장처리인 경우에만 정산서 생성
        // (횟수 모두 소진되기 전 연장처리는 attendance.service.ts에서 출결 처리 시점에 처리)
        if (previousContractUsedSessions >= firstContractTotalSessions) {
          try {
            // 실제 연장 시점의 year/month 사용 (다음 달로 미루지 않음)
            const now = new Date();
            const year = now.getFullYear();
            const month = now.getMonth() + 1;
            await this.invoicesService.createInvoiceForSessionBasedContract(userId, updatedContract, year, month);
            if (process.env.NODE_ENV !== 'production') {
              console.log(`[Contracts] Prepaid session-based invoice created after extension (all sessions exhausted) for contract ${id}, year=${year}, month=${month}`);
            }
          } catch (error: any) {
            console.error(`[Contracts] Failed to create prepaid session-based invoice after extension for contract ${id}:`, error?.message);
            // 청구서 생성 실패해도 연장은 유지
          }
        }
      }

      // 확정 개념: 후불 횟수 계약 (횟수 모두 소진 후 연장처리)
      // 연장 처리 시점에 정산서 생성, 정산중 섹션에 노출 (마감 전까지)
      if (contract.billing_type === 'postpaid') {
        // 첫 계약의 사용된 횟수 계산 (연장 처리 시점 이전까지)
        const previousContractUsedSessions = await this.prisma.attendanceLog.count({
          where: {
            user_id: userId,
            contract_id: contract.id,
            voided: false,
            status: { in: ['present', 'absent', 'substitute', 'vanish'] },
            occurred_at: {
              lt: new Date(extensionRecord.extended_at),
            },
          },
        });

        // 첫 계약의 총 횟수 (연장 전 원래 횟수)
        // extensionRecord.previous_total이 있으면 사용, 없으면 totalSessions에서 연장 횟수 제외
        const firstContractTotalSessions = extensionRecord.previous_total 
          ? extensionRecord.previous_total 
          : totalSessions - (extensionRecord.added_sessions || 0);

        // 확정 개념: 횟수 모두 소진 후 연장처리인 경우에만 정산서 생성
        // (횟수 모두 소진되기 전 연장처리는 attendance.service.ts에서 출결 처리 시점에 처리)
        if (previousContractUsedSessions >= firstContractTotalSessions) {
          try {
            // 실제 연장 시점의 year/month 사용 (다음 달로 미루지 않음)
            const now = new Date();
            const year = now.getFullYear();
            const month = now.getMonth() + 1;
            await this.invoicesService.createInvoiceForSessionBasedContract(userId, updatedContract, year, month);
            if (process.env.NODE_ENV !== 'production') {
              console.log(`[Contracts] Postpaid session-based invoice created after extension (all sessions exhausted) for contract ${id}, year: ${year}, month: ${month}`);
            }
          } catch (error: any) {
            console.error(`[Contracts] Failed to create postpaid session-based invoice after extension for contract ${id}:`, error?.message);
            // 청구서 생성 실패해도 연장은 유지
          }
        }
      }

      return { success: true, message: `${dto.added_sessions}회가 추가되었습니다.` };
    }

    // 금액권 연장 (뷰티앱: 선불 횟수 계약 로직 사용)
    if (dto.added_amount && dto.added_amount > 0) {
      const policySnapshot = (contract.policy_snapshot ?? {}) as Record<string, any>;
      const totalSessions = typeof policySnapshot.total_sessions === 'number' ? policySnapshot.total_sessions : 0;
      if (totalSessions > 0) {
        throw new BadRequestException('금액권 계약이 아닙니다.'); // 횟수권은 연장 불가
      }
      // totalSessions === 0이면 금액권 (ended_at은 표시용일 뿐, 판별에 사용하지 않음)

      const currentAmount = contract.monthly_amount ?? 0;
      const newTotalAmount = currentAmount + dto.added_amount;
      const extensionRecord = {
        type: 'amount',
        added_amount: dto.added_amount,
        extension_amount: dto.extension_amount || null, // 연장 정산서 금액 (사용자 입력)
        previous_total: currentAmount,
        new_total: newTotalAmount,
        extended_at: new Date().toISOString(),
        extended_by: userId,
      };

      const updatedSnapshot = {
        ...snapshot,
        extensions: [...extensions, extensionRecord],
      };

      const updatedContract = await this.prisma.contract.update({
        where: { id },
        data: {
          monthly_amount: newTotalAmount,
          policy_snapshot: updatedSnapshot,
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

      // 선불 횟수 계약 로직: 금액 모두 소진 후 연장처리인 경우에만 정산서 생성
      // (금액 모두 소진되기 전 연장처리는 attendance.service.ts에서 출결 처리 시점에 처리)
      if (contract.billing_type === 'prepaid') {
        // 첫 계약의 사용된 금액 계산 (연장 처리 시점 이전까지)
        const previousContractUsedAmount = await this.prisma.attendanceLog.aggregate({
          where: {
            user_id: userId,
            contract_id: contract.id,
            voided: false,
            status: { in: ['present', 'absent', 'substitute', 'vanish'] },
            occurred_at: {
              lt: new Date(extensionRecord.extended_at),
            },
            amount: { not: null },
          } as any,
          _sum: {
            amount: true,
          } as any,
        });

        const previousAmountUsed = (previousContractUsedAmount._sum as any)?.amount ?? 0;
        const firstContractTotalAmount = extensionRecord.previous_total ?? currentAmount;

        // 금액 모두 소진 후 연장처리인 경우에만 정산서 생성
        if (previousAmountUsed >= firstContractTotalAmount) {
          try {
            // 실제 연장 시점의 year/month 사용 (다음 달로 미루지 않음)
            const now = new Date();
            const year = now.getFullYear();
            const month = now.getMonth() + 1;
            await this.invoicesService.createInvoiceForSessionBasedContract(userId, updatedContract, year, month);
            if (process.env.NODE_ENV !== 'production') {
              console.log(`[Contracts] Prepaid amount-based invoice created after extension (all amount exhausted) for contract ${id}, year=${year}, month=${month}`);
            }
          } catch (error: any) {
            console.error(`[Contracts] Failed to create prepaid amount-based invoice after extension for contract ${id}:`, error?.message);
            // 청구서 생성 실패해도 연장은 유지
          }
        }
      }

      return { success: true, message: `${dto.added_amount.toLocaleString()}원이 추가되었습니다.` };
    }

    // 레거시: 월단위 연장 (뷰티앱에서는 사용하지 않음)
    if (dto.extended_end_date) {
      if (!contract.ended_at) {
        throw new BadRequestException('기간이 설정되지 않은 계약입니다.');
      }

      const previousEnd = new Date(contract.ended_at);
      const newEnd = new Date(dto.extended_end_date);

      if (newEnd <= previousEnd) {
        throw new BadRequestException('연장 종료일은 현재 종료일보다 이후여야 합니다.');
      }

      // 계약이 이미 종료되었는지 확인 (종료일이 오늘 이전이면 연장 불가)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const previousEndDateOnly = new Date(
        previousEnd.getUTCFullYear(),
        previousEnd.getUTCMonth(),
        previousEnd.getUTCDate(),
        0, 0, 0, 0
      );
      
      if (previousEndDateOnly < today) {
        throw new BadRequestException('이미 종료된 계약은 연장할 수 없습니다.');
      }

      const extendedAt = new Date();
      const extensionRecord = {
        type: 'period',
        previous_end: previousEnd.toISOString(),
        new_end: newEnd.toISOString(),
        extended_at: extendedAt.toISOString(),
        extended_by: userId,
      };

      const updatedSnapshot = {
        ...snapshot,
        extensions: [...extensions, extensionRecord],
      };

      const updatedContract = await this.prisma.contract.update({
        where: { id },
        data: {
          ended_at: newEnd,
          policy_snapshot: updatedSnapshot,
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

      // 선불 한달 계약(31일 이하) 후 연장 시에만 두번째 정산서 즉시 생성
      // 여러달 계약(31일 초과)은 getCurrentMonthInvoices의 자동 생성 로직이 처리
      if (contract.billing_type === 'prepaid' && contract.billing_day && contract.started_at && contract.payment_schedule !== 'lump_sum') {
        // 한달 계약인지 확인 (31일 이하)
        const contractStartDate = new Date(contract.started_at);
        const previousEndDateOnly = new Date(
          previousEnd.getUTCFullYear(),
          previousEnd.getUTCMonth(),
          previousEnd.getUTCDate(),
          0, 0, 0, 0
        );
        const startDateOnly = new Date(
          contractStartDate.getUTCFullYear(),
          contractStartDate.getUTCMonth(),
          contractStartDate.getUTCDate(),
          0, 0, 0, 0
        );
        const daysDiff = Math.floor((previousEndDateOnly.getTime() - startDateOnly.getTime()) / (1000 * 60 * 60 * 24));
        const isOneMonthContract = daysDiff <= 31;

        if (isOneMonthContract) {
          try {
            // 첫 정산서 확인
            const firstInvoice = await this.prisma.invoice.findFirst({
              where: {
                user_id: userId,
                student_id: contract.student_id,
                contract_id: contract.id,
              },
              orderBy: {
                created_at: 'asc',
              },
            });

            if (firstInvoice && firstInvoice.period_end) {
              // 두번째 정산서가 이미 생성되었는지 확인
              const allInvoices = await this.prisma.invoice.findMany({
                where: {
                  user_id: userId,
                  student_id: contract.student_id,
                  contract_id: contract.id,
                },
                orderBy: {
                  created_at: 'asc',
                },
              });

              // 첫 정산서만 있고 두번째 정산서가 없는 경우에만 생성
              if (allInvoices.length === 1) {
                // 첫 정산서의 period_end 다음날이 triggerDate
                const firstPeriodEnd = new Date(firstInvoice.period_end);
                const firstPeriodEndDateOnly = new Date(
                  firstPeriodEnd.getUTCFullYear(),
                  firstPeriodEnd.getUTCMonth(),
                  firstPeriodEnd.getUTCDate(),
                  0, 0, 0, 0
                );
                const triggerDate = new Date(firstPeriodEndDateOnly);
                triggerDate.setDate(triggerDate.getDate() + 1);
                triggerDate.setHours(0, 0, 0, 0);

                // 선불: triggerDate + 1개월의 year/month 사용
                const nextBillingDate = new Date(triggerDate);
                nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
                const invoiceYear = nextBillingDate.getFullYear();
                const invoiceMonth = nextBillingDate.getMonth() + 1;
                const billingDate = new Date(invoiceYear, invoiceMonth - 1, contract.billing_day);

                // 두번째 정산서 생성
                await this.invoicesService.createPrepaidMonthlyInvoice(userId, updatedContract, invoiceYear, invoiceMonth, billingDate);
                if (process.env.NODE_ENV !== 'production') {
                  console.log(`[Contracts] Second invoice created immediately after prepaid one-month contract extension for contract ${id}, year=${invoiceYear}, month=${invoiceMonth}`);
                }
              }
            }
          } catch (error: any) {
            console.error(`[Contracts] Failed to create second invoice after prepaid one-month contract extension for contract ${id}:`, error?.message);
            // 정산서 생성 실패해도 연장은 유지
          }
        }
      }

      // 기간계약 연장은 ended_at만 업데이트하고, 
      // 여러달 계약(31일 초과)의 경우 getCurrentMonthInvoices의 자동 생성 로직이 연장된 기간에 대해 월별 정산서를 자동 생성함

      return { success: true, message: '계약 기간이 연장되었습니다.' };
    }

    throw new BadRequestException('연장 정보가 올바르지 않습니다.');
  }

  /**
   * 선불 계약 전송 시 초기 청구서 생성
   * 계약일이 속한 달로 생성 (첨부 명세서 기준)
   */
  private async createPrepaidInvoice(userId: number, contract: any) {
    const now = new Date();
    // 계약일이 속한 달로 생성 (첨부 명세서 기준: 계약일이 속한 달에 청구서 저장)
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    // 이미 선불 청구서가 생성되었는지 확인 (중복 방지)
    // 첫 정산서만 확인 (invoice_number: 1)
    const existingInvoice = await this.prisma.invoice.findFirst({
      where: {
        student_id: contract.student_id,
        contract_id: contract.id,
        year,
        month,
        invoice_number: 1,
      } as any,
    });

    if (existingInvoice) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Contracts] Prepaid invoice already exists for contract ${contract.id}, year ${year}, month ${month}`);
      }
      return existingInvoice;
    }

    // policy_snapshot에서 base_amount 가져오기
    const policySnapshot = (contract.policy_snapshot ?? {}) as Record<string, any>;
    const totalSessions = typeof policySnapshot.total_sessions === 'number' ? policySnapshot.total_sessions : 0;
    // 뷰티앱: 금액권과 횟수권 모두 선불 횟수 계약 로직 사용
    // 횟수권: totalSessions > 0 (ended_at은 표시용일 뿐, 판별에 사용하지 않음)
    // 금액권: totalSessions === 0 (ended_at은 표시용일 뿐, 판별에 사용하지 않음)
    const isSessionBased = totalSessions > 0; // 횟수권
    const isAmountBased = totalSessions === 0 && contract.billing_type === 'prepaid'; // 금액권 (선불)
    
    // 뷰티앱: 선불 계약(횟수권 또는 금액권)은 모두 선불 횟수 계약 로직 사용
    // 확정 개념: 선불 계약 (연장 없음) - 정산서 생성일=마감일=계약서 전송 시점
    // 중요: 금액권도 횟수권과 동일하게 createInvoiceForSessionBasedContract를 사용하여 period_start/period_end가 null로 생성됨
    if (isSessionBased || isAmountBased) {
      // student 정보 확인
      if (!contract.student) {
        throw new Error('Student information is required to create prepaid invoice');
      }

      // 선불 횟수 계약 정산서 생성 (period_start, period_end는 null)
      const invoice = await this.invoicesService.createInvoiceForSessionBasedContract(userId, contract, year, month);
      return invoice;
    }

    // 기간계약 선불 계약 처리 (레거시, 뷰티앱에서는 사용되지 않음)
    const baseAmount =
      typeof policySnapshot.monthly_amount === 'number'
        ? policySnapshot.monthly_amount
        : contract.monthly_amount;

    // student 정보 확인
    if (!contract.student) {
      throw new Error('Student information is required to create prepaid invoice');
    }

    // 선불 초기 청구서는 차감 없이 base_amount 그대로
    // 계약서 전송 시점에 발행되므로 출결 기록은 없음
    // 확정 개념: 계약서 발송과 청구서 발송은 분리됨
    // 선불 월단위 한달 계약: 생성일=마감일=계약서 전송일이므로 오늘청구에 표시

    // period_start, period_end 계산 (계약 기간이 있는 경우)
    // 확정 개념: 선불 여러달 계약의 첫 정산서는 period_start=period_end=계약시작일 (같은 날)
    let periodStart: Date | null = null;
    let periodEnd: Date | null = null;
    
    // 계약 기간이 있는 경우 (started_at, ended_at이 있는 경우)
    if (contract.started_at && contract.ended_at) {
      // 데이터베이스에서 가져온 날짜를 로컬 시간대로 처리
      const contractStartDate = new Date(contract.started_at);
      // UTC로 저장된 경우를 고려하여 로컬 시간대로 변환
      const localStartDate = new Date(
        contractStartDate.getUTCFullYear(),
        contractStartDate.getUTCMonth(),
        contractStartDate.getUTCDate(),
        0, 0, 0, 0
      );
      
      // 확정 개념: 첫 정산서의 period_start=period_end=계약시작일 하루 전
      // 예: 계약 시작일 12.8일 → period_start=period_end=12.7일
      // 이렇게 해야 "12.7까지의 출결을 반영해서 12.8~1.7 청구에 반영"이라는 개념이 일관됨
      periodStart = new Date(localStartDate);
      periodStart.setDate(periodStart.getDate() - 1); // 하루 전
      periodStart.setHours(0, 0, 0, 0);
      
      periodEnd = new Date(periodStart);
      periodEnd.setHours(23, 59, 59, 999);
    } else if (contract.started_at) {
      // 시작일만 있는 경우
      periodStart = new Date(contract.started_at);
      periodStart.setHours(0, 0, 0, 0);
      periodEnd = new Date(periodStart);
      periodEnd.setHours(23, 59, 59, 999);
    }

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
        period_start: periodStart,
        period_end: periodEnd,
        send_status: 'not_sent', // 계약서 발송과 분리, 오늘청구에 표시
        account_snapshot: policySnapshot?.account_info || null,
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
      select: { name: true, org_code: true, phone: true },
    });

    const businessName = user?.org_code || '김쌤';
    const businessPhone = user?.phone || '';

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
      carry_over: '대체', // 뷰티 앱: 회차 이월 → 대체
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
    const lessonNotes = typeof policySnapshot.lesson_notes === 'string' ? policySnapshot.lesson_notes : '';
    const formattedLessonNotes = lessonNotes ? lessonNotes.replace(/\n/g, '<br />') : '';
    const lessonNotesValue = formattedLessonNotes || '-';
    const extensions = Array.isArray(policySnapshot.extensions) ? policySnapshot.extensions : [];
    const extensionHistory = formatExtensionHistory(extensions);
    
    // 이용권 타입 판단: total_sessions가 있으면 횟수권, 없으면 금액권
    const totalSessions = typeof policySnapshot.total_sessions === 'number' ? policySnapshot.total_sessions : null;
    const isSessionVoucher = totalSessions !== null && totalSessions > 0;
    const voucherTypeLabel = isSessionVoucher ? '횟수권' : '금액권';

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
      margin: 24px -20px 0;
      padding: 16px 24px 24px;
      background-color: #0f1b4d;
      line-height: 1.6;
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
    .primary-blue {
      color: #1d42d8;
    }
    .section-divider {
      height: 1px;
      background-color: #e0e0e0;
      margin: 24px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-slogan">샵과 고객 모두 만족하는 투명한 이용권 관리</div>
      <div class="header-title">Pass Book</div>
      <div class="header-subtitle">이용권 계약서</div>
    </div>
    
    <div style="padding: 20px;">
    <div class="section">
      <div class="section-title">이용권 발행처</div>
      
      <div class="info-row">
        <div class="info-label">상호</div>
        <div class="info-value">${businessName}</div>
      </div>
      
      ${businessPhone ? `
      <div class="info-row">
        <div class="info-label">연락처</div>
        <div class="info-value">${businessPhone}</div>
      </div>
      ` : ''}
    </div>

    <div class="section-divider"></div>

    <div class="section">
      <div class="section-title">이용권 내용</div>
      
      <div class="info-row">
        <div class="info-label">고객명</div>
        <div class="info-value">${contract.student.name}</div>
      </div>
      
      ${(() => {
        const studentPhone = contract.student.phone || '';
        const recipientTargets = Array.isArray(contract.recipient_targets) ? contract.recipient_targets : [];
        const smsPhone = recipientTargets.length > 0 ? recipientTargets[0] : '';
        
        if (studentPhone || smsPhone) {
          let phoneDisplay = '';
          if (studentPhone && smsPhone) {
            phoneDisplay = `${studentPhone} <span class="primary-blue">(${smsPhone})</span>`;
          } else if (studentPhone) {
            phoneDisplay = studentPhone;
          } else if (smsPhone) {
            phoneDisplay = `<span class="primary-blue">(${smsPhone})</span>`;
          }
          
          return `
      <div class="info-row">
        <div class="info-label">연락처 <span class="primary-blue">(SMS수신 연락처)</span></div>
        <div class="info-value">${phoneDisplay}</div>
      </div>
      `;
        }
        return '';
      })()}

      <div class="divider"></div>

      <div class="info-row">
        <div class="info-label">이용권 명</div>
        <div class="info-value">${contract.subject}</div>
      </div>

      <div class="info-row">
        <div class="info-label">이용권 내용</div>
        <div class="info-value">${lessonNotesValue}</div>
      </div>

      <div class="info-row">
        <div class="info-label">이용권 타입</div>
        <div class="info-value">${voucherTypeLabel}</div>
      </div>

      ${isSessionVoucher ? `
      <div class="info-row">
        <div class="info-label">횟수</div>
        <div class="info-value">${totalSessions}회</div>
      </div>
      ` : ''}

      <div class="info-row">
        <div class="info-label">금액</div>
        <div class="info-value">${contract.monthly_amount.toLocaleString()}원</div>
      </div>

      <div class="divider"></div>

      <div class="info-row">
        <div class="info-label">유효기간</div>
        <div class="info-value">${formatDate(contract.started_at as string | null)} ~ ${formatDate(contract.ended_at as string | null)}</div>
      </div>

      <div class="divider"></div>

      <div class="info-row">
        <div class="info-label">노쇼 처리</div>
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
          <div class="signature-label">고객 서명</div>
          ${contract.student_signature ? `<img src="${contract.student_signature}" class="signature-image" alt="고객 서명" />` : '<div style="padding: 20px; text-align: center; color: #8e8e93;">서명이 없습니다</div>'}
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
          <div class="signature-label">고객 서명</div>
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
    
    <div class="footer-note">
      본 안내는 패스 북 시스템에서 자동 발송 되었습니다.
    </div>
  </div>
</body>
</html>
    `.trim();

    return html;
  }

  /**
   * 예약 생성
   */
  async createReservation(userId: number, contractId: number, dto: { reserved_date: string; reserved_time?: string | null }) {
    // 계약서 확인
    const contract = await this.prisma.contract.findFirst({
      where: {
        id: contractId,
        user_id: userId,
      },
    });

    if (!contract) {
      throw new NotFoundException('계약서를 찾을 수 없습니다.');
    }

    // 예약 날짜 파싱 (YYYY-MM-DD 형식을 UTC 기준으로 파싱)
    const dateStr = dto.reserved_date;
    let reservedDate: Date;
    if (dateStr.includes('T')) {
      // ISO 문자열인 경우
      reservedDate = new Date(dateStr);
      reservedDate.setHours(0, 0, 0, 0);
    } else {
      // YYYY-MM-DD 형식인 경우 UTC 기준으로 파싱 (시간대 문제 방지)
      const [year, month, day] = dateStr.split('-').map(Number);
      reservedDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    }

    // 계약 기간 확인
    if (contract.started_at) {
      const startDate = new Date(contract.started_at);
      startDate.setHours(0, 0, 0, 0);
      if (reservedDate < startDate) {
        throw new BadRequestException('예약 날짜는 계약 시작일 이후여야 합니다.');
      }
    }

    if (contract.ended_at) {
      const endDate = new Date(contract.ended_at);
      endDate.setHours(23, 59, 59, 999);
      if (reservedDate > endDate) {
        throw new BadRequestException('예약 날짜는 계약 종료일 이전이어야 합니다.');
      }
    }

    // 중복 예약 확인
    const existing = await (this.prisma as any).reservation.findFirst({
      where: {
        contract_id: contractId,
        reserved_date: reservedDate,
      },
    });

    if (existing) {
      throw new BadRequestException('이미 예약된 날짜입니다.');
    }

    // 예약 생성
    const reservation = await (this.prisma as any).reservation.create({
      data: {
        contract_id: contractId,
        reserved_date: reservedDate,
        reserved_time: dto.reserved_time || null,
      },
    });

    return reservation;
  }

  /**
   * 예약 목록 조회
   */
  async getReservations(userId: number, contractId: number) {
    // 계약서 확인
    const contract = await this.prisma.contract.findFirst({
      where: {
        id: contractId,
        user_id: userId,
      },
    });

    if (!contract) {
      throw new NotFoundException('계약서를 찾을 수 없습니다.');
    }

    // 예약 목록 조회
    const reservations = await (this.prisma as any).reservation.findMany({
      where: {
        contract_id: contractId,
      },
      orderBy: {
        reserved_date: 'asc',
      },
    });

    // 각 예약 날짜에 대한 출결 로그 존재 여부 확인 (한 번에 조회)
    if (reservations.length === 0) {
      return reservations;
    }

    // 예약 날짜 범위 계산 (UTC와 로컬 시간 모두 고려)
    const reservationDateRanges: Array<{ date: Date; nextDay: Date; dateStr: string }> = [];
    reservations.forEach((r: any) => {
      const reservedDate = r.reserved_date instanceof Date ? r.reserved_date : new Date(r.reserved_date);
      // UTC 기준 날짜
      const dateUtc = new Date(Date.UTC(
        reservedDate.getFullYear(),
        reservedDate.getMonth(),
        reservedDate.getDate(),
        0, 0, 0, 0
      ));
      const nextDayUtc = new Date(dateUtc);
      nextDayUtc.setUTCDate(nextDayUtc.getUTCDate() + 1);
      
      // 로컬 시간 기준 날짜
      const dateLocal = new Date(reservedDate.getFullYear(), reservedDate.getMonth(), reservedDate.getDate(), 0, 0, 0, 0);
      const nextDayLocal = new Date(dateLocal);
      nextDayLocal.setDate(nextDayLocal.getDate() + 1);
      
      const dateStr = reservedDate instanceof Date
        ? reservedDate.toISOString().split('T')[0]
        : reservedDate.split('T')[0];
      
      reservationDateRanges.push(
        { date: dateUtc, nextDay: nextDayUtc, dateStr },
        { date: dateLocal, nextDay: nextDayLocal, dateStr }
      );
    });

    // 모든 예약 날짜에 대한 출결 로그를 한 번에 조회
    // occurred_at만 확인 (substitute_at은 대체일 정보일 뿐, 해당 날짜의 출결 처리 여부와 무관)
    const allAttendanceLogs = await this.prisma.attendanceLog.findMany({
      where: {
        user_id: userId,
        contract_id: contractId,
        voided: false,
        OR: reservationDateRanges.map((range: { date: Date; nextDay: Date }) => ({
          occurred_at: {
            gte: range.date,
            lt: range.nextDay,
          },
        })),
      },
      select: {
        id: true,
        occurred_at: true,
      },
    });

    // 출결 로그 존재 여부를 날짜별로 매핑 (로컬 시간 기준으로 날짜 추출)
    const attendanceLogMap = new Map<string, boolean>();
    allAttendanceLogs.forEach((log) => {
      const logDate = new Date(log.occurred_at);
      // 로컬 시간 기준으로 날짜 문자열 생성 (YYYY-MM-DD)
      const year = logDate.getFullYear();
      const month = String(logDate.getMonth() + 1).padStart(2, '0');
      const day = String(logDate.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      attendanceLogMap.set(dateStr, true);
      this.logger.debug(`[Contracts] Found attendance log for date: ${dateStr}, occurred_at: ${log.occurred_at}`);
    });

    // 예약에 출결 로그 정보 추가
    return reservations.map((reservation: any) => {
      // Date 객체를 로컬 시간 기준으로 YYYY-MM-DD 형식으로 변환
      let dateStr: string;
      if (reservation.reserved_date instanceof Date) {
        const date = reservation.reserved_date;
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        dateStr = `${year}-${month}-${day}`;
      } else if (typeof reservation.reserved_date === 'string') {
        dateStr = reservation.reserved_date.includes('T')
          ? reservation.reserved_date.split('T')[0]
          : reservation.reserved_date;
      } else {
        // fallback
        dateStr = new Date(reservation.reserved_date).toISOString().split('T')[0];
      }
      
      const hasLog = attendanceLogMap.get(dateStr) || false;
      
      this.logger.debug(`[Contracts] Reservation ${reservation.id}: reserved_date=${reservation.reserved_date}, dateStr=${dateStr}, hasLog=${hasLog}`);
      
      return {
        ...reservation,
        has_attendance_log: hasLog,
      };
    });
  }

  /**
   * 전체 예약 조회 (모든 계약의 예약을 날짜별로 그룹핑)
   */
  async getAllReservations(userId: number) {
    // 사용자의 모든 활성 계약 조회 (confirmed 또는 sent 상태)
    const contracts = await this.prisma.contract.findMany({
      where: {
        user_id: userId,
        status: { in: ['confirmed', 'sent'] },
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

    if (contracts.length === 0) {
      return [];
    }

    const contractIds = contracts.map((c) => c.id);

    // 모든 예약 조회
    const reservations = await (this.prisma as any).reservation.findMany({
      where: {
        contract_id: {
          in: contractIds,
        },
      },
      orderBy: {
        reserved_date: 'asc',
      },
    });

    if (reservations.length === 0) {
      return [];
    }

    // 출결 로그 조회 (모든 계약의 출결 로그)
    // 사용처리 완료 = present(사용) 또는 vanish(소멸)
    const attendanceLogs = await this.prisma.attendanceLog.findMany({
      where: {
        user_id: userId,
        contract_id: {
          in: contractIds,
        },
        voided: false,
        status: { in: ['present', 'vanish'] }, // 사용처리 완료: 사용 또는 소멸
      },
      select: {
        contract_id: true,
        occurred_at: true,
      },
    });

    // 출결 로그를 날짜별로 매핑 (계약별로 구분)
    const attendanceLogMap = new Map<string, boolean>();
    attendanceLogs.forEach((log) => {
      const logDate = new Date(log.occurred_at);
      const year = logDate.getFullYear();
      const month = String(logDate.getMonth() + 1).padStart(2, '0');
      const day = String(logDate.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      const key = `${log.contract_id}_${dateStr}`;
      attendanceLogMap.set(key, true);
    });

    // 예약에 계약 정보와 출결 로그 정보 추가
    const reservationsWithDetails = reservations.map((reservation: any) => {
      const contract = contracts.find((c) => c.id === reservation.contract_id);
      
      // 날짜 문자열 생성
      let dateStr: string;
      if (reservation.reserved_date instanceof Date) {
        const date = reservation.reserved_date;
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        dateStr = `${year}-${month}-${day}`;
      } else if (typeof reservation.reserved_date === 'string') {
        dateStr = reservation.reserved_date.includes('T')
          ? reservation.reserved_date.split('T')[0]
          : reservation.reserved_date;
      } else {
        dateStr = new Date(reservation.reserved_date).toISOString().split('T')[0];
      }

      const key = `${reservation.contract_id}_${dateStr}`;
      const hasAttendance = attendanceLogMap.get(key) || false;

      return {
        id: reservation.id,
        contract_id: reservation.contract_id,
        reserved_date: reservation.reserved_date,
        reserved_time: reservation.reserved_time,
        student_name: (contract as any)?.student?.name || '',
        student_id: (contract as any)?.student?.id || null,
        has_attendance: hasAttendance,
      };
    });

    return reservationsWithDetails;
  }

  /**
   * 예약 업데이트
   */
  async updateReservation(userId: number, contractId: number, reservationId: number, dto: { reserved_date?: string; reserved_time?: string | null }) {
    // 계약서 확인
    const contract = await this.prisma.contract.findFirst({
      where: {
        id: contractId,
        user_id: userId,
      },
    });

    if (!contract) {
      throw new NotFoundException('계약서를 찾을 수 없습니다.');
    }

    // 예약 확인
    const reservation = await (this.prisma as any).reservation.findFirst({
      where: {
        id: reservationId,
        contract_id: contractId,
      },
    });

    if (!reservation) {
      throw new NotFoundException('예약을 찾을 수 없습니다.');
    }

    // 업데이트할 데이터 준비
    const updateData: any = {};
    
    if (dto.reserved_date) {
      // YYYY-MM-DD 형식의 문자열을 UTC 기준으로 파싱 (시간대 문제 방지)
      const dateStr = dto.reserved_date;
      let reservedDate: Date;
      if (dateStr.includes('T')) {
        // ISO 문자열인 경우
        reservedDate = new Date(dateStr);
        reservedDate.setHours(0, 0, 0, 0);
      } else {
        // YYYY-MM-DD 형식인 경우 UTC 기준으로 파싱
        const [year, month, day] = dateStr.split('-').map(Number);
        reservedDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      }

      // 계약 기간 확인
      if (contract.started_at) {
        const startDate = new Date(contract.started_at);
        startDate.setHours(0, 0, 0, 0);
        if (reservedDate < startDate) {
          throw new BadRequestException('예약 날짜는 계약 시작일 이후여야 합니다.');
        }
      }

      if (contract.ended_at) {
        const endDate = new Date(contract.ended_at);
        endDate.setHours(23, 59, 59, 999);
        if (reservedDate > endDate) {
          throw new BadRequestException('예약 날짜는 계약 종료일 이전이어야 합니다.');
        }
      }

      // 중복 예약 확인 (자기 자신 제외)
      const existing = await (this.prisma as any).reservation.findFirst({
        where: {
          contract_id: contractId,
          reserved_date: reservedDate,
          id: { not: reservationId },
        },
      });

      if (existing) {
        throw new BadRequestException('이미 예약된 날짜입니다.');
      }

      updateData.reserved_date = reservedDate;
    }

    if (dto.reserved_time !== undefined) {
      updateData.reserved_time = dto.reserved_time;
    }

    // 예약 업데이트
    const updated = await (this.prisma as any).reservation.update({
      where: {
        id: reservationId,
      },
      data: updateData,
    });

    return updated;
  }

  /**
   * 예약 삭제
   */
  async deleteReservation(userId: number, contractId: number, reservationId: number) {
    // 계약서 확인
    const contract = await this.prisma.contract.findFirst({
      where: {
        id: contractId,
        user_id: userId,
      },
    });

    if (!contract) {
      throw new NotFoundException('계약서를 찾을 수 없습니다.');
    }

    // 예약 확인
    const reservation = await (this.prisma as any).reservation.findFirst({
      where: {
        id: reservationId,
        contract_id: contractId,
      },
    });

    if (!reservation) {
      throw new NotFoundException('예약을 찾을 수 없습니다.');
    }

    // 예약 삭제
    await (this.prisma as any).reservation.delete({
      where: {
        id: reservationId,
      },
    });

    return { success: true };
  }
}
