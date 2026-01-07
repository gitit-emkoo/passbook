import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InvoicesService } from '../invoices/invoices.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateAttendanceDto, UpdateAttendanceDto, AttendanceStatus } from './dto/create-attendance.dto';
import { SmsService } from '../sms/sms.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private prisma: PrismaService,
    private invoicesService: InvoicesService,
    private notificationsService: NotificationsService,
    private smsService: SmsService,
    private configService: ConfigService,
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
        amount: dto.amount ?? null, // 차감 금액 또는 사용 횟수
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

    // 대체일 지정 시 예약 날짜 업데이트
    if (dto.status === 'substitute' && dto.substitute_at) {
      try {
        const occurredDate = new Date(dto.occurred_at);
        // 원래 예약 날짜와 계약 ID로 예약 찾기
        const occurredDateStart = new Date(occurredDate.getFullYear(), occurredDate.getMonth(), occurredDate.getDate(), 0, 0, 0, 0);
        const occurredDateEnd = new Date(occurredDate.getFullYear(), occurredDate.getMonth(), occurredDate.getDate(), 23, 59, 59, 999);
        
        const reservation = await this.prisma.reservation.findFirst({
          where: {
            contract_id: dto.contract_id,
            reserved_date: {
              gte: occurredDateStart,
              lte: occurredDateEnd,
            },
          },
        });

        if (reservation) {
          // 대체일로 예약 날짜 업데이트
          const substituteDate = new Date(dto.substitute_at);
          const substituteDateStart = new Date(substituteDate.getFullYear(), substituteDate.getMonth(), substituteDate.getDate(), 0, 0, 0, 0);
          
          const updatedReservation = await this.prisma.reservation.update({
            where: { id: reservation.id },
            data: {
              reserved_date: substituteDateStart,
            },
          });
          
          this.logger.log(`[Attendance] Updated reservation ${reservation.id} date from ${occurredDate.toISOString()} to ${substituteDateStart.toISOString()}, updated reserved_date: ${updatedReservation.reserved_date}`);
        } else {
          this.logger.warn(`[Attendance] No reservation found for contract ${dto.contract_id} on ${occurredDate.toISOString()}`);
        }
      } catch (error: any) {
        // 예약 업데이트 실패해도 출결 기록은 유지
        this.logger.error(`[Attendance] Failed to update reservation date:`, error?.message || error);
      }
    }

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
              // 실제 소진 시점의 year/month 사용 (다음 달로 미루지 않음)
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
                // 마지막 출결 기록의 날짜를 기준으로 실제 시점 사용
                const lastAttendanceDate = new Date(lastAttendanceLog.occurred_at);
                year = lastAttendanceDate.getFullYear();
                month = lastAttendanceDate.getMonth() + 1;
              } else {
                // 출결 기록이 없으면 현재 시점 사용
                const now = new Date();
                year = now.getFullYear();
                month = now.getMonth() + 1;
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
                // 실제 소진 시점의 year/month 사용 (다음 달로 미루지 않음)
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
                  // 마지막 출결 기록의 날짜를 기준으로 실제 시점 사용
                  const lastAttendanceDate = new Date(lastAttendanceLog.occurred_at);
                  year = lastAttendanceDate.getFullYear();
                  month = lastAttendanceDate.getMonth() + 1;
                } else {
                  // 출결 기록이 없으면 현재 시점 사용
                  const now = new Date();
                  year = now.getFullYear();
                  month = now.getMonth() + 1;
                }
                
                await this.invoicesService.createInvoiceForSessionBasedContract(userId, contract, year, month);
                console.log(`[Attendance] Prepaid session-based invoice created (extension ${nextInvoiceNumber - 1}) for contract ${contract.id}, year=${year}, month=${month}`);
              }
            }
          }
        }
      }

      // 금액권 연장 처리 (뷰티앱: 선불 횟수 계약 로직 사용)
      const isAmountBased = contract.ended_at && totalSessions === 0; // 금액권
      
      if (isAmountBased && contract.billing_type === 'prepaid') {
        // 연장 이력 확인
        const extensions = Array.isArray(policy.extensions) ? policy.extensions : [];
        
        if (extensions.length > 0) {
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
          
          // 사용된 금액 계산 (전체 출결기록 기준)
          const allUsedAmountResult = await this.prisma.attendanceLog.aggregate({
            where: {
              user_id: userId,
              contract_id: contract.id,
              voided: false,
              status: { in: ['present', 'absent', 'substitute', 'vanish'] },
              amount: { not: null },
            },
            _sum: {
              amount: true,
            },
          });
          const allUsedAmount = allUsedAmountResult._sum.amount ?? 0;
          
          if (nextInvoiceNumber === 2) {
            // 2회 연장의 청구서: 최초 계약의 금액 소진 시점 확인
            const firstContractTotalAmount = extensions.reduce(
              (sum: number, ext: any) => sum - (ext.added_amount || 0),
              contract.monthly_amount || 0
            );
            
            // 첫 계약의 사용된 금액: 전체 사용 금액
            const firstContractUsedAmount = allUsedAmount;
            
            // 첫 계약의 사용된 금액이 첫 계약의 총 금액과 같거나 크면 2회 연장 청구서 생성
            // 확정 개념: 직전 계약의 마지막 금액 소진 시점에 정산서 생성
            console.log(`[Attendance] Contract ${contract.id}: firstContractUsedAmount=${firstContractUsedAmount}, firstContractTotalAmount=${firstContractTotalAmount}, allUsedAmount=${allUsedAmount}`);
            if (firstContractUsedAmount >= firstContractTotalAmount) {
              // 실제 소진 시점의 year/month 사용 (다음 달로 미루지 않음)
              const lastAttendanceLog = await this.prisma.attendanceLog.findFirst({
                where: {
                  user_id: userId,
                  contract_id: contract.id,
                  voided: false,
                  status: { in: ['present', 'absent', 'substitute', 'vanish'] },
                  amount: { not: null },
                },
                orderBy: {
                  occurred_at: 'desc',
                },
              });

              let year: number;
              let month: number;
              
              if (lastAttendanceLog) {
                // 마지막 출결 기록의 날짜를 기준으로 실제 시점 사용
                const lastAttendanceDate = new Date(lastAttendanceLog.occurred_at);
                year = lastAttendanceDate.getFullYear();
                month = lastAttendanceDate.getMonth() + 1;
              } else {
                // 출결 기록이 없으면 현재 시점 사용
                const now = new Date();
                year = now.getFullYear();
                month = now.getMonth() + 1;
              }
              
              await this.invoicesService.createInvoiceForSessionBasedContract(userId, contract, year, month);
              console.log(`[Attendance] Prepaid amount-based invoice created (first extension) for contract ${contract.id}, student ${contract.student_id}, year=${year}, month=${month}`);
            } else {
              console.log(`[Attendance] Contract ${contract.id}: Not creating invoice yet. firstContractUsedAmount=${firstContractUsedAmount} < firstContractTotalAmount=${firstContractTotalAmount}`);
            }
          } else if (nextInvoiceNumber > 2 && nextInvoiceNumber <= extensions.length + 1) {
            // 3회 연장 이상의 청구서: 이전 연장의 금액 소진 시점 확인
            const previousExtension = extensions[nextInvoiceNumber - 3]; // 이전 연장
            const previousExtensionDate = previousExtension.extended_at 
              ? new Date(previousExtension.extended_at)
              : null;
            
            if (previousExtensionDate) {
              // 이전 연장 시점부터 현재까지의 사용된 금액 계산 (방금 생성된 출결 기록 포함)
              const previousExtensionUsedAmountResult = await this.prisma.attendanceLog.aggregate({
                where: {
                  user_id: userId,
                  contract_id: contract.id,
                  voided: false,
                  status: { in: ['present', 'absent', 'substitute', 'vanish'] },
                  occurred_at: {
                    gte: previousExtensionDate,
                  },
                  amount: { not: null },
                },
                _sum: {
                  amount: true,
                },
              });
              
              const previousExtensionUsedAmount = previousExtensionUsedAmountResult._sum.amount ?? 0;
              
              // 이전 연장으로 추가된 금액
              const previousExtensionAddedAmount = previousExtension.added_amount || 0;
              
              // 이전 연장의 사용된 금액이 이전 연장의 총 금액과 같거나 크면 다음 청구서 생성
              // 확정 개념: 직전 계약의 마지막 금액 소진 시점에 정산서 생성
              if (previousExtensionUsedAmount >= previousExtensionAddedAmount) {
                // 실제 소진 시점의 year/month 사용 (다음 달로 미루지 않음)
                const lastAttendanceLog = await this.prisma.attendanceLog.findFirst({
                  where: {
                    user_id: userId,
                    contract_id: contract.id,
                    voided: false,
                    status: { in: ['present', 'absent', 'substitute', 'vanish'] },
                    occurred_at: {
                      gte: previousExtensionDate,
                    },
                    amount: { not: null },
                  },
                  orderBy: {
                    occurred_at: 'desc',
                  },
                });

                let year: number;
                let month: number;
                
                if (lastAttendanceLog) {
                  // 마지막 출결 기록의 날짜를 기준으로 실제 시점 사용
                  const lastAttendanceDate = new Date(lastAttendanceLog.occurred_at);
                  year = lastAttendanceDate.getFullYear();
                  month = lastAttendanceDate.getMonth() + 1;
                } else {
                  // 출결 기록이 없으면 현재 시점 사용
                  const now = new Date();
                  year = now.getFullYear();
                  month = now.getMonth() + 1;
                }
                
                await this.invoicesService.createInvoiceForSessionBasedContract(userId, contract, year, month);
                console.log(`[Attendance] Prepaid amount-based invoice created (extension ${nextInvoiceNumber - 1}) for contract ${contract.id}, year=${year}, month=${month}`);
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('[Attendance] session-based invoice creation failed', e?.message);
    }

    // 사용처리 완료 알림 (이벤트 기반, status가 'present'일 때만)
    if (dto.status === 'present') {
      try {
        const studentName = attendanceLog.student?.name || '고객';
        await this.notificationsService.createAndSendNotification(
          userId,
          'attendance',
          '사용처리 완료',
          `${studentName}님의 이용권 사용처리가 완료되었습니다.`,
          `/students/${dto.student_id}`,
          {
            relatedId: `attendance:${attendanceLog.id}`,
          },
        );
      } catch (error: any) {
        // 알림 실패해도 출결 기록은 유지
        this.logger.error(`[Attendance] Failed to send notification for attendance ${attendanceLog.id}:`, error?.message || error);
      }
    }

    // SMS 전송은 미리보기 화면에서 사용자가 직접 전송 버튼을 눌러야 함
    // sms_sent는 기본값 false로 설정됨

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

    return updated;
  }

  /**
   * SMS 전송 완료 표시
   * 미리보기 화면에서 전송 버튼을 눌렀을 때 호출
   */
  async markSmsSent(userId: number, id: number): Promise<{ success: boolean; studentPhone?: string }> {
    const attendanceLog = await this.prisma.attendanceLog.findFirst({
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
          },
        },
      },
    });

    if (!attendanceLog) {
      throw new NotFoundException('출결 기록을 찾을 수 없습니다.');
    }

    if (attendanceLog.voided) {
      throw new BadRequestException('이미 취소된 출결 기록입니다.');
    }

    // sms_sent = true로 업데이트
    await this.prisma.attendanceLog.update({
      where: { id },
      data: {
        sms_sent: true,
      },
    });

    this.logger.log(`[Attendance] SMS sent marked for attendance ${id}`);

    return {
      success: true,
      studentPhone: attendanceLog.student?.phone || undefined,
    };
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
   * 미처리 출결 조회 (노쇼 처리)
   * 오늘 이전 날짜의 예약 중 출결 기록이 없는 것들을 반환
   */
  async findUnprocessed(userId: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 오늘 이전 날짜의 예약 조회
    const pastReservations = await this.prisma.reservation.findMany({
      where: {
        contract: {
          user_id: userId,
          status: { in: ['confirmed', 'sent'] },
          student: {
            is_active: true,
          },
        },
        reserved_date: {
          lt: today, // 오늘 이전 날짜만
        },
      },
      include: {
        contract: {
          select: {
            id: true,
            subject: true,
            time: true,
            student: {
              select: {
                id: true,
                name: true,
                phone: true,
              },
            },
          },
        },
      },
      orderBy: {
        reserved_date: 'asc',
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

    // 각 예약에 대해 출결 기록 확인
    for (const reservation of pastReservations) {
      const reservedDate = reservation.reserved_date instanceof Date 
        ? reservation.reserved_date 
        : new Date(reservation.reserved_date);
      
      const dateStart = new Date(reservedDate);
      dateStart.setHours(0, 0, 0, 0);
      const dateEnd = new Date(reservedDate);
      dateEnd.setHours(23, 59, 59, 999);

      // 해당 날짜에 출결 기록이 있는지 확인
      const existingLog = await this.prisma.attendanceLog.findFirst({
        where: {
          user_id: userId,
          contract_id: reservation.contract_id,
          occurred_at: {
            gte: dateStart,
            lte: dateEnd,
          },
          voided: false,
        },
      });

      // 출결 기록이 없으면 미처리로 추가
      if (!existingLog) {
        const missedDateStr = `${reservedDate.getFullYear()}-${String(reservedDate.getMonth() + 1).padStart(2, '0')}-${String(reservedDate.getDate()).padStart(2, '0')}`;
        unprocessedItems.push({
          contract_id: reservation.contract_id,
          student_id: reservation.contract.student.id,
          student_name: reservation.contract.student.name,
          subject: reservation.contract.subject,
          day_of_week: [], // 뷰티앱에서는 요일 정보 불필요
          time: reservation.reserved_time || reservation.contract.time,
          missed_date: missedDateStr,
        });
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

  /**
   * 사용처리 완료 안내 페이지 HTML 생성 (공개 엔드포인트)
   */
  async generateAttendanceViewHtml(attendanceLogId: number): Promise<string> {
    // 공개 엔드포인트: userId 검증 없이 출결 기록 조회
    const attendanceLog = await this.prisma.attendanceLog.findUnique({
      where: { id: attendanceLogId },
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
            monthly_amount: true,
          },
        },
      },
    });

    if (!attendanceLog) {
      throw new NotFoundException('사용처리 기록을 찾을 수 없습니다.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: attendanceLog.user_id },
      select: { name: true, org_code: true },
    });

    const businessName = user?.org_code || '김쌤';

    // 계약 타입 판단
    const policySnapshot = attendanceLog.contract.policy_snapshot as any;
    const totalSessions = typeof policySnapshot?.total_sessions === 'number' ? policySnapshot.total_sessions : 0;
    const isSessionBased = totalSessions > 0 && !attendanceLog.contract.ended_at; // 횟수권
    const isAmountBased = attendanceLog.contract.ended_at && attendanceLog.contract.billing_type === 'prepaid'; // 선불권

    // 처리일 포맷팅 (날짜 + 시간)
    const occurredAt = new Date(attendanceLog.occurred_at);
    const year = occurredAt.getFullYear();
    const month = occurredAt.getMonth() + 1;
    const day = occurredAt.getDate();
    const hours = occurredAt.getHours();
    const minutes = occurredAt.getMinutes();
    const ampm = hours >= 12 ? '오후' : '오전';
    const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    const displayMinutes = String(minutes).padStart(2, '0');
    const processedDate = `${year}년 ${month}월 ${day}일 ${ampm} ${displayHours}:${displayMinutes}`;

    // 처리내용
    let processedContent = '';
    if (isSessionBased) {
      processedContent = '1회 사용됨';
    } else if (isAmountBased && attendanceLog.amount) {
      processedContent = `${attendanceLog.amount.toLocaleString()}원 사용됨`;
    }

    // 잔여 정보
    let remainingInfo = '';
    if (isSessionBased) {
      // 횟수권: 총 회차와 잔여 회차 계산
      const usedSessions = await this.prisma.attendanceLog.count({
        where: {
          contract_id: attendanceLog.contract_id,
          status: 'present',
          voided: false,
          occurred_at: { lte: attendanceLog.occurred_at },
        },
      });
      const remainingSessions = Math.max(totalSessions - usedSessions, 0);
      remainingInfo = `총 ${totalSessions}회 중 ${remainingSessions}회`;
    } else if (isAmountBased) {
      // 선불권: 총 금액과 잔여 금액 계산
      const totalAmount = attendanceLog.contract.monthly_amount || 0;
      const usedAmountResult = await this.prisma.attendanceLog.aggregate({
        where: {
          contract_id: attendanceLog.contract_id,
          status: 'present',
          voided: false,
          occurred_at: { lte: attendanceLog.occurred_at },
          amount: { not: null },
        },
        _sum: {
          amount: true,
        },
      });
      const usedAmount = usedAmountResult._sum.amount || 0;
      const remainingAmount = Math.max(totalAmount - usedAmount, 0);
      remainingInfo = `총 ${totalAmount.toLocaleString()}원 중 ${remainingAmount.toLocaleString()}원`;
    }

    // 유효기간 (선불권만)
    let validityPeriod = '';
    if (isAmountBased && attendanceLog.contract.started_at && attendanceLog.contract.ended_at) {
      const startDate = new Date(attendanceLog.contract.started_at);
      const endDate = new Date(attendanceLog.contract.ended_at);
      const startYear = String(startDate.getFullYear()).slice(-2);
      const endYear = String(endDate.getFullYear()).slice(-2);
      validityPeriod = `${startYear}.${String(startDate.getMonth() + 1).padStart(2, '0')}.${String(startDate.getDate()).padStart(2, '0')} ~ ${endYear}.${String(endDate.getMonth() + 1).padStart(2, '0')}.${String(endDate.getDate()).padStart(2, '0')}`;
    }

    // 이용권 타입
    const contractType = isAmountBased ? '선불권' : '횟수권';

    const html = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>사용 처리 완료</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background-color: #f2f2f7;
      padding: 16px;
      line-height: 1.6;
      -webkit-overflow-scrolling: touch;
      overflow-scrolling: touch;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 16px;
      padding: 0;
      box-shadow: 0 2px 10px rgba(0,0,0,0.05);
      overflow: hidden;
      -webkit-overflow-scrolling: touch;
      overflow-scrolling: touch;
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
    .content {
      padding: 32px 24px;
    }
    .title {
      font-size: 24px;
      font-weight: 700;
      color: #111111;
      margin-bottom: 8px;
    }
    .subtitle {
      font-size: 15px;
      color: #666666;
      margin-bottom: 24px;
    }
    .info-card {
      background-color: #f8f8f8;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 24px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid #e0e0e0;
    }
    .info-row:last-child {
      border-bottom: none;
    }
    .info-label {
      font-size: 14px;
      color: #666666;
      font-weight: 500;
    }
    .info-value {
      font-size: 14px;
      color: #111111;
      font-weight: 600;
      text-align: right;
    }
    .info-value.highlight {
      color: #1d42d8;
    }
    .note {
      font-size: 13px;
      color: #666666;
      margin-top: 16px;
      line-height: 1.6;
    }
    .footer-note {
      font-size: 12px;
      color: #ffffff;
      text-align: center;
      margin: 24px -24px -24px;
      padding: 16px 24px;
      background-color: #0f1b4d;
      line-height: 1.6;
      position: relative;
      z-index: 1;
    }
    .share-button {
      display: inline-block;
      background-color: #1d42d8;
      color: #ffffff;
      padding: 12px 24px;
      border-radius: 8px;
      text-decoration: none;
      font-size: 14px;
      font-weight: 600;
      margin-top: 16px;
      cursor: pointer;
      border: none;
      width: 100%;
      text-align: center;
    }
    .share-button:hover {
      background-color: #1535b8;
    }
    @media (max-width: 600px) {
      .content {
        padding: 24px 16px;
      }
      .title {
        font-size: 20px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-slogan">샵과 고객 모두 만족하는 투명한 이용권 관리</div>
      <div class="header-title">Pass Book</div>
      <div class="header-subtitle">이용 안내</div>
    </div>
    
    <div class="content">
      <div class="title">사용 처리 완료</div>
      <div class="subtitle">이용권 사용 내역이 아래와 같이 기록되었습니다.</div>
      
      <div class="info-card">
        <div class="info-row">
          <span class="info-label">상호</span>
          <span class="info-value">${businessName}</span>
        </div>
        <div class="info-row">
          <span class="info-label">이용권</span>
          <span class="info-value">${contractType}</span>
        </div>
        <div class="info-row">
          <span class="info-label">처리일</span>
          <span class="info-value">${processedDate}</span>
        </div>
        <div class="info-row">
          <span class="info-label">처리내용</span>
          <span class="info-value">${processedContent}</span>
        </div>
        ${attendanceLog.memo_public ? `
        <div class="info-row">
          <span class="info-label">서비스 내용</span>
          <span class="info-value">${attendanceLog.memo_public}</span>
        </div>
        ` : ''}
        <div class="info-row">
          <span class="info-label">잔여</span>
          <span class="info-value highlight">${remainingInfo}</span>
        </div>
        ${validityPeriod ? `
        <div class="info-row">
          <span class="info-label">유효기간</span>
          <span class="info-value">${validityPeriod}</span>
        </div>
        ` : ''}
      </div>
      
      <div class="note">
        * 본 안내는 이용권 사용 처리가 완료된 내역을 공유하기 위한 안내입니다.
      </div>
      
      <button class="share-button" onclick="shareLink()">링크 공유하기</button>
    </div>
    
    <div class="footer-note">
      본 안내는 패스 북 시스템에서 자동 발송 되었습니다.
    </div>
  </div>
  
  <script>
    function shareLink() {
      const url = window.location.href;
      
      // Web Share API 사용 (모바일 브라우저)
      if (navigator.share) {
        navigator.share({
          title: '이용권 사용 처리 완료',
          text: '이용권 사용 내역을 확인하세요.',
          url: url,
        }).catch((err) => {
          console.error('공유 실패:', err);
          copyToClipboard(url);
        });
      } else {
        // Web Share API를 지원하지 않는 경우 클립보드에 복사
        copyToClipboard(url);
      }
    }
    
    function copyToClipboard(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          alert('링크가 클립보드에 복사되었습니다.');
        }).catch((err) => {
          console.error('복사 실패:', err);
          fallbackCopy(text);
        });
      } else {
        fallbackCopy(text);
      }
    }
    
    function fallbackCopy(text) {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      try {
        document.execCommand('copy');
        alert('링크가 클립보드에 복사되었습니다.');
      } catch (err) {
        console.error('복사 실패:', err);
        alert('링크: ' + text);
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
