import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InvoicesService } from '../invoices/invoices.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateAttendanceDto, UpdateAttendanceDto, AttendanceStatus } from './dto/create-attendance.dto';

@Injectable()
export class AttendanceService {
  constructor(
    private prisma: PrismaService,
    private invoicesService: InvoicesService,
    private notificationsService: NotificationsService,
  ) {}

  /**
   * 출결 기록 생성
   */
  async create(userId: number, dto: CreateAttendanceDto) {
    // 수강생과 계약서가 해당 사용자의 것인지 확인
    const student = await this.prisma.student.findFirst({
      where: {
        id: dto.student_id,
        user_id: userId,
      },
    });

    if (!student) {
      throw new NotFoundException('수강생을 찾을 수 없습니다.');
    }

    const contract = await this.prisma.contract.findFirst({
      where: {
        id: dto.contract_id,
        user_id: userId,
        student_id: dto.student_id,
      },
    });

    if (!contract) {
      throw new NotFoundException('계약서를 찾을 수 없습니다.');
    }

    // 출결 기록 생성
    // signature_data는 현재 로깅만 하고, 필요시 별도 필드 추가 예정
    if (dto.signature_data) {
      console.log('[Attendance] signature_data received', { length: dto.signature_data.length });
    }

    const attendanceLog = await this.prisma.attendanceLog.create({
      data: {
        user_id: userId,
        student_id: dto.student_id,
        contract_id: dto.contract_id,
        occurred_at: new Date(dto.occurred_at),
        status: dto.status as AttendanceStatus,
        substitute_at: dto.substitute_at ? new Date(dto.substitute_at) : null,
        memo_public: dto.memo_public ?? null,
        memo_internal: dto.memo_internal ?? null,
        recorded_by: userId,
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
            time: true,
          },
        },
      },
    });

    // 정산 재계산 트리거 (당월 반영)
    try {
      await this.invoicesService.recalculateForContractMonth(userId, dto.contract_id, new Date(dto.occurred_at));
    } catch (e) {
      console.warn('[Attendance] invoice recalc failed', e?.message);
    }
    return attendanceLog;
  }

  /**
   * 출결 기록 수정
   */
  async update(userId: number, id: number, dto: UpdateAttendanceDto) {
    // 출결 기록이 해당 사용자의 것인지 확인
    const attendanceLog = await this.prisma.attendanceLog.findFirst({
      where: {
        id,
        user_id: userId,
      },
    });

    if (!attendanceLog) {
      throw new NotFoundException('출결 기록을 찾을 수 없습니다.');
    }

    if (attendanceLog.voided) {
      throw new BadRequestException('이미 취소된 출결 기록입니다.');
    }

    // 출결 기록 수정
    const updated = await this.prisma.attendanceLog.update({
      where: { id },
      data: {
        status: dto.status ? (dto.status as AttendanceStatus) : undefined,
        substitute_at: dto.substitute_at ? new Date(dto.substitute_at) : undefined,
        memo_public: dto.memo_public !== undefined ? dto.memo_public : undefined,
        memo_internal: dto.memo_internal !== undefined ? dto.memo_internal : undefined,
        modified_at: new Date(),
        modified_by: userId,
        change_reason: dto.change_reason,
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
            time: true,
          },
        },
      },
    });

    // 출결 수정 완료 알림 (이벤트 기반, 1회만 발송)
    try {
      await this.notificationsService.createAndSendNotification(
        userId,
        'attendance',
        '출결 수정 알림',
        '출결 수정이 완료되었습니다.',
        `/attendance/${id}`,
        {
          relatedId: `attendance:${id}`,
        },
      );
    } catch (error) {
      // 알림 실패해도 수정 결과는 반환
      console.error('[Attendance] Failed to send notification:', error);
    }

    return updated;
  }

  /**
   * 출결 기록 취소 (void)
   */
  async void(userId: number, id: number, voidReason: string) {
    const attendanceLog = await this.prisma.attendanceLog.findFirst({
      where: {
        id,
        user_id: userId,
      },
    });

    if (!attendanceLog) {
      throw new NotFoundException('출결 기록을 찾을 수 없습니다.');
    }

    if (attendanceLog.voided) {
      throw new BadRequestException('이미 취소된 출결 기록입니다.');
    }

    const updated = await this.prisma.attendanceLog.update({
      where: { id },
      data: {
        voided: true,
        void_reason: voidReason,
        modified_at: new Date(),
        modified_by: userId,
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
            time: true,
          },
        },
      },
    });
    // 정산 재계산 트리거
    try {
      await this.invoicesService.recalculateForContractMonth(userId, updated.contract_id, updated.occurred_at);
    } catch (e) {
      console.warn('[Attendance] invoice recalc failed', e?.message);
    }
    return updated;
  }

  /**
   * 수강생의 출결 기록 조회
   */
  async findByStudent(userId: number, studentId: number) {
    // 수강생이 해당 사용자의 것인지 확인
    const student = await this.prisma.student.findFirst({
      where: {
        id: studentId,
        user_id: userId,
      },
    });

    if (!student) {
      throw new NotFoundException('수강생을 찾을 수 없습니다.');
    }

    return this.prisma.attendanceLog.findMany({
      where: {
        user_id: userId,
        student_id: studentId,
        voided: false,
      },
      include: {
        contract: {
          select: {
            id: true,
            subject: true,
            time: true,
          },
        },
      },
      orderBy: {
        occurred_at: 'desc',
      },
    });
  }

  /**
   * 계약서의 출결 기록 조회
   */
  async findByContract(userId: number, contractId: number) {
    // 계약서가 해당 사용자의 것인지 확인
    const contract = await this.prisma.contract.findFirst({
      where: {
        id: contractId,
        user_id: userId,
      },
    });

    if (!contract) {
      throw new NotFoundException('계약서를 찾을 수 없습니다.');
    }

    return this.prisma.attendanceLog.findMany({
      where: {
        user_id: userId,
        contract_id: contractId,
        voided: false,
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
      orderBy: {
        occurred_at: 'desc',
      },
    });
  }

  /**
   * 미처리 출결 조회
   * 오늘 날짜가 지난 수업 중 출결 기록이 없는 것들을 반환
   */
  async findUnprocessed(userId: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

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
        day_of_week: true,
        time: true,
        started_at: true,
        ended_at: true,
        created_at: true,
        student: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
    });

    const unprocessedItems: Array<{
      contract_id: number;
      student_id: number;
      student_name: string;
      subject: string;
      day_of_week: string[];
      time: string | null;
      missed_date: string; // YYYY-MM-DD 형식
    }> = [];

    // 각 계약서에 대해 미처리 출결 찾기
    for (const contract of contracts) {
      const dayOfWeekArray = (contract.day_of_week as string[]) || [];
      if (dayOfWeekArray.length === 0) continue;

      // 계약 시작일, 종료일, 생성일 확인
      const contractStartDate = contract.started_at ? new Date(contract.started_at) : null;
      const contractEndDate = contract.ended_at ? new Date(contract.ended_at) : null;
      const contractCreatedAt = contract.created_at ? new Date(contract.created_at) : null;

      // 체크할 날짜 범위 결정
      // 시작일: 계약 생성일 이후부터만 체크 (계약 생성일 이전에는 계약이 존재하지 않았으므로)
      // - started_at이 있으면: max(started_at, created_at) 사용
      // - started_at이 없으면: created_at부터 체크
      // 종료일: 오늘 이전까지만 (오늘은 홈 화면에서 처리)
      let checkStartDate: Date;
      if (!contractCreatedAt) {
        // created_at이 없으면 스킵 (데이터 오류)
        continue;
      }

      const createdDate = new Date(contractCreatedAt);
      createdDate.setHours(0, 0, 0, 0);

      if (contractStartDate) {
        const startDate = new Date(contractStartDate);
        startDate.setHours(0, 0, 0, 0);
        // started_at과 created_at 중 더 늦은 날짜 사용
        checkStartDate = startDate > createdDate ? startDate : createdDate;
      } else {
        // started_at이 없으면 계약 생성일부터 체크
        checkStartDate = createdDate;
      }

      // 체크 종료일: 계약 종료일이 있고 오늘보다 이전이면 계약 종료일까지, 아니면 오늘 이전까지
      let checkEndDate: Date;
      if (contractEndDate && contractEndDate < today) {
        checkEndDate = new Date(contractEndDate);
        checkEndDate.setHours(23, 59, 59, 999);
      } else {
        checkEndDate = new Date(today);
        checkEndDate.setHours(0, 0, 0, 0);
        checkEndDate.setMilliseconds(checkEndDate.getMilliseconds() - 1); // 오늘 00:00:00 직전까지
      }

      // 계약 시작일이 오늘 이후면 체크할 필요 없음
      if (checkStartDate >= today) {
        continue;
      }

      // 날짜 범위가 유효하지 않으면 스킵
      if (checkStartDate > checkEndDate) {
        continue;
      }

      for (let d = new Date(checkStartDate); d <= checkEndDate; d.setDate(d.getDate() + 1)) {
        const dayOfWeek = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getDay()];
        
        // 계약서의 요일에 포함되는지 확인
        if (!dayOfWeekArray.includes(dayOfWeek) && !dayOfWeekArray.includes('ANY')) {
          continue;
        }

        // 해당 날짜에 출결 기록이 있는지 확인
        const dateStart = new Date(d);
        dateStart.setHours(0, 0, 0, 0);
        const dateEnd = new Date(d);
        dateEnd.setHours(23, 59, 59, 999);

        const existingLog = await this.prisma.attendanceLog.findFirst({
          where: {
            user_id: userId,
            contract_id: contract.id,
            occurred_at: {
              gte: dateStart,
              lte: dateEnd,
            },
            voided: false,
          },
        });

        // 출결 기록이 없으면 미처리로 추가
        if (!existingLog) {
          const missedDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          unprocessedItems.push({
            contract_id: contract.id,
            student_id: contract.student.id,
            student_name: contract.student.name,
            subject: contract.subject,
            day_of_week: dayOfWeekArray,
            time: contract.time,
            missed_date: missedDateStr,
          });
        }
      }
    }

    // 날짜순 정렬 (오래된 것부터)
    unprocessedItems.sort((a, b) => a.missed_date.localeCompare(b.missed_date));

    return unprocessedItems;
  }

  /**
   * 미처리 출결 개수 조회 (홈 화면용)
   */
  async countUnprocessed(userId: number): Promise<number> {
    const unprocessed = await this.findUnprocessed(userId);
    return unprocessed.length;
  }
}
