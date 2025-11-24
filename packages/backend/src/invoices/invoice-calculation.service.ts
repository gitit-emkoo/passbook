import { Injectable } from '@nestjs/common';

/**
 * 예정 수업 횟수 계산 및 정산 자동 계산 로직
 */
@Injectable()
export class InvoiceCalculationService {
  /**
   * 요일 문자열을 숫자로 변환 (0=일요일, 1=월요일, ..., 6=토요일)
   */
  private dayOfWeekToNumber(dayOfWeek: string): number {
    const mapping: Record<string, number> = {
      SUN: 0,
      MON: 1,
      TUE: 2,
      WED: 3,
      THU: 4,
      FRI: 5,
      SAT: 6,
    };
    return mapping[dayOfWeek.toUpperCase()] ?? -1;
  }

  /**
   * 특정 연도/월의 예정 수업 횟수 계산
   * @param dayOfWeekArray 예: ["TUE", "THU"]
   * @param year 연도
   * @param month 월 (1-12)
   * @returns 예정 수업 횟수
   */
  calculatePlannedCount(
    dayOfWeekArray: string[],
    year: number,
    month: number,
  ): number {
    if (!dayOfWeekArray || dayOfWeekArray.length === 0) {
      return 0;
    }

    // 해당 월의 첫날과 마지막날 구하기
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);

    let count = 0;

    // 요일 배열을 숫자로 변환
    const targetDays = dayOfWeekArray
      .map((day) => this.dayOfWeekToNumber(day))
      .filter((day) => day !== -1);

    // 해당 월의 모든 날짜를 순회하면서 목표 요일 개수 세기
    for (let date = new Date(firstDay); date <= lastDay; date.setDate(date.getDate() + 1)) {
      if (targetDays.includes(date.getDay())) {
        count++;
      }
    }

