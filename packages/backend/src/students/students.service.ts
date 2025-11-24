import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';

@Injectable()
export class StudentsService {
	constructor(private prisma: PrismaService) {}

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
						year: currentYear,
						month: currentMonth,
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

		// 응답 데이터 변환
		return Promise.all(
			students.map(async (student) => {
			const latestContract = student.contracts[0] || null;
			const thisMonthInvoice = student.invoices[0] || null;
			const thisMonthAttendance = student.attendance_logs || [];

			let sessionsUsed = 0;
			if (latestContract) {
				sessionsUsed = await this.prisma.attendanceLog.count({
					where: {
						user_id: userId,
						contract_id: latestContract.id,
						voided: false,
						status: {
							in: ['present', 'absent', 'substitute', 'vanish'],
						},
					},
				});
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
				statusSummary = `${thisMonthAttendance.length}회 출석`;
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
		}),
		);
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

		const contractsWithSessions = await Promise.all(
			student.contracts.map(async (contract) => {
				const sessionsUsed = await this.prisma.attendanceLog.count({
					where: {
						user_id: userId,
						contract_id: contract.id,
						voided: false,
						status: {
							in: ['present', 'absent', 'substitute', 'vanish'],
						},
					},
				});
				return {
					...contract,
					sessions_used: sessionsUsed,
				};
			}),
		);

		return {
			...student,
			contracts: contractsWithSessions,
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
		return this.prisma.student.update({
			where: { id },
			data: { user_id: userId, is_active: isActive },
		});
	}
}
