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

    // 횟수계약(계약기간없음) 처리: 횟수 모두 차감되었을 때 청구서 생성
    try {
      const policy = (contract.policy_snapshot ?? {}) as Record<string, any>;
      const totalSessions = typeof policy.total_sessions === 'number' ? policy.total_sessions : 0;
      const isSessionBased = totalSessions > 0 && !contract.ended_at; // 횟수계약 (계약기간없음)
      
      if (isSessionBased) {
        // 연장 이력 확인
        const extensions = Array.isArray(policy.extensions) ? policy.extensions : [];
        
        // 사용된 횟수 계산 (전체 출결기록 기준)
        const allUsedSessions = await this.prisma.attendanceLog.count({
          where: {
            user_id: userId,
            contract_id: contract.id,
            voided: false,
            status: { in: ['present', 'absent', 'substitute', 'vanish'] },
          },
        });
        
        // 연장이 있는 경우: 이전 계약(연장 전)의 사용된 횟수 계산
        let previousContractUsedSessions = 0;
        if (extensions.length > 0) {
          const lastExtension = extensions[extensions.length - 1];
          const lastExtensionDate = lastExtension.extended_at 
            ? new Date(lastExtension.extended_at)
            : null;
          
          if (lastExtensionDate) {
            // 마지막 연장 시점 이전의 출결기록만 카운트
            previousContractUsedSessions = await this.prisma.attendanceLog.count({
              where: {
                user_id: userId,
                contract_id: contract.id,
                voided: false,
                status: { in: ['present', 'absent', 'substitute', 'vanish'] },
                occurred_at: {
                  lt: lastExtensionDate,
                },
              },
            });
          }
        }
        
        // 후불: 횟수 모두 차감되었을 때 "오늘청구" 이동을 위해 청구서 존재 여부만 확인
        // 계약서 전송 시 이미 정산서가 생성되어 있어야 하며, 없을 경우에만 생성
        if (contract.billing_type === 'postpaid' && allUsedSessions >= totalSessions) {
          // 기존 미전송 청구서가 있는지 확인 (contract_id 기준)
          const existingInvoice = await this.prisma.invoice.findFirst({
            where: {
              user_id: userId,
              contract_id: contract.id,
              send_status: 'not_sent',
            },
            orderBy: {
              created_at: 'desc',
            },
          });

          if (!existingInvoice) {
            const now = new Date();
            const year = now.getFullYear();
            const month = now.getMonth() + 1;
            await this.invoicesService.createInvoiceForSessionBasedContract(userId, contract, year, month);
          }
        }
        
        // 확정 개념: 선불 횟수 계약 (횟수 모두 소진되기 전 연장처리)
        // 직전 계약의 마지막 회차 출결 처리 시점에 정산서 생성/마감
        if (contract.billing_type === 'prepaid' && extensions.length > 0) {
          // 현재 생성해야 할 청구서가 몇 번째 연장인지 확인
          const existingInvoices = await this.prisma.invoice.findMany({
            where: {
              user_id: userId,
              student_id: contract.student_id,
              contract_id: contract.id,
            },
          });
          
          // 현재 생성해야 할 청구서 번호 (1=첫 계약, 2=2회 연장, 3=3회 연장...)
          const nextInvoiceNumber = existingInvoices.length + 1;
          
          // 출결 기록 생성 후 직전 계약의 잔여 회차 소진 여부 확인
          // allUsedSessions는 방금 생성된 출결 기록을 포함하므로, 직전 계약의 잔여 회차 소진 여부를 정확히 확인 가능
          
          if (nextInvoiceNumber === 2) {
            // 2회 연장의 청구서: 최초 계약의 횟수 소진 시점 확인
            const firstContractTotalSessions = extensions.reduce(
              (sum: number, ext: any) => sum - (ext.added_sessions || 0),
              totalSessions
            );
            
            // 첫 계약의 사용된 횟수 계산: 연장 시점 이전의 출결 기록만 카운트
            // (방금 생성된 출결 기록도 이미 DB에 저장되어 있으므로 count에 포함됨)
            // 첫 계약의 사용된 횟수:
            // 확정 개념상 "직전 계약의 모든 회차가 소진되는 시점"이 중요하므로,
            // 연장 시점(before/after)과 관계없이 전체 사용된 횟수 기준으로 판단한다.
            // 예) 2회 선불 후 4회 연장, 1회 남은 시점에서 연장한 경우
            //  - 연장 시점 이후에 발생한 출결이라도, 총 사용 횟수가 최초 계약 횟수(2회)에 도달하면
            //    직전 계약이 모두 소진된 것으로 보고 연장분 정산서를 생성해야 함.
            const firstContractUsedSessions = allUsedSessions;
            
            // 첫 계약의 사용된 횟수가 첫 계약의 총 횟수와 같거나 크면 2회 연장 청구서 생성
            // 확정 개념: 직전 계약의 마지막 회차 소진 시점에 정산서 생성
            console.log(`[Attendance] Contract ${contract.id}: firstContractUsedSessions=${firstContractUsedSessions}, firstContractTotalSessions=${firstContractTotalSessions}, allUsedSessions=${allUsedSessions}`);
            if (firstContractUsedSessions >= firstContractTotalSessions) {
              // 횟수제 선불 계약의 경우 year/month는 unique constraint를 피하기 위해 다음 달로 설정
              // (전송 시점에 실제 청구월로 업데이트됨)
              // 첫 계약의 모든 회차가 소진된 시점의 다음 달을 사용
              const lastAttendanceLog = await this.prisma.attendanceLog.findFirst({
                where: {
                  user_id: userId,
                  contract_id: contract.id,
                  voided: false,
                  status: { in: ['present', 'absent', 'substitute', 'vanish'] },
                },
                orderBy: {
                  occurred_at: 'desc',
                },
              });

              let year: number;
              let month: number;
              
              if (lastAttendanceLog) {
                // 마지막 출결 기록의 날짜를 기준으로 다음 달 계산
                const lastAttendanceDate = new Date(lastAttendanceLog.occurred_at);
                year = lastAttendanceDate.getFullYear();
                month = lastAttendanceDate.getMonth() + 1;
                // 다음 달로 설정 (unique constraint 방지)
                month += 1;
                if (month > 12) {
                  month = 1;
                  year += 1;
                }
              } else {
                // 출결 기록이 없으면 현재 시점의 다음 달 사용
                const now = new Date();
                year = now.getFullYear();
                month = now.getMonth() + 2; // 다음 달
                if (month > 12) {
                  month = month - 12;
                  year += 1;
                }
              }
              
              await this.invoicesService.createInvoiceForSessionBasedContract(userId, contract, year, month);
              console.log(`[Attendance] Prepaid session-based invoice created (first extension) for contract ${contract.id}, student ${contract.student_id}, year=${year}, month=${month}`);
            } else {
              console.log(`[Attendance] Contract ${contract.id}: Not creating invoice yet. firstContractUsedSessions=${firstContractUsedSessions} < firstContractTotalSessions=${firstContractTotalSessions}`);
            }
          } else if (nextInvoiceNumber > 2 && nextInvoiceNumber <= extensions.length + 1) {
            // 3회 연장 이상의 청구서: 이전 연장의 횟수 소진 시점 확인
            // 예: 3회 연장 청구서는 2회 연장의 횟수가 소진되었을 때 생성
            const previousExtension = extensions[nextInvoiceNumber - 3]; // 이전 연장
            const previousExtensionDate = previousExtension.extended_at 
              ? new Date(previousExtension.extended_at)
              : null;
            
            if (previousExtensionDate) {
              // 이전 연장 시점부터 현재까지의 사용된 횟수 계산 (방금 생성된 출결 기록 포함)
              const previousExtensionUsedSessions = await this.prisma.attendanceLog.count({
                where: {
                  user_id: userId,
                  contract_id: contract.id,
                  voided: false,
                  status: { in: ['present', 'absent', 'substitute', 'vanish'] },
                  occurred_at: {
                    gte: previousExtensionDate,
                  },
                },
              });
              
              // 이전 연장으로 추가된 횟수
              const previousExtensionAddedSessions = previousExtension.added_sessions || 0;
              
              // 이전 연장의 사용된 횟수가 이전 연장의 총 횟수와 같거나 크면 다음 청구서 생성
              // 확정 개념: 직전 계약의 마지막 회차 소진 시점에 정산서 생성
              if (previousExtensionUsedSessions >= previousExtensionAddedSessions) {
                // 횟수제 선불 계약의 경우 year/month는 unique constraint를 피하기 위해 다음 달로 설정
                const lastAttendanceLog = await this.prisma.attendanceLog.findFirst({
                  where: {
                    user_id: userId,
                    contract_id: contract.id,
                    voided: false,
                    status: { in: ['present', 'absent', 'substitute', 'vanish'] },
                    occurred_at: {
                      gte: previousExtensionDate,
                    },
                  },
                  orderBy: {
                    occurred_at: 'desc',
                  },
                });

                let year: number;
                let month: number;
                
                if (lastAttendanceLog) {
                  // 마지막 출결 기록의 날짜를 기준으로 다음 달 계산
                  const lastAttendanceDate = new Date(lastAttendanceLog.occurred_at);
                  year = lastAttendanceDate.getFullYear();
                  month = lastAttendanceDate.getMonth() + 1;
                  // 다음 달로 설정 (unique constraint 방지)
                  month += 1;
                  if (month > 12) {
                    month = 1;
                    year += 1;
                  }
                } else {
                  // 출결 기록이 없으면 현재 시점의 다음 달 사용
                  const now = new Date();
                  year = now.getFullYear();
                  month = now.getMonth() + 2; // 다음 달
                  if (month > 12) {
                    month = month - 12;
                    year += 1;
                  }
                }
                
                await this.invoicesService.createInvoiceForSessionBasedContract(userId, contract, year, month);
                console.log(`[Attendance] Prepaid session-based invoice created (extension ${nextInvoiceNumber - 1}) for contract ${contract.id}, year=${year}, month=${month}`);
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('[Attendance] session-based invoice creation failed', e?.message);
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
        if (!dayOfWeekArray.includes(dayOfWeek)) {
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