    return count;
  }

  /**
   * 정산 자동 계산 (auto_adjustment)
   * @param contract 계약서 정보 (policy_snapshot 포함)
   * @param attendanceLogs 해당 월의 출결 기록 배열
   * @param year 연도
   * @param month 월 (1-12)
   * @returns auto_adjustment 값
   */
  calculateAutoAdjustment(
    contract: {
      policy_snapshot: any;
      planned_count_override?: number | null;
      day_of_week: string[];
    },
    attendanceLogs: Array<{
      status: string;
      occurred_at: Date;
      substitute_at?: Date | null;
      voided: boolean;
    }>,
    year: number,
    month: number,
  ): number {
    // policy_snapshot에서 정책 정보 가져오기
    const policy = contract.policy_snapshot;
    const absencePolicy = policy.absence_policy; // 'carry_over' | 'deduct_next' | 'vanish'
    const monthlyAmount = policy.monthly_amount;

    // 예정 수업 횟수 (필요 시 단가 계산에 사용)
    const plannedCount =
      contract.planned_count_override ??
      this.calculatePlannedCount(contract.day_of_week, year, month);

    // 1회당 금액 계산 우선순위:
    // 1) policy.per_session_amount (가장 우선)
    // 2) policy.total_sessions 기반(monthly_amount / total_sessions) - 횟수제
    // 3) 예정회차 기반(monthly_amount / plannedCount) - 월단위
    let perSession = 0;
    const policyPer = (policy as any).per_session_amount;
    const policyTotal = (policy as any).total_sessions;
    if (typeof policyPer === 'number' && policyPer > 0) {
      // 명시적으로 단가가 있으면 사용
      perSession = policyPer;
    } else if (typeof policyTotal === 'number' && policyTotal > 0) {
      // 횟수제: 총 금액 / 총 회차 = 단가
      perSession = monthlyAmount / policyTotal;
    } else {
      // 월단위: 월 금액 / 예정 회차 = 단가
      perSession = plannedCount > 0 ? monthlyAmount / plannedCount : 0;
    }

    if (!perSession || perSession <= 0) {
      return 0;
    }

    // 해당 월의 출결 기록 필터링 (취소된 기록 제외)
    const validLogs = attendanceLogs.filter((log) => !log.voided);

    // 출석/대체/결석/소멸 개수 계산
    let presentCount = 0; // 출석
    let absentCount = 0; // 결석
    let substituteCount = 0; // 대체 (같은 달 내)
    let vanishCount = 0; // 소멸

    validLogs.forEach((log) => {
      const logDate = new Date(log.occurred_at);
      const logYear = logDate.getFullYear();
      const logMonth = logDate.getMonth() + 1;

      // 해당 월의 기록만 처리
      if (logYear !== year || logMonth !== month) {
        return;
      }

      switch (log.status) {
        case 'present':
          presentCount++;
          break;
        case 'absent':
          absentCount++;
          break;
        case 'substitute':
          // 대체 수업: substitute_at이 같은 달이면 출석으로 처리
          if (log.substitute_at) {
            const substituteDate = new Date(log.substitute_at);
            const subYear = substituteDate.getFullYear();
            const subMonth = substituteDate.getMonth() + 1;

            if (subYear === year && subMonth === month) {
              // 같은 달 내 대체 → 출석으로 처리
              presentCount++;
            } else {
              // 다른 달로 대체 → 결석으로 처리 (원래 달)
              absentCount++;
            }
          } else {
            // substitute_at이 없으면 결석으로 처리
            absentCount++;
          }
          break;
        case 'vanish':
          vanishCount++;
          break;
      }
    });

    if (absencePolicy === 'deduct_next') {
      return -(absentCount * perSession);
    }

    if (absencePolicy === 'carry_over') {
      return 0;
    }

    if (absencePolicy === 'vanish') {
      return -(vanishCount * perSession);
    }

    return 0;
  }

  /**
   * 이전 달의 결석을 다음 달에 반영하는 auto_adjustment 계산
   * (absence_policy가 'carry_over'일 때만 적용)
   */
  calculatePreviousMonthAdjustment(
    contract: {
      policy_snapshot: any;
      planned_count_override?: number | null;
      day_of_week: string[];
    },
    previousMonthLogs: Array<{
      status: string;
      occurred_at: Date;
      substitute_at?: Date | null;
      voided: boolean;
    }>,
    year: number,
    month: number,
  ): number {
    const policy = contract.policy_snapshot;
    const absencePolicy = policy.absence_policy;
    const monthlyAmount = policy.monthly_amount;

    // 이전 달의 예정 수업 횟수 계산
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const plannedCount =
      contract.planned_count_override ??
      this.calculatePlannedCount(contract.day_of_week, prevYear, prevMonth);

    let perSession = 0;
    const policyPer = (policy as any).per_session_amount;
    const policyTotal = (policy as any).total_sessions;
    if (typeof policyPer === 'number' && policyPer > 0) {
      perSession = policyPer;
    } else if (typeof policyTotal === 'number' && policyTotal > 0) {
      perSession = monthlyAmount / policyTotal;
    } else if (plannedCount > 0) {
      perSession = monthlyAmount / plannedCount;
    }

    if (!perSession || perSession <= 0) {
      return 0;
    }

    // 이전 달의 결석 개수 계산
    let absentCount = 0;
    const validLogs = previousMonthLogs.filter((log) => !log.voided);

    validLogs.forEach((log) => {
      const logDate = new Date(log.occurred_at);
      const logYear = logDate.getFullYear();
      const logMonth = logDate.getMonth() + 1;

      if (logYear !== prevYear || logMonth !== prevMonth) {
        return;
      }

      if (log.status === 'absent') {
        absentCount++;
      } else if (log.status === 'substitute') {
        // 대체 수업이 다른 달로 이월되었는지 확인
        if (log.substitute_at) {
          const substituteDate = new Date(log.substitute_at);
          const subYear = substituteDate.getFullYear();
          const subMonth = substituteDate.getMonth() + 1;

          // 대체가 이번 달에 이루어지면 이전 달은 결석으로 처리
          if (subYear === year && subMonth === month) {
            absentCount++;
          }
        }
      }
    });

    // carry_over 정책에만 반영
    if (absencePolicy === 'carry_over') {
      return -(absentCount * perSession);
    }

    return 0;
  }
}







