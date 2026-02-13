import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';

@Injectable()
export class StudentsService {
	constructor(
		private prisma: PrismaService,
		private notificationsService: NotificationsService,
	) {}

    async create(userId: number, dto: CreateStudentDto) {
    	return this.prisma.student.create({
    		data: {
    			user_id: userId,
    			name: dto.name,
    			phone: dto.phone,
    			guardian_name: dto.guardian_name,
    			guardian_phone: dto.guardian_phone,
    		},
    	});
    }

    async list(params: { search?: string; filter?: string; userId: number }) {
		const { search, filter, userId } = params;
		
		// 이번 달 계산 (KST 기준)
		const now = new Date();
		const kstOffset = 9 * 60; // UTC+9
		const kstNow = new Date(now.getTime() + kstOffset * 60 * 1000);
		const currentYear = kstNow.getFullYear();
		const currentMonth = kstNow.getMonth() + 1;

		// 검색 조건: 이름 / 보호자 / 과목(Contract.subject)
		const searchCondition = search
			? {
				OR: [
					{ name: { contains: search } },
					{ guardian_name: { contains: search } },
					{ contracts: { some: { subject: { contains: search } } } },
				],
			}
			: undefined;

		// 필터 조건
		let filterCondition: any = undefined;
		if (filter === 'billing_this_month') {
			// 이번 달 청구 대상: 이번 달 Invoice가 있고 final_amount > 0
			filterCondition = {
				invoices: {
					some: {
						year: currentYear,
						month: currentMonth,
						final_amount: { gt: 0 },
					},
				},
			};
		} else if (filter === 'needs_attention') {
			// 추가 안내 필요: 계약 만료 7일 이내 OR 선불권 2회 이하 + 만료 7일 이내 OR 3주 이상 미출석 OR 이번 달 0원인데 원래 유료
			// TODO: 이 필터는 복잡하므로 일단 기본 조건만 적용
			filterCondition = {
				OR: [
					{
						invoices: {
							some: {
								year: currentYear,
								month: currentMonth,
								final_amount: 0,
								base_amount: { gt: 0 },
							},
						},
					},
				],
			};
		}

		const whereCondition: any = {
			user_id: userId,
		};

		// confirmed나 sent 상태 계약서가 있는 학생만 반환 (draft만 있는 학생 제외)
		const contractFilter = {
			contracts: {
				some: {
					status: { in: ['confirmed', 'sent'] },
				},
			},
		};

		if (searchCondition || filterCondition) {
			whereCondition.AND = [contractFilter];
			if (searchCondition) {
				whereCondition.AND.push(searchCondition);
			}
			if (filterCondition) {
				whereCondition.AND.push(filterCondition);
			}
		} else {
			whereCondition.AND = [contractFilter];
		}

		const students = await this.prisma.student.findMany({
			where: whereCondition,
			include: {
				contracts: {
					where: {
						status: { in: ['confirmed', 'sent'] }, // 활성 계약만
					},
					orderBy: { created_at: 'desc' },
					take: 1, // 최근 계약 1개만
					select: {
						id: true,
						subject: true,
						billing_type: true,
						absence_policy: true,
						monthly_amount: true,
						day_of_week: true,
						time: true,
						status: true,
						started_at: true,
						ended_at: true,
						policy_snapshot: true,
					},
				},
				invoices: {
					where: {
						send_status: 'not_sent', // 미전송 정산서만 (정산중 섹션에 있는 정산서)
					},
					orderBy: {
						created_at: 'desc', // 가장 최근 정산서
					},
					take: 1,
				},
				attendance_logs: {
					where: {
						voided: false,
						occurred_at: {
							gte: new Date(currentYear, currentMonth - 1, 1),
							lt: new Date(currentYear, currentMonth, 1),
						},
					},
					orderBy: { occurred_at: 'desc' },
				},
			},
			orderBy: { id: 'desc' },
		});

		// 배치 쿼리 최적화: 모든 계약의 출결 기록을 한 번에 조회 (N+1 쿼리 해결)
		const contractIds = students
			.map((s) => s.contracts[0]?.id)
			.filter((id): id is number => id !== undefined);

		let allAttendanceLogs: Array<{ contract_id: number; amount: number | null }> = [];
		if (contractIds.length > 0) {
			allAttendanceLogs = await this.prisma.attendanceLog.findMany({
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
		}

		// 계약별로 출결 기록 그룹화
		const logsByContract = new Map<number, Array<{ amount: number | null }>>();
		allAttendanceLogs.forEach((log) => {
			if (!logsByContract.has(log.contract_id)) {
				logsByContract.set(log.contract_id, []);
			}
			logsByContract.get(log.contract_id)!.push({ amount: log.amount });
		});

		// 응답 데이터 변환
		return students.map((student) => {
			const latestContract = student.contracts[0] || null;
			const thisMonthInvoice = student.invoices[0] || null;
			const thisMonthAttendance = student.attendance_logs || [];

			let sessionsUsed = 0;
			let amountUsed = 0;
			if (latestContract) {
				const snapshot = (latestContract.policy_snapshot ?? {}) as Record<string, any>;
				const totalSessions = typeof snapshot.total_sessions === 'number' ? snapshot.total_sessions : 0;
				const isSessionBased = totalSessions > 0; // 횟수권 (ended_at은 표시용일 뿐, 판별에 사용하지 않음)
				const isAmountBased = totalSessions === 0; // 금액권 (ended_at은 표시용일 뿐, 판별에 사용하지 않음)
				
				const logs = logsByContract.get(latestContract.id) || [];
				
				if (isSessionBased) {
					// 횟수권: 사용된 횟수 계산
					sessionsUsed = logs.length;
				} else if (isAmountBased) {
					// 금액권: 사용된 금액 합계 계산
					amountUsed = logs.reduce((sum, log) => sum + (log.amount || 0), 0);
				}
			}

			// 이번 달 상태 요약 계산
			const absentCount = thisMonthAttendance.filter((log) => log.status === 'absent').length;
			const substituteCount = thisMonthAttendance.filter((log) => log.status === 'substitute').length;
			let statusSummary = '';
			if (absentCount > 0) {
				statusSummary = `${absentCount}회 결석`;
			} else if (substituteCount > 0) {
				statusSummary = `${substituteCount}회 대체수업`;
			} else if (thisMonthAttendance.length > 0) {
				statusSummary = `${thisMonthAttendance.length}회 관리`;
			}

			// 수업 정보 문자열 생성
			let classInfo = '';
			if (latestContract) {
				const dayOfWeekArray = (latestContract.day_of_week as string[]) || [];
				const dayNames: { [key: string]: string } = {
					MON: '월',
					TUE: '화',
					WED: '수',
					THU: '목',
					FRI: '금',
					SAT: '토',
					SUN: '일',
				};
				const dayStr = dayOfWeekArray.map((d) => dayNames[d] || d).join('/');
				classInfo = `${latestContract.subject} • ${dayStr} ${latestContract.time}`;
				if (student.guardian_name) {
					classInfo += ` • 보호자 ${student.guardian_name}`;
				}
			}

			return {
				id: student.id,
				name: student.name,
				phone: student.phone,
				guardian_name: student.guardian_name,
				guardian_phone: student.guardian_phone,
				is_active: student.is_active,
				created_at: student.created_at,
				updated_at: student.updated_at,
				// 최근 계약 정보
				latest_contract: latestContract
					? {
							id: latestContract.id,
							subject: latestContract.subject,
							billing_type: latestContract.billing_type,
							absence_policy: latestContract.absence_policy,
							monthly_amount: latestContract.monthly_amount,
							day_of_week: latestContract.day_of_week,
							time: latestContract.time,
							status: latestContract.status,
							started_at: latestContract.started_at,
							ended_at: latestContract.ended_at,
							policy_snapshot: latestContract.policy_snapshot,
							sessions_used: sessionsUsed,
							amount_used: amountUsed,
						}
					: null,
				// 이번 달 청구 정보
				this_month_invoice: thisMonthInvoice
					? {
							id: thisMonthInvoice.id,
							final_amount: thisMonthInvoice.final_amount,
							base_amount: thisMonthInvoice.base_amount,
							send_status: thisMonthInvoice.send_status,
						}
					: null,
				// 이번 달 상태 요약
				this_month_status_summary: statusSummary,
				// 수업 정보 문자열
				class_info: classInfo,
			};
		});
	}

	async detail(id: number, userId: number) {
		const student = await this.prisma.student.findFirst({
			where: { id, user_id: userId },
			include: {
				contracts: {
					orderBy: {
						created_at: 'desc',
					},
				},
				attendance_logs: {
					orderBy: { occurred_at: 'desc' },
					where: { voided: false },
					include: {
						user: {
							select: {
								id: true,
								name: true,
							},
						},
					},
				},
				invoices: {
					orderBy: [{ year: 'desc' }, { month: 'desc' }],
					include: {
						contract: {
							select: {
								id: true,
								billing_type: true,
							},
						},
					},
				},
			},
		});
		if (!student) {
			return null;
		}

		// 배치 쿼리 최적화: 모든 contract의 attendanceLog와 scheduleException을 한 번에 조회
		const contractIds = student.contracts.map((c) => c.id);
		
		// 모든 contract의 attendanceLog를 한 번에 조회
		const allAttendanceLogs = await this.prisma.attendanceLog.findMany({
			where: {
				user_id: userId,
				contract_id: { in: contractIds },
				voided: false,
				status: {
					in: ['present', 'absent', 'substitute', 'vanish'],
				},
			},
			select: {
				contract_id: true,
			},
		});

		// contract별로 출결 기록 카운트
		const sessionsUsedByContract = new Map<number, number>();
		allAttendanceLogs.forEach((log) => {
			const current = sessionsUsedByContract.get(log.contract_id) || 0;
			sessionsUsedByContract.set(log.contract_id, current + 1);
		});

		// 모든 contract의 scheduleException을 한 번에 조회
		const allScheduleExceptions = await this.prisma.scheduleException.findMany({
			where: {
				user_id: userId,
				contract_id: { in: contractIds },
			},
			select: {
				id: true,
				contract_id: true,
				original_date: true,
				new_date: true,
				reason: true,
				created_at: true,
			},
			orderBy: {
				original_date: 'asc',
			},
		});

		// contract별로 scheduleException 그룹화
		const scheduleExceptionsByContract = new Map<number, typeof allScheduleExceptions>();
		allScheduleExceptions.forEach((exception) => {
			if (!scheduleExceptionsByContract.has(exception.contract_id)) {
				scheduleExceptionsByContract.set(exception.contract_id, []);
			}
			scheduleExceptionsByContract.get(exception.contract_id)!.push(exception);
		});

		// contract에 sessions_used와 schedule_exceptions 추가
		const contractsWithSessions = student.contracts.map((contract) => {
			return {
				...contract,
				sessions_used: sessionsUsedByContract.get(contract.id) || 0,
				schedule_exceptions: scheduleExceptionsByContract.get(contract.id) || [],
			};
		});

		// 전송된 정산서의 display_period_start/display_period_end 추출
		const invoicesWithDisplayPeriod = student.invoices.map((invoice) => {
			if (invoice.send_status === 'sent' && invoice.send_history) {
				const sendHistory = invoice.send_history as any[];
				if (Array.isArray(sendHistory) && sendHistory.length > 0) {
					const lastSend = sendHistory[sendHistory.length - 1];
					return {
						...invoice,
						display_period_start: lastSend?.display_period_start || null,
						display_period_end: lastSend?.display_period_end || null,
					};
				}
			}
			return invoice;
		});

		return {
			...student,
			contracts: contractsWithSessions,
			invoices: invoicesWithDisplayPeriod,
		};
	}

	async update(userId: number, id: number, dto: UpdateStudentDto) {
		return this.prisma.student.update({
			where: { id },
			data: {
				user_id: userId,
				...dto,
			},
		});
	}

	async toggleActive(userId: number, id: number, isActive: boolean) {
		// 기존 상태 확인
		const student = await this.prisma.student.findFirst({
			where: { id, user_id: userId },
			select: { is_active: true, name: true },
		});

		if (!student) {
			throw new Error('수강생을 찾을 수 없습니다.');
		}

		const updated = await this.prisma.student.update({
			where: { id },
			data: { user_id: userId, is_active: isActive },
		});


		return updated;
	}

	async delete(userId: number, id: number) {
		// 수강생이 해당 사용자의 것인지 확인
		const student = await this.prisma.student.findFirst({
			where: { id, user_id: userId },
			select: { id: true, name: true },
		});

		if (!student) {
			throw new NotFoundException('수강생을 찾을 수 없습니다.');
		}

		// Cascade 설정으로 인해 관련된 모든 데이터(계약, 출결, 정산 등)가 자동으로 삭제됨
		await this.prisma.student.delete({
			where: { id },
		});

		return { message: '수강생이 삭제되었습니다.' };
	}
}
