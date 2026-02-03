import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert } from 'react-native';
import styled from 'styled-components/native';
import Modal from 'react-native-modal';
import { useFocusEffect, useNavigation, useRoute, CommonActions } from '@react-navigation/native';
import RemixIcon from 'react-native-remix-icon';
import { useStudentsStore } from '../store/useStudentsStore';
import { useContractsStore } from '../store/useContractsStore';
import { contractsApi } from '../api/contracts';
import { studentsApi } from '../api/students';
import { attendanceApi } from '../api/attendance';
import { invoicesApi } from '../api/invoices';
import ExtendContractModal from '../components/modals/ExtendContractModal';
import { StudentsStackNavigationProp, StudentsStackParamList } from '../navigation/AppNavigator';
import type { RouteProp } from '@react-navigation/native';
import { StudentAttendanceLog, StudentContractDetail, ScheduleException } from '../types/students';

const changeIcon = require('../../assets/Change.png');
const z11Icon = require('../../assets/z11.png');

function StudentDetailContent() {
  const navigation = useNavigation<StudentsStackNavigationProp>();
  const route = useRoute<RouteProp<StudentsStackParamList, 'StudentDetail'>>();
  const { studentId } = route.params;

  const detailState = useStudentsStore((state) => state.details[studentId]);
  const fetchStudentDetail = useStudentsStore((state) => state.fetchStudentDetail);
  const sendContract = useContractsStore((state) => state.sendContract);

  const status = detailState?.status ?? 'idle';
  const detail = detailState?.data;
  const errorMessage = detailState?.errorMessage;
  const [isAttendanceExpanded, setIsAttendanceExpanded] = useState(false);
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [selectedAttendanceMonth, setSelectedAttendanceMonth] = useState<{ year: number; month: number } | null>(null);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<'modeSelection' | 'add' | 'change' | null>(null);
  const [scheduleStep, setScheduleStep] = useState<'selectDate' | 'selectTime' | 'selectOriginal' | 'selectNew'>('selectDate');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedOriginalDate, setSelectedOriginalDate] = useState<Date | null>(null);
  const [selectedNewDate, setSelectedNewDate] = useState<Date | null>(null);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [selectedMinute, setSelectedMinute] = useState<number | null>(null);
  const [selectedReservationId, setSelectedReservationId] = useState<number | null>(null);
  const [reservations, setReservations] = useState<any[]>([]);
  const [reservationDates, setReservationDates] = useState<Map<string, { id: number; time?: string | null; hasAttendanceLog?: boolean }>>(new Map());
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false);
  const [scheduleCurrentMonth, setScheduleCurrentMonth] = useState<Date>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });
  const [isMemoEditing, setIsMemoEditing] = useState(false);
  const [memoText, setMemoText] = useState('');
  const [isMemoSaving, setIsMemoSaving] = useState(false);
  const [todayReservations, setTodayReservations] = useState<Array<{ time: string; student_name: string }>>([]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: '고객 상세',
      headerShown: true,
      headerBackTitle: '뒤로',
    });
  }, [navigation]);

  const loadDetail = useCallback(async () => {
    try {
      await fetchStudentDetail(studentId, { force: true });
    } catch (error: any) {
      Alert.alert('수강생', error?.message ?? '상세 정보를 불러오지 못했습니다.');
    }
  }, [fetchStudentDetail, studentId]);

  useFocusEffect(
    useCallback(() => {
      // 화면 포커스 시마다 강제로 새로고침 (최신 출결 기록 반영)
      fetchStudentDetail(studentId, { force: true }).catch((error: any) => {
        console.error('[Students] error detail initial', { studentId, message: error?.message });
      });
    }, [fetchStudentDetail, studentId]),
  );

  const primaryContract: StudentContractDetail | undefined = useMemo(() => {
    if (!Array.isArray(detail?.contracts) || detail.contracts.length === 0) return undefined;
    const active = detail.contracts.find(
      (c) => c.status === 'confirmed' || c.status === 'sent',
    );
    return active ?? detail.contracts[0];
  }, [detail?.contracts]);

  const viewableContractId = primaryContract?.id ?? detail?.contracts?.[0]?.id;

  const handleViewContract = useCallback(async () => {
    if (viewableContractId) {
      navigation.navigate('ContractView', { contractId: viewableContractId });
      return;
    }

    try {
      await loadDetail();
      const refreshedContracts = useStudentsStore.getState().details[studentId]?.data?.contracts;
      const refreshedContract = refreshedContracts?.find(
        (c) => c.status === 'confirmed' || c.status === 'sent',
      ) ?? refreshedContracts?.[0];

      if (refreshedContract?.id) {
        navigation.navigate('ContractView', { contractId: refreshedContract.id });
        return;
      }
    } catch (error) {
      console.error('[StudentDetail] view contract refresh error', (error as Error).message);
    }

    Alert.alert('알림', '계약 정보를 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
  }, [loadDetail, navigation, studentId, viewableContractId]);

  const handleSendContractClick = useCallback(
    (contractId: number) => {
      // 미리보기 화면으로 이동 (다른 경로와 동일한 로직)
      // ContractPreview는 HomeStack에 있으므로 CommonActions 사용
      navigation.dispatch(
        CommonActions.navigate({
          name: 'MainTabs',
          params: {
            screen: 'Home',
            params: {
              screen: 'ContractPreview',
              params: { contractId },
            },
          },
        }),
      );
    },
    [navigation],
  );


  const contractsList: StudentContractDetail[] = useMemo(() => {
    if (!Array.isArray(detail?.contracts)) return [];
    return detail.contracts;
  }, [detail?.contracts]);

  const getStatusLabel = useCallback((status: string | null | undefined) => {
    if (!status) return '알 수 없음';
    const map: Record<string, string> = {
      draft: '초안',
      confirmed: '확정',
      sent: '전송 완료',
    };
    return map[status] || status;
  }, []);

  const getStatusColor = useCallback((status: string | null | undefined) => {
    if (!status) return '#8e8e93';
    const map: Record<string, string> = {
      draft: '#8e8e93',
      confirmed: '#ff9500',
      sent: '#34c759',
    };
    return map[status] || '#8e8e93';
  }, []);

  const formatContractSchedule = useCallback((contract: StudentContractDetail) => {
    if (!contract.day_of_week || contract.day_of_week.length === 0) {
      return contract.time || '';
    }
    const days = formatDayOfWeek(contract.day_of_week);
    return contract.time ? `${days} ${contract.time}` : days;
  }, []);

  const formatContractType = useCallback((contract: StudentContractDetail) => {
    const snapshot = (contract.policy_snapshot ?? {}) as Record<string, any>;
    const totalSessions = typeof snapshot.total_sessions === 'number' ? snapshot.total_sessions : 0;
    // 횟수권: totalSessions > 0 (ended_at은 표시용일 뿐, 판별에 사용하지 않음)
    // 금액권: totalSessions === 0 (ended_at은 표시용일 뿐, 판별에 사용하지 않음)
    if (totalSessions > 0) {
      return `횟수권 (${totalSessions}회)`;
    }
    return '금액권';
  }, []);

  const formatBillingType = useCallback((billingType: string | null | undefined) => {
    if (!billingType) return '-';
    if (billingType === 'prepaid') return '선불';
    if (billingType === 'postpaid') return '후불';
    return billingType;
  }, []);

  const formatAbsencePolicy = useCallback((policy: string | null | undefined) => {
    if (!policy) return '-';
    const map: Record<string, string> = {
      carry_over: '대체', // 뷰티 앱: 회차이월 → 대체
      deduct_next: '차감',
      vanish: '소멸',
    };
    return map[policy] ?? policy;
  }, []);

  // 사용처리 완료 알림 SMS 전송 핸들러
  const handleSendAttendanceSms = useCallback(
    async (attendanceLogId: number, studentPhone?: string | null) => {
      if (!studentPhone) {
        Alert.alert('오류', '수신자 번호가 없습니다.');
        return;
      }

      try {
        // 백엔드에서 솔라피를 통해 SMS 발송
        await attendanceApi.markSmsSent(attendanceLogId);
        
        Alert.alert('완료', '사용처리 완료 안내가 전송되었습니다.');

        // 전송 후 상세 정보 새로고침
        await fetchStudentDetail(studentId, { force: true });
      } catch (error: any) {
        console.error('[StudentDetail] send attendance SMS error', error);
        Alert.alert('오류', error?.message || '전송에 실패했습니다.');
      }
    },
    [fetchStudentDetail, studentId],
  );

  const formattedSchedule = useMemo(() => {
    if (primaryContract && primaryContract.day_of_week && primaryContract.day_of_week.length > 0) {
      const days = formatDayOfWeek(primaryContract.day_of_week);
      if (primaryContract.time) {
        return `${days} ${primaryContract.time}`;
      }
      return days;
    }
    return undefined;
  }, [primaryContract]);

const guardianLine = useMemo(() => {
  const guardianName = detail?.guardian_name?.trim();
  const guardianPhone = detail?.guardian_phone?.trim();
  if (!guardianName && !guardianPhone) return undefined;
  if (guardianName && guardianPhone) {
    return `${guardianName} (${guardianPhone})`;
  }
  return guardianName ?? guardianPhone ?? undefined;
}, [detail?.guardian_name, detail?.guardian_phone]);

  const contractBadgeLabel = useMemo(() => {
    if (!primaryContract?.billing_type) return null;
    if (primaryContract.billing_type === 'prepaid') return '선불';
    if (primaryContract.billing_type === 'postpaid') return '후불';
    return primaryContract.billing_type;
  }, [primaryContract?.billing_type]);

  const absencePolicyLabel = useMemo(() => {
    const policy = primaryContract?.absence_policy;
    if (!policy) return undefined;
    
    const map: Record<string, string> = {
      carry_over: '회차이월',
      deduct_next: '차감',
      vanish: '소멸',
    };
    return map[policy] ?? policy;
  }, [primaryContract?.absence_policy]);

  const contractBasisText = useMemo(() => {
    if (!primaryContract?.started_at) return undefined;
    return `${formatDate(primaryContract.started_at)}에 등록한 규정으로 정산됩니다.`;
  }, [primaryContract?.started_at]);

  // 실제 청구 대상 월 계산 (선불/후불 구분)
  const getActualBillingMonth = useCallback((invoice: { year: number; month: number; contract?: { billing_type?: 'prepaid' | 'postpaid' | null } }) => {
    const billingType = invoice.contract?.billing_type;
    if (billingType === 'prepaid') {
      // 선불: invoice의 month는 이전 달, 실제 청구 대상은 다음 달
      let actualYear = invoice.year;
      let actualMonth = invoice.month + 1;
      if (actualMonth > 12) {
        actualMonth = 1;
        actualYear += 1;
      }
      return { year: actualYear, month: actualMonth };
    } else {
      // 후불: invoice의 month가 실제 청구 대상 월
      return { year: invoice.year, month: invoice.month };
    }
  }, []);

  // 전송된 청구서 목록 (정산서 전송내역)
  const sentInvoices = useMemo(() => {
    if (!Array.isArray(detail?.invoices)) return [];
    return detail.invoices
      .filter((invoice) => invoice.send_status === 'sent')
      .sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.month - a.month;
      });
  }, [detail?.invoices]);

  // 출결 기록이 있는 월 목록 생성
  const availableMonths = useMemo(() => {
    if (!Array.isArray(detail?.attendance_logs)) return [];
    const monthSet = new Set<string>();
    detail.attendance_logs.forEach((log) => {
      let targetDate: Date | null = null;
      if (log.occurred_at) {
        targetDate = new Date(log.occurred_at);
      } else if (log.substitute_at) {
        targetDate = new Date(log.substitute_at);
      }
      if (targetDate) {
        const year = targetDate.getFullYear();
        const month = targetDate.getMonth();
        monthSet.add(`${year}-${month}`);
      }
    });
    return Array.from(monthSet)
      .map((key) => {
        const [year, month] = key.split('-').map(Number);
        return { year, month };
      })
      .sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.month - a.month;
      });
  }, [detail?.attendance_logs]);

  // 선택한 월 (기본값: 현재 월)
  const currentSelectedMonth = useMemo(() => {
    if (selectedAttendanceMonth) return selectedAttendanceMonth;
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  }, [selectedAttendanceMonth]);

  // 선택한 월의 출결 기록 필터링
  const filteredAttendanceLogs: StudentAttendanceLog[] = useMemo(() => {
    if (!Array.isArray(detail?.attendance_logs)) return [];
    const { year, month } = currentSelectedMonth;
    const filtered = detail.attendance_logs
      .filter((log) => {
        // occurred_at 또는 substitute_at 중 하나라도 선택한 달이면 포함
        let targetDate: Date | null = null;
        if (log.occurred_at) {
          targetDate = new Date(log.occurred_at);
        } else if (log.substitute_at) {
          targetDate = new Date(log.substitute_at);
        }
        if (!targetDate) return false;
        return targetDate.getFullYear() === year && targetDate.getMonth() === month;
      })
      .sort((a, b) => {
        // 최신순 정렬 (최신이 위로)
        // recorded_at(기록 시간)을 기준으로 정렬 - 실제로 출결을 처리한 시점
        const recordedA = a.recorded_at ? new Date(a.recorded_at).getTime() : 0;
        const recordedB = b.recorded_at ? new Date(b.recorded_at).getTime() : 0;
        // 내림차순 정렬 (최신 기록이 위로)
        return recordedB - recordedA;
      });
    return filtered;
  }, [detail?.attendance_logs, currentSelectedMonth]);

  // 접기/펼치기 상태에 따라 표시할 로그 결정
  const displayedAttendanceLogs = useMemo(() => {
    if (isAttendanceExpanded) {
      return filteredAttendanceLogs;
    }
    // 기본 접힘 상태: 최근 1개만 표시
    return filteredAttendanceLogs.slice(0, 1);
  }, [filteredAttendanceLogs, isAttendanceExpanded]);

  const attendanceEmptyDescription = useMemo(() => {
    return '이용권 사용 기록이 없습니다.';
  }, []);

  const attendanceSectionTitle = useMemo(() => {
    return '사용 기록';
  }, []);

  // 연장 가능 여부 계산 (뷰티앱: 오직 선불 횟수 계약 로직만 사용)
  const extendMeta = useMemo(() => {
    if (!primaryContract) {
      return { extendEligible: false, extendReason: null };
    }

    const snapshot = (primaryContract.policy_snapshot ?? {}) as Record<string, any>;
    const totalSessions = typeof snapshot.total_sessions === 'number' ? snapshot.total_sessions : 0;

    // 횟수권: totalSessions > 0 (ended_at은 표시용/예약 범위 체크용일 뿐, 판별에 사용하지 않음)
    if (totalSessions > 0) {
      const sessionsUsed =
        typeof primaryContract.sessions_used === 'number' ? primaryContract.sessions_used : 0;
      const remaining = Math.max(totalSessions - sessionsUsed, 0);
      const extendEligible = remaining < 3; // 3회 미만
      const extendReason = remaining > 0 ? `회차 ${remaining}회 남음` : '회차 모두 사용됨';
      return { extendEligible, extendReason };
    }

    // 금액권: totalSessions === 0 (ended_at은 표시용/예약 범위 체크용일 뿐, 판별에 사용하지 않음)
    const totalAmount = primaryContract.monthly_amount ?? 0;
    const amountUsed = (primaryContract as any).amount_used ?? 0;
    const remainingAmount = Math.max(totalAmount - amountUsed, 0);
    const extendEligible = remainingAmount <= 20000; // 20,000원 이하
    const extendReason = remainingAmount > 0 ? `잔여 ${remainingAmount.toLocaleString()}원` : '금액 모두 사용됨';
    return { extendEligible, extendReason };

    return { extendEligible: false, extendReason: null };
  }, [primaryContract]);

  // 일정 변경 달력에서 사용할 계약 기간 범위 계산
  const scheduleDateRange = useMemo(() => {
    if (!primaryContract) {
      return { minDate: null as Date | null, maxDate: null as Date | null };
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let minDate: Date | null = null;
    if (primaryContract.started_at) {
      const d = new Date(primaryContract.started_at);
      d.setHours(0, 0, 0, 0);
      minDate = d < today ? today : d;
    } else {
      minDate = today;
    }

    let maxDate: Date | null = null;
    if (primaryContract.ended_at) {
      const d = new Date(primaryContract.ended_at);
      d.setHours(0, 0, 0, 0);
      maxDate = d;
    } else {
      // 종료일이 없으면 일단 1년 이후까지 허용
      const d = new Date(today);
      d.setFullYear(d.getFullYear() + 1);
      maxDate = d;
    }

    return { minDate, maxDate };
  }, [primaryContract]);

  const handleChangeScheduleMonth = useCallback(
    (direction: 'prev' | 'next') => {
      setScheduleCurrentMonth((prev) => {
        const year = prev.getFullYear();
        const month = prev.getMonth();
        const next =
          direction === 'prev'
            ? new Date(year, month - 1, 1)
            : new Date(year, month + 1, 1);
        next.setHours(0, 0, 0, 0);

        const { minDate, maxDate } = scheduleDateRange;
        if (minDate && next < new Date(minDate.getFullYear(), minDate.getMonth(), 1)) {
          return prev;
        }
        if (maxDate && next > new Date(maxDate.getFullYear(), maxDate.getMonth(), 1)) {
          return prev;
        }
        return next;
      });
    },
    [scheduleDateRange],
  );

  const handleOpenScheduleModal = useCallback(async () => {
    if (!primaryContract) {
      Alert.alert('안내', '활성화된 계약이 있을 때만 예약/변경을 사용할 수 있습니다.');
      return;
    }
    
    // 모달 열 때 예약 목록 다시 불러오기 (최신 상태 반영)
    try {
      const reservationsData = await contractsApi.getReservations(primaryContract.id);
      setReservations(reservationsData || []);
      
      // 예약 날짜 맵 업데이트 (날짜 형식 정규화)
      const datesMap = new Map<string, { id: number; time?: string | null; hasAttendanceLog?: boolean }>();
      (reservationsData || []).forEach((reservation: any) => {
        let dateStr = reservation.reserved_date;
        if (dateStr) {
          // Date 객체이거나 ISO 문자열인 경우 처리
          if (dateStr instanceof Date) {
            const year = dateStr.getFullYear();
            const month = String(dateStr.getMonth() + 1).padStart(2, '0');
            const day = String(dateStr.getDate()).padStart(2, '0');
            dateStr = `${year}-${month}-${day}`;
          } else if (typeof dateStr === 'string') {
            // ISO 문자열인 경우: Date 객체로 변환 후 로컬 시간 기준으로 날짜 추출 (시간대 문제 해결)
            const dateObj = new Date(dateStr);
            const year = dateObj.getFullYear();
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const day = String(dateObj.getDate()).padStart(2, '0');
            dateStr = `${year}-${month}-${day}`;
          }
          datesMap.set(dateStr, {
            id: reservation.id,
            time: reservation.reserved_time,
            hasAttendanceLog: reservation.has_attendance_log || false,
          });
        }
      });
      setReservationDates(datesMap);
    } catch (error: any) {
      console.error('[StudentDetail] fetch reservations error on modal open', error);
    }
    
    // 모달 열 때 초기화
    setScheduleMode('modeSelection');
    setScheduleStep('selectDate');
    setSelectedDate(null);
    setSelectedOriginalDate(null);
    setSelectedNewDate(null);
    setSelectedHour(null);
    setSelectedMinute(null);
    setSelectedReservationId(null);

    // 모달을 열 때 항상 현재 달(오늘 날짜 기준)을 표시
    const today = new Date();
    today.setDate(1);
    today.setHours(0, 0, 0, 0);
    setScheduleCurrentMonth(today);

    setShowScheduleModal(true);
  }, [primaryContract]);

  const handleSelectAddMode = useCallback(() => {
    setScheduleMode('add');
    setScheduleStep('selectDate');
    setSelectedDate(null);
    setSelectedHour(null);
    setSelectedMinute(null);
    setTodayReservations([]);
  }, []);

  // 선택한 날짜의 예약 조회 (시간 선택 단계에서)
  useEffect(() => {
    const loadSelectedDateReservations = async () => {
      if (scheduleStep !== 'selectTime' || !selectedDate) {
        setTodayReservations([]);
        return;
      }

      try {
        const data = await contractsApi.getAllReservations();
        const reservations = Array.isArray(data) ? data : [];

        // 선택한 날짜 기준으로 날짜 정규화
        const selected = new Date(selectedDate);
        selected.setHours(0, 0, 0, 0);

        // 선택한 날짜의 예약만 필터링
        const selectedDateReservations = reservations
          .filter((reservation) => {
            const reservationDate = new Date(reservation.reserved_date);
            reservationDate.setHours(0, 0, 0, 0);
            return reservationDate.getTime() === selected.getTime() && reservation.reserved_time;
          })
          .map((reservation) => ({
            time: reservation.reserved_time || '',
            student_name: reservation.student_name || '',
          }))
          .sort((a, b) => a.time.localeCompare(b.time));

        setTodayReservations(selectedDateReservations);
      } catch (error) {
        console.error('[StudentDetail] Failed to load selected date reservations:', error);
        setTodayReservations([]);
      }
    };

    loadSelectedDateReservations();
  }, [scheduleStep, selectedDate]);

  const handleSelectChangeMode = useCallback(async () => {
    if (!primaryContract) return;
    
    try {
      // 예약 목록 가져오기
      const reservationsData = await contractsApi.getReservations(primaryContract.id);
      setReservations(reservationsData || []);
      
      // 예약 날짜 맵 생성 (날짜 형식 정규화: ISO 문자열에서 YYYY-MM-DD 추출)
      const datesMap = new Map<string, { id: number; time?: string | null; hasAttendanceLog?: boolean }>();
      (reservationsData || []).forEach((reservation: any) => {
        let dateStr = reservation.reserved_date;
        if (dateStr) {
          // Date 객체이거나 ISO 문자열인 경우 처리
          if (dateStr instanceof Date) {
            const year = dateStr.getFullYear();
            const month = String(dateStr.getMonth() + 1).padStart(2, '0');
            const day = String(dateStr.getDate()).padStart(2, '0');
            dateStr = `${year}-${month}-${day}`;
          } else if (typeof dateStr === 'string') {
            // ISO 문자열인 경우: Date 객체로 변환 후 로컬 시간 기준으로 날짜 추출 (시간대 문제 해결)
            const dateObj = new Date(dateStr);
            const year = dateObj.getFullYear();
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const day = String(dateObj.getDate()).padStart(2, '0');
            dateStr = `${year}-${month}-${day}`;
          }
          datesMap.set(dateStr, {
            id: reservation.id,
            time: reservation.reserved_time,
            hasAttendanceLog: reservation.has_attendance_log || false,
          });
        }
      });
      setReservationDates(datesMap);

      if (reservationsData && reservationsData.length === 0) {
        Alert.alert('안내', '변경할 예약이 없습니다.');
        setShowScheduleModal(false);
        return;
      }

      setScheduleMode('change');
      setScheduleStep('selectOriginal');
      setSelectedOriginalDate(null);
      setSelectedNewDate(null);
      setSelectedHour(null);
      setSelectedMinute(null);
      setSelectedReservationId(null);
    } catch (error: any) {
      console.error('[StudentDetail] fetch reservations error', error);
      Alert.alert('오류', '예약 목록을 불러오는데 실패했습니다.');
    }
  }, [primaryContract]);

  const handleConfirmAddReservation = useCallback(async () => {
    if (!primaryContract || !selectedDate) {
      return;
    }
    try {
      setScheduleSubmitting(true);
      const toIsoDate = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      const reservedTime = selectedHour !== null && selectedMinute !== null
        ? `${String(selectedHour).padStart(2, '0')}:${String(selectedMinute).padStart(2, '0')}`
        : null;

      await contractsApi.createReservation(primaryContract.id, {
        reserved_date: toIsoDate(selectedDate),
        reserved_time: reservedTime,
      });

      // 예약 목록 다시 불러오기
      const reservationsData = await contractsApi.getReservations(primaryContract.id);
      setReservations(reservationsData || []);
      
      // 예약 날짜 맵 업데이트 (날짜 형식 정규화)
      const datesMap = new Map<string, { id: number; time?: string | null; hasAttendanceLog?: boolean }>();
      (reservationsData || []).forEach((reservation: any) => {
        let dateStr = reservation.reserved_date;
        if (dateStr) {
          // Date 객체이거나 ISO 문자열인 경우 처리
          if (dateStr instanceof Date) {
            const year = dateStr.getFullYear();
            const month = String(dateStr.getMonth() + 1).padStart(2, '0');
            const day = String(dateStr.getDate()).padStart(2, '0');
            dateStr = `${year}-${month}-${day}`;
          } else if (typeof dateStr === 'string') {
            // ISO 문자열인 경우: Date 객체로 변환 후 로컬 시간 기준으로 날짜 추출 (시간대 문제 해결)
            const dateObj = new Date(dateStr);
            const year = dateObj.getFullYear();
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const day = String(dateObj.getDate()).padStart(2, '0');
            dateStr = `${year}-${month}-${day}`;
          }
          datesMap.set(dateStr, {
            id: reservation.id,
            time: reservation.reserved_time,
            hasAttendanceLog: reservation.has_attendance_log || false,
          });
        }
      });
      setReservationDates(datesMap);

      await fetchStudentDetail(studentId, { force: true });
      
      try {
        const parentNavigation = navigation.getParent();
        if (parentNavigation) {
          parentNavigation.navigate('Home' as never);
        }
      } catch (e) {
        console.warn('[StudentDetail] failed to refresh today classes', e);
      }

      Alert.alert('완료', '예약이 추가되었습니다.');
      setShowScheduleModal(false);
      setScheduleMode(null);
      setScheduleStep('selectDate');
      setSelectedDate(null);
      setSelectedHour(null);
      setSelectedMinute(null);
    } catch (error: any) {
      // 개발 모드에서만 콘솔 에러 출력 (에러 오버레이 방지)
      if (__DEV__) {
        console.error('[StudentDetail] add reservation error', error);
      }
      
      // 에러 메시지 추출 및 사용자 친화적 메시지로 변환
      let errorMessage = '예약 추가에 실패했습니다.';
      
      // 백엔드에서 직접 오는 메시지 우선 확인
      const backendMessage = error?.response?.data?.message;
      if (typeof backendMessage === 'string') {
        errorMessage = backendMessage;
      } else if (backendMessage?.message && typeof backendMessage.message === 'string') {
        // 중첩된 메시지 구조 처리 (예: { message: { message: "이미 예약된 날짜입니다." } })
        errorMessage = backendMessage.message;
      } else if (typeof error?.message === 'string') {
        errorMessage = error.message;
      }
      
      // "잘못된 요청입니다:" 접두사 제거 및 메시지 정리
      if (errorMessage.includes('잘못된 요청입니다:')) {
        errorMessage = errorMessage.replace('잘못된 요청입니다:', '').trim();
      }
      
      // 중복 예약 관련 메시지인 경우 더 명확하게 표시
      if (errorMessage.includes('이미 예약된 날짜') || errorMessage.includes('중복')) {
        errorMessage = '이미 예약이 등록된 날짜입니다. 다른 날짜를 선택해주세요.';
      }
      
      Alert.alert('알림', errorMessage);
    } finally {
      setScheduleSubmitting(false);
    }
  }, [primaryContract, selectedDate, selectedHour, selectedMinute, fetchStudentDetail, studentId, navigation]);

  const handleConfirmReschedule = useCallback(async () => {
    if (!primaryContract || !selectedOriginalDate || !selectedNewDate || !selectedReservationId) {
      return;
    }
    try {
      setScheduleSubmitting(true);
      const toIsoDate = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      const reservedTime = selectedHour !== null && selectedMinute !== null
        ? `${String(selectedHour).padStart(2, '0')}:${String(selectedMinute).padStart(2, '0')}`
        : null;

      await contractsApi.updateReservation(primaryContract.id, selectedReservationId, {
        reserved_date: toIsoDate(selectedNewDate),
        reserved_time: reservedTime,
      });

      // 예약 목록 다시 불러오기 (캘린더에 반영)
      const reservationsData = await contractsApi.getReservations(primaryContract.id);
      setReservations(reservationsData || []);
      
      // 예약 날짜 맵 업데이트 (날짜 형식 정규화)
      const datesMap = new Map<string, { id: number; time?: string | null; hasAttendanceLog?: boolean }>();
      (reservationsData || []).forEach((reservation: any) => {
        let dateStr = reservation.reserved_date;
        if (dateStr) {
          // Date 객체이거나 ISO 문자열인 경우 처리
          if (dateStr instanceof Date) {
            const year = dateStr.getFullYear();
            const month = String(dateStr.getMonth() + 1).padStart(2, '0');
            const day = String(dateStr.getDate()).padStart(2, '0');
            dateStr = `${year}-${month}-${day}`;
          } else if (typeof dateStr === 'string') {
            // ISO 문자열인 경우: Date 객체로 변환 후 로컬 시간 기준으로 날짜 추출 (시간대 문제 해결)
            const dateObj = new Date(dateStr);
            const year = dateObj.getFullYear();
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const day = String(dateObj.getDate()).padStart(2, '0');
            dateStr = `${year}-${month}-${day}`;
          }
          datesMap.set(dateStr, {
            id: reservation.id,
            time: reservation.reserved_time,
            hasAttendanceLog: reservation.has_attendance_log || false,
          });
        }
      });
      setReservationDates(datesMap);

      await fetchStudentDetail(studentId, { force: true });

      Alert.alert('완료', '예약이 변경되었습니다.');
      setShowScheduleModal(false);
      setScheduleMode(null);
      setScheduleStep('selectDate');
      setSelectedOriginalDate(null);
      setSelectedNewDate(null);
      setSelectedHour(null);
      setSelectedMinute(null);
      setSelectedReservationId(null);
    } catch (error: any) {
      console.error('[StudentDetail] update reservation error', error);
      const errorMessage = typeof error?.response?.data?.message === 'string' 
        ? error.response.data.message 
        : typeof error?.message === 'string'
        ? error.message
        : '예약 변경에 실패했습니다.';
      Alert.alert('오류', errorMessage);
    } finally {
      setScheduleSubmitting(false);
    }
  }, [primaryContract, selectedOriginalDate, selectedNewDate, selectedReservationId, selectedHour, selectedMinute, fetchStudentDetail, studentId, navigation]);

  const handleExtendPress = useCallback(() => {
    if (!primaryContract) return;
    setShowExtendModal(true);
  }, [primaryContract]);

  const handleExtendSuccess = useCallback(async () => {
    // 연장 성공 후 수강생 상세 정보 새로고침
    await fetchStudentDetail(studentId, { force: true });
    // 토스트 메시지 (간단한 Alert로 대체)
    Alert.alert('완료', '연장 처리되었습니다.');
  }, [fetchStudentDetail, studentId]);

  // 메모 편집 시작
  const handleMemoEditStart = useCallback(() => {
    setMemoText(detail?.memo || '');
    setIsMemoEditing(true);
  }, [detail?.memo]);

  // 메모 편집 취소
  const handleMemoEditCancel = useCallback(() => {
    setIsMemoEditing(false);
    setMemoText('');
  }, []);

  // 메모 저장
  const handleMemoSave = useCallback(async () => {
    if (!detail) return;
    
    setIsMemoSaving(true);
    try {
      await studentsApi.update(detail.id, { memo: memoText.trim() || undefined });
      await fetchStudentDetail(studentId, { force: true });
      setIsMemoEditing(false);
      Alert.alert('완료', '메모가 저장되었습니다.');
    } catch (error: any) {
      console.error('[StudentDetail] memo save error', error);
      Alert.alert('오류', error?.message || '메모 저장에 실패했습니다.');
    } finally {
      setIsMemoSaving(false);
    }
  }, [detail, memoText, fetchStudentDetail, studentId]);

  // 연장 모달에 필요한 정보 계산 (뷰티앱: 오직 선불 횟수 계약 로직만 사용)
  const extendModalProps = useMemo(() => {
    if (!primaryContract) return null;

    const snapshot = (primaryContract.policy_snapshot ?? {}) as Record<string, any>;
    const totalSessions = typeof snapshot.total_sessions === 'number' ? snapshot.total_sessions : 0;

    // 횟수권: totalSessions > 0 (ended_at은 표시용/예약 범위 체크용일 뿐, 판별에 사용하지 않음)
    if (totalSessions > 0) {
      const sessionsUsed =
        typeof primaryContract.sessions_used === 'number' ? primaryContract.sessions_used : 0;
      const remaining = Math.max(totalSessions - sessionsUsed, 0);
      return {
        contractType: 'sessions' as const,
        totalSessions,
        remainingSessions: remaining,
      };
    }

    // 금액권: totalSessions === 0 (ended_at은 표시용/예약 범위 체크용일 뿐, 판별에 사용하지 않음)
    const totalAmount = primaryContract.monthly_amount ?? 0;
    const amountUsed = (primaryContract as any).amount_used ?? 0;
    const remainingAmount = Math.max(totalAmount - amountUsed, 0);
    return {
      contractType: 'amount' as const,
      totalAmount,
      remainingAmount,
    };
  }, [primaryContract]);

  if (status === 'loading' && !detail) {
    return (
      <CenteredContainer>
        <ActivityIndicator color="#1d42d8" />
        <CenteredText>고객 정보를 불러오는 중이에요...</CenteredText>
      </CenteredContainer>
    );
  }

  if (status === 'error' && !detail) {
    return (
      <CenteredContainer>
        <ErrorTitle>상세 정보를 불러오지 못했습니다.</ErrorTitle>
        <ErrorDescription>{errorMessage ?? '네트워크 연결을 확인해주세요.'}</ErrorDescription>
        <RetryButton onPress={loadDetail}>
          <RetryButtonText>다시 시도</RetryButtonText>
        </RetryButton>
      </CenteredContainer>
    );
  }

  if (!detail) {
    return (
      <CenteredContainer>
        <CenteredText>표시할 정보가 없습니다.</CenteredText>
        <RetryButton onPress={loadDetail}>
          <RetryButtonText>새로고침</RetryButtonText>
        </RetryButton>
      </CenteredContainer>
    );
  }

  return (
    <Container>
      <Content>
        <HeaderCard>
          <HeaderTexts>
            <StudentNameContainer>
              <RemixIcon name="ticket-line" size={20} color="#111" />
              <StudentName>{detail.name}</StudentName>
            </StudentNameContainer>
            <HeaderMeta>
              {[primaryContract?.subject ?? undefined, formattedSchedule, guardianLine]
                .filter(Boolean)
                .join(' • ')}
            </HeaderMeta>
          </HeaderTexts>
          <ButtonGroup>
            <EditButton onPress={handleViewContract}>
              <EditButtonText>계약보기</EditButtonText>
            </EditButton>
            {extendMeta.extendEligible && (
              <ExtendButton onPress={handleExtendPress}>
                <ExtendButtonText>연장하기</ExtendButtonText>
              </ExtendButton>
            )}
          </ButtonGroup>
        </HeaderCard>

        {/* 수업 일정 전체 섹션 (기존 정보와 분리된 전용 섹션) */}
        <ScheduleSectionCard>
          <SectionHeader>
            <SectionTitle>관리일정 및 변경</SectionTitle>
          </SectionHeader>
          {primaryContract ? (
            <>
              <ScheduleSectionContent>
                <RemixIcon name="calendar-2-line" size={20} color="#111" />
                <ScheduleInfoText>
                  고객 관리 일정을 등록하고 변경할 수 있어요.
                </ScheduleInfoText>
              </ScheduleSectionContent>
              <ScheduleButtonContainer>
                <ScheduleButton onPress={handleOpenScheduleModal}>
                  <ScheduleButtonText>예약/변경</ScheduleButtonText>
                </ScheduleButton>
              </ScheduleButtonContainer>
            </>
          ) : (
            <EmptyDescription>활성화된 계약이 없어서 수업 일정을 표시할 수 없습니다.</EmptyDescription>
          )}
        </ScheduleSectionCard>

        {/* 기존 수업/기본 정보 섹션 (원래 구조 유지) */}
        <SectionCard>
          <SectionHeader>
            <SectionTitle>기본 정보</SectionTitle>
          </SectionHeader>
          <InfoRow label="이름" value={detail.name} />
          <InfoRow label="연락처" value={detail.phone ?? '-'} />
          <InfoRow label="이용권 명" value={primaryContract?.subject ?? '-'} />
        </SectionCard>

        <SectionCard>
          <SectionHeader>
            <SectionTitle>이용권 정보</SectionTitle>
          </SectionHeader>
          {contractsList.length === 0 ? (
            <EmptyDescription>등록된 계약이 없습니다.</EmptyDescription>
          ) : (
            <ContractsList>
              {contractsList.map((contract) => {
                const isConfirmed = contract.status === 'confirmed';
                const isSent = contract.status === 'sent';
                const showSendButton = isConfirmed && !isSent;

                return (
                  <ContractCard key={contract.id}>
                    <ContractCardHeader>
                      <ContractCardTitle>
                        {contract.subject || `계약 #${contract.id}`}
                      </ContractCardTitle>
                      <StatusBadge $color={getStatusColor(contract.status)}>
                        <StatusBadgeText $color={getStatusColor(contract.status)}>
                          {getStatusLabel(contract.status)}
                        </StatusBadgeText>
                      </StatusBadge>
                    </ContractCardHeader>
                    <ContractCardBody>
                      <ContractInfoRow>
                        <ContractInfoLabel>계약 타입:</ContractInfoLabel>
                        <ContractInfoValue>{formatContractType(contract)}</ContractInfoValue>
                      </ContractInfoRow>
                      <ContractInfoRow>
                        <ContractInfoLabel>결제 방식:</ContractInfoLabel>
                        <ContractInfoValue>{formatBillingType(contract.billing_type)}</ContractInfoValue>
                      </ContractInfoRow>
                      <ContractInfoRow>
                        <ContractInfoLabel>노쇼 처리:</ContractInfoLabel>
                        <ContractInfoValue>{formatAbsencePolicy(contract.absence_policy)}</ContractInfoValue>
                      </ContractInfoRow>
                      {(() => {
                        // 유효기간 표시 (금액권/횟수권 모두)
                        if (contract.started_at && contract.ended_at) {
                          const startDate = new Date(contract.started_at);
                          const endDate = new Date(contract.ended_at);
                          const formatDate = (date: Date) => {
                            return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
                          };
                          return (
                            <ContractInfoRow>
                              <ContractInfoLabel>유효기간:</ContractInfoLabel>
                              <ContractInfoValue>{`${formatDate(startDate)} ~ ${formatDate(endDate)}`}</ContractInfoValue>
                            </ContractInfoRow>
                          );
                        }
                        return null;
                      })()}
                    </ContractCardBody>
                    {showSendButton && (
                      <ContractCardFooter>
                        <SendButton
                          onPress={() => handleSendContractClick(contract.id)}
                          disabled={false}
                        >
                          <SendButtonText>전송</SendButtonText>
                        </SendButton>
                      </ContractCardFooter>
                    )}
                  </ContractCard>
                );
              })}
            </ContractsList>
          )}
        </SectionCard>

        {/* 고객 메모 섹션 */}
        <SectionCard>
          <SectionHeader>
            <SectionTitle>고객 메모</SectionTitle>
            {!isMemoEditing && (
              <MemoEditButton onPress={handleMemoEditStart}>
                <MemoEditButtonText>편집</MemoEditButtonText>
              </MemoEditButton>
            )}
          </SectionHeader>
          {isMemoEditing ? (
            <MemoEditContainer>
              <MemoTextInput
                value={memoText}
                onChangeText={setMemoText}
                placeholder="고객에 대한 메모를 입력하세요..."
                multiline
                numberOfLines={4}
                maxLength={500}
                textAlignVertical="top"
              />
              <MemoButtonRow>
                <MemoCancelButton onPress={handleMemoEditCancel} disabled={isMemoSaving}>
                  <MemoCancelButtonText>취소</MemoCancelButtonText>
                </MemoCancelButton>
                <MemoSaveButton onPress={handleMemoSave} disabled={isMemoSaving}>
                  {isMemoSaving ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <MemoSaveButtonText>저장</MemoSaveButtonText>
                  )}
                </MemoSaveButton>
              </MemoButtonRow>
            </MemoEditContainer>
          ) : (
            <MemoContent>
              {detail?.memo ? (
                <MemoText>{detail.memo}</MemoText>
              ) : (
                <MemoEmptyText>메모 없음</MemoEmptyText>
              )}
            </MemoContent>
          )}
        </SectionCard>

        <SectionCard>
          <SectionHeader>
            <SectionHeaderLeft>
              <SectionTitle>{attendanceSectionTitle}</SectionTitle>
              {availableMonths.length > 0 && (
                <MonthPickerButton onPress={() => setShowMonthPicker(true)}>
                  <RemixIcon name="calendar-check-line" size={18} color="#666" />
                </MonthPickerButton>
              )}
            </SectionHeaderLeft>
          </SectionHeader>
          {filteredAttendanceLogs.length === 0 ? (
            <EmptyDescription>{attendanceEmptyDescription}</EmptyDescription>
          ) : (
            <>
              <AttendanceList>
                {displayedAttendanceLogs.map((log) => {
                  const statusText = formatAttendanceStatus(log.status);
                  const memo = log.memo_public; // 사유만 표시
                  const statusColor = getAttendanceStatusColor(log.status);
                  
                  // 단가 계산 (결석인 경우 차감 금액 표시용)
                  const perSessionAmount = primaryContract?.policy_snapshot?.per_session_amount;
                  const billingType = primaryContract?.billing_type;
                  const absencePolicy = primaryContract?.absence_policy;
                  
                  // 차감 금액을 표시해야 하는 조건: 
                  // - 선불+차감: 다음 달에 차감되지만 이번 달에 표시
                  // - 후불+차감: 이번 달에 차감되므로 표시
                  // - 선불+소멸, 선불+회차이월: 차감 금액 표시 안 함
                  const shouldShowDeduction = log.status === 'absent' && perSessionAmount && (
                    (billingType === 'prepaid' && absencePolicy === 'deduct_next') || // 선불+차감
                    (billingType === 'postpaid' && absencePolicy === 'deduct_next') // 후불+차감
                  );
                  
                  // 조건 표시 (차감, 소멸, 회차이월)
                  const getConditionLabel = () => {
                    if (!absencePolicy) return '';
                    if (absencePolicy === 'deduct_next') {
                      return '차감';
                    } else if (absencePolicy === 'vanish') {
                      return '소멸';
                    } else if (absencePolicy === 'carry_over') {
                      return '회차이월';
                    }
                    return '';
                  };
                  
                  const conditionLabel = getConditionLabel();
                  
                  // 날짜 형식
                  const dateText = formatAttendanceDate(log.occurred_at);
                  let displayText: string;
                  
                  if (log.status === 'substitute' && log.substitute_at) {
                    // 대체수업인 경우: 날짜 + 대체(사유) + 변경 일 (대체수업 지정 날짜)
                    const memoPart = memo ? `(${memo})` : '';
                    const substituteDateText = formatSubstituteDate(log.substitute_at);
                    if (substituteDateText) {
                      displayText = memo
                        ? `${dateText} 대체${memoPart} 변경 일 (${substituteDateText})`
                        : `${dateText} 대체 변경 일 (${substituteDateText})`;
                    } else {
                      displayText = memo
                        ? `${dateText} 대체${memoPart}`
                        : `${dateText} 대체`;
                    }
                  } else if (log.status === 'absent') {
                    // 결석인 경우: 날짜 + 결석 + (사유) + 조건표시 + (필요시 금액)
                    const memoPart = memo ? ` (${memo})` : '';
                    const conditionPart = conditionLabel ? ` ${conditionLabel}` : '';
                    const deductionPart = shouldShowDeduction 
                      ? ` (-${perSessionAmount.toLocaleString()}원)`
                      : '';
                    displayText = `${dateText} ${statusText}${memoPart}${conditionPart}${deductionPart}`;
                  } else {
                    // 출석 등 다른 경우
                    // 금액권인지 판단
                    const snapshot = primaryContract?.policy_snapshot ?? {};
                    const totalSessions = typeof snapshot.total_sessions === 'number' ? snapshot.total_sessions : 0;
                    const isAmountBased = totalSessions === 0; // 금액권 (ended_at은 표시용일 뿐, 판별에 사용하지 않음)
                    
                    // 금액권이고 present 또는 vanish 상태일 때 amount 표시
                    if (isAmountBased && (log.status === 'present' || log.status === 'vanish') && log.amount !== null && log.amount !== undefined) {
                      // 금액권의 경우: JSX로 분리하여 금액 부분만 빨간색으로 표시
                      const memoPart = memo ? ` ${memo}` : '';
                      const needsSms = log.status === 'present' && log.sms_sent === false;
                      const smsSent = log.status === 'present' && log.sms_sent === true;
                      const amountText = log.amount === 0 ? '0원' : `-${log.amount.toLocaleString()}원`;
                      
                      return (
                        <AttendanceItem key={log.id}>
                          <AttendanceLine>
                            <AttendanceDate $color={statusColor}>
                              {dateText} {statusText} ({' '}
                              <AttendanceAmountText>{amountText}</AttendanceAmountText>
                              {memoPart}
                              {' '})
                            </AttendanceDate>
                            {smsSent && <AttendanceCheckIcon>✓</AttendanceCheckIcon>}
                          </AttendanceLine>
                          {needsSms && (
                            <AttendanceActionRow>
                              <AttendanceSendButton
                                onPress={() => handleSendAttendanceSms(log.id, detail?.phone)}
                              >
                                <AttendanceSendButtonText>전송</AttendanceSendButtonText>
                              </AttendanceSendButton>
                            </AttendanceActionRow>
                          )}
                          {log.modified_at || log.change_reason ? (
                            <AttendanceChange>
                              수정됨 ({log.modified_at ? formatAttendanceDateTime(log.modified_at) : '시간 미상'}) ·{' '}
                              {log.change_reason ?? '사유 없음'}
                            </AttendanceChange>
                          ) : null}
                        </AttendanceItem>
                      );
                    } else if (isAmountBased && log.status === 'present') {
                      // 금액권이지만 amount가 없는 경우 (레거시 데이터)
                      displayText = `${dateText} 관리`;
                    } else {
                      // 횟수권 또는 다른 상태
                      // 횟수권이고 present 상태일 때: "사용 (1회)"로 표시
                      if (log.status === 'present' && !isAmountBased) {
                        displayText = memo 
                          ? `${dateText} 사용 (1회) (${memo})`
                          : `${dateText} 사용 (1회)`;
                      } else {
                        displayText = memo 
                          ? `${dateText} ${statusText} (${memo})`
                          : `${dateText} ${statusText}`;
                      }
                    }
                  }
                  
                  // 횟수권 또는 다른 상태: 전송 버튼/체크표시 추가
                  const needsSms = log.status === 'present' && log.sms_sent === false;
                  const smsSent = log.status === 'present' && log.sms_sent === true;
                  
                  return (
                    <AttendanceItem key={log.id}>
                      <AttendanceLine>
                        <AttendanceDate $color={statusColor}>{displayText}</AttendanceDate>
                        {smsSent && <AttendanceCheckIcon>✓</AttendanceCheckIcon>}
                      </AttendanceLine>
                      {needsSms && (
                        <AttendanceActionRow>
                          <AttendanceSendButton
                            onPress={() => handleSendAttendanceSms(log.id, detail?.phone)}
                          >
                            <AttendanceSendButtonText>전송</AttendanceSendButtonText>
                          </AttendanceSendButton>
                        </AttendanceActionRow>
                      )}
                      {log.modified_at || log.change_reason ? (
                        <AttendanceChange>
                          수정됨 ({log.modified_at ? formatAttendanceDateTime(log.modified_at) : '시간 미상'}) ·{' '}
                          {log.change_reason ?? '사유 없음'}
                        </AttendanceChange>
                      ) : null}
                    </AttendanceItem>
                  );
                })}
              </AttendanceList>
              {filteredAttendanceLogs.length > 1 && (
                <AttendanceToggleButton onPress={() => setIsAttendanceExpanded(!isAttendanceExpanded)}>
                  <AttendanceToggleText>
                    {isAttendanceExpanded ? '접기' : `더보기 (${filteredAttendanceLogs.length - 1}개)`}
                  </AttendanceToggleText>
                </AttendanceToggleButton>
              )}
            </>
          )}
        </SectionCard>

        {/* 청구서 전송내역 섹션 */}
        <SectionCardLast>
          <SectionHeader>
            <SectionTitle>청구서 전송내역</SectionTitle>
          </SectionHeader>
          {sentInvoices.length === 0 ? (
            <EmptyDescription>전송된 정산서가 없습니다.</EmptyDescription>
          ) : (
            <InvoiceList>
              {sentInvoices.map((invoice) => {
                // 전송 시점에 저장된 display_period_start/display_period_end 우선 사용
                // 없으면 period_start/period_end 사용
                let periodText: string;
                
                if (invoice.display_period_start && invoice.display_period_end) {
                  // display_period_end가 '회'인 경우 (횟수제)
                  if (invoice.display_period_end === '회') {
                    periodText = `${invoice.year}년${invoice.month}월(${invoice.display_period_start}회)`;
                  } else {
                    // 날짜 형식인 경우 (기간제)
                    const startDate = new Date(invoice.display_period_start);
                    const endDate = new Date(invoice.display_period_end);
                    const startYear = startDate.getFullYear();
                    const startMonth = startDate.getMonth() + 1;
                    const startDay = startDate.getDate();
                    const endYear = endDate.getFullYear();
                    const endMonth = endDate.getMonth() + 1;
                    const endDay = endDate.getDate();
                    periodText = `${invoice.year}년${invoice.month}월 (${startYear}.${String(startMonth).padStart(2, '0')}.${String(startDay).padStart(2, '0')}~${endYear}.${String(endMonth).padStart(2, '0')}.${String(endDay).padStart(2, '0')})`;
                  }
                } else if (invoice.period_start && invoice.period_end) {
                  // display_period가 없으면 period_start/period_end 사용 (fallback)
                  const startDate = new Date(invoice.period_start);
                  const endDate = new Date(invoice.period_end);
                  const startYear = startDate.getFullYear();
                  const startMonth = startDate.getMonth() + 1;
                  const startDay = startDate.getDate();
                  const endYear = endDate.getFullYear();
                  const endMonth = endDate.getMonth() + 1;
                  const endDay = endDate.getDate();
                  periodText = `${invoice.year}년${invoice.month}월 (${startYear}.${String(startMonth).padStart(2, '0')}.${String(startDay).padStart(2, '0')}~${endYear}.${String(endMonth).padStart(2, '0')}.${String(endDay).padStart(2, '0')})`;
                } else {
                  periodText = `${invoice.year}년${invoice.month}월(${invoice.month}월분)`;
                }
                
                // 연장 청구서 여부 확인 (invoice_number > 1)
                const isExtension = ((invoice as any).invoice_number ?? 1) > 1;
                if (isExtension) {
                  periodText = `${periodText} (연장)`;
                }
                
                return (
                <InvoiceItem key={invoice.id}>
                  <InvoiceInfo>
                    <InvoicePeriod>{periodText}</InvoicePeriod>
                    <InvoiceAmount>{(invoice.final_amount ?? 0).toLocaleString()}원</InvoiceAmount>
                    {invoice.payment_status && (
                      <PaymentStatusBadge>
                        <PaymentStatusBadgeText>입금완료</PaymentStatusBadgeText>
                      </PaymentStatusBadge>
                    )}
                  </InvoiceInfo>
                  {(invoice as any).auto_adjustment !== undefined && (invoice as any).auto_adjustment !== 0 && (
                    <InvoiceAdjustment>
                      자동 조정: {(invoice as any).auto_adjustment > 0 ? '+' : ''}{(invoice as any).auto_adjustment.toLocaleString()}원
                    </InvoiceAdjustment>
                  )}
                  {(invoice as any).manual_adjustment !== undefined && (invoice as any).manual_adjustment !== 0 && (
                    <InvoiceAdjustment>
                      수동 조정: {(invoice as any).manual_adjustment > 0 ? '+' : ''}{(invoice as any).manual_adjustment.toLocaleString()}원
                      {(invoice as any).manual_reason && ` (${(invoice as any).manual_reason})`}
                    </InvoiceAdjustment>
                  )}
                  {(invoice as any).created_at && (
                    <InvoiceDate>전송일: {new Date((invoice as any).created_at).toLocaleDateString('ko-KR')}</InvoiceDate>
                  )}
                </InvoiceItem>
              );
              })}
            </InvoiceList>
          )}
        </SectionCardLast>
      </Content>


      {/* 연장 모달 */}
      {primaryContract && extendModalProps && (
        <ExtendContractModal
          visible={showExtendModal}
          onClose={() => setShowExtendModal(false)}
          onSuccess={handleExtendSuccess}
          contractId={primaryContract.id}
          contractType={extendModalProps.contractType}
          totalSessions={extendModalProps.totalSessions}
          remainingSessions={extendModalProps.remainingSessions}
          totalAmount={extendModalProps.totalAmount}
          remainingAmount={extendModalProps.remainingAmount}
        />
      )}

      {/* 월 선택 모달 */}
      <Modal
        isVisible={showMonthPicker}
        onBackdropPress={() => setShowMonthPicker(false)}
        onBackButtonPress={() => setShowMonthPicker(false)}
        style={{ margin: 0, justifyContent: 'flex-end' }}
      >
        <MonthPickerModalContainer>
          <MonthPickerModalHeader>
            <MonthPickerModalTitle>사용 기록 월 선택</MonthPickerModalTitle>
            <MonthPickerCloseButton onPress={() => setShowMonthPicker(false)}>
              <MonthPickerCloseText>닫기</MonthPickerCloseText>
            </MonthPickerCloseButton>
          </MonthPickerModalHeader>
          <MonthPickerList>
            {availableMonths.map((monthOption) => {
              const isSelected = 
                monthOption.year === currentSelectedMonth.year && 
                monthOption.month === currentSelectedMonth.month;
              return (
                <MonthPickerItem
                  key={`${monthOption.year}-${monthOption.month}`}
                  onPress={() => {
                    setSelectedAttendanceMonth(monthOption);
                    setShowMonthPicker(false);
                  }}
                >
                  <MonthPickerItemText $selected={isSelected}>
                    {monthOption.year}년 {monthOption.month + 1}월
                  </MonthPickerItemText>
                  {isSelected && <MonthPickerCheckmark>✓</MonthPickerCheckmark>}
                </MonthPickerItem>
              );
            })}
          </MonthPickerList>
        </MonthPickerModalContainer>
      </Modal>

      {/* 수업 일정 변경용 달력 모달 (간단 버전) */}
      <Modal
        isVisible={showScheduleModal}
        onBackdropPress={() => setShowScheduleModal(false)}
        onBackButtonPress={() => setShowScheduleModal(false)}
        style={{ margin: 0, justifyContent: 'flex-end' }}
      >
        <ScheduleModalContainer>
          <ScheduleModalHeader>
            {scheduleMode === 'modeSelection' ? (
              <>
                <ScheduleModalTitle>예약 또는 변경을 선택하세요</ScheduleModalTitle>
                <ScheduleModalSubtitle>예약 추가 또는 기존 예약 변경 중 선택해주세요</ScheduleModalSubtitle>
              </>
            ) : scheduleMode === 'add' ? (
              <>
                <ScheduleModalTitle $isNewStep={scheduleStep === 'selectTime'}>
                  {scheduleStep === 'selectDate'
                    ? '예약할 날짜를 선택하세요'
                    : '예약 시간을 선택하세요'}
                </ScheduleModalTitle>
                <ScheduleModalSubtitle>
                  {scheduleStep === 'selectDate'
                    ? '예약할 날짜를 선택해주세요'
                    : '예약 시간을 선택해주세요 (선택사항)'}
                </ScheduleModalSubtitle>
              </>
            ) : scheduleMode === 'change' ? (
              <>
                <ScheduleModalTitle $isNewStep={scheduleStep === 'selectNew' || scheduleStep === 'selectTime'}>
                  {scheduleStep === 'selectOriginal'
                    ? '변경할 예약을 선택하세요'
                    : scheduleStep === 'selectNew'
                    ? '변경할 날짜를 선택하세요'
                    : '변경할 시간을 선택하세요'}
                </ScheduleModalTitle>
                <ScheduleModalSubtitle>
                  {scheduleStep === 'selectOriginal'
                    ? '파란 점이 표시된 날짜가 예약된 날짜입니다'
                    : scheduleStep === 'selectNew'
                    ? '새로운 예약 날짜를 선택해주세요'
                    : '새로운 예약 시간을 선택해주세요 (필수)'}
                </ScheduleModalSubtitle>
              </>
            ) : (
              <>
                <ScheduleModalTitle $isNewStep={scheduleStep === 'selectNew'}>
                  {scheduleStep === 'selectOriginal'
                    ? '변경을 원하는 수업 일을 선택하세요.'
                    : '대체할 수업 일을 선택하세요'}
                </ScheduleModalTitle>
                <ScheduleModalSubtitle>
                  {scheduleStep === 'selectOriginal'
                    ? '변경 가능한 수업 일이 파란색으로 표시됩니다.'
                    : '새로운 수업 일을 선택할 수 있습니다.'}
                </ScheduleModalSubtitle>
              </>
            )}
          </ScheduleModalHeader>

          {/* 모드 선택 단계 */}
          {scheduleMode === 'modeSelection' && (
            <ScheduleModeSelectionContainer>
              <ScheduleModeButton onPress={handleSelectAddMode}>
                <ScheduleModeButtonText>예약</ScheduleModeButtonText>
              </ScheduleModeButton>
              <ScheduleModeButton $isChange onPress={handleSelectChangeMode}>
                <ScheduleModeButtonText $isChange>변경</ScheduleModeButtonText>
              </ScheduleModeButton>
            </ScheduleModeSelectionContainer>
          )}

          {/* 달력 (날짜 선택 단계일 때만 표시, 시간 선택 단계에서는 숨김) */}
          {scheduleMode !== 'modeSelection' && scheduleMode !== null && scheduleStep !== 'selectTime' && (
            <>
          {/* 달력 헤더 (월 이동) */}
          <ScheduleCalendarHeader>
            <ScheduleMonthButton onPress={() => handleChangeScheduleMonth('prev')}>
              <ScheduleMonthButtonText>{'‹'}</ScheduleMonthButtonText>
            </ScheduleMonthButton>
            <ScheduleMonthLabel>
              {scheduleCurrentMonth.getFullYear()}년 {scheduleCurrentMonth.getMonth() + 1}월
            </ScheduleMonthLabel>
            <ScheduleMonthButton onPress={() => handleChangeScheduleMonth('next')}>
              <ScheduleMonthButtonText>{'›'}</ScheduleMonthButtonText>
            </ScheduleMonthButton>
          </ScheduleCalendarHeader>

          {/* 요일 헤더 */}
          <ScheduleWeekHeader>
            {['일', '월', '화', '수', '목', '금', '토'].map((label) => (
              <ScheduleWeekDay key={label}>{label}</ScheduleWeekDay>
            ))}
          </ScheduleWeekHeader>

          {/* 날짜 그리드 */}
          <ScheduleCalendarGrid>
            {(() => {
              const days: JSX.Element[] = [];
              const year = scheduleCurrentMonth.getFullYear();
              const month = scheduleCurrentMonth.getMonth();
              const firstDay = new Date(year, month, 1);
              const firstWeekday = firstDay.getDay(); // 0(Sun)~6(Sat)
              const daysInMonth = new Date(year, month + 1, 0).getDate();

              const today = new Date();
              today.setHours(0, 0, 0, 0);

              // 횟수제 계약의 총 회차 제한 (달 무관하게 계약 회차만큼만 표시)
              const contractSnapshot = (primaryContract?.policy_snapshot ?? {}) as Record<string, any>;
              const totalSessions =
                typeof contractSnapshot.total_sessions === 'number' ? contractSnapshot.total_sessions : 0;
              // 계약 시작일 (없으면 오늘)
              const contractStart =
                primaryContract?.started_at ? new Date(primaryContract.started_at) : new Date();
              contractStart.setHours(0, 0, 0, 0);

              // 예정 수업일 판정 함수 (요일/일정변경 반영)
              const isPlannedDay = (d: Date) => {
                const cursorKey = d.getTime().toString();
                const wk = dayKeys[d.getDay()];
                const isOriginal = originalDates.has(cursorKey);
                const isNew = newDates.has(cursorKey);
                return (contractDays.includes(wk) && !isOriginal) || isNew;
              };

              // 계약 시작일부터 특정 날짜까지 예정 수업 누적 계산 (메모이징으로 중복 계산 방지)
              const plannedCountCache = new Map<number, number>();
              const countPlannedUntil = (to: Date): number => {
                const key = to.getTime();
                if (plannedCountCache.has(key)) return plannedCountCache.get(key)!;

                let cnt = 0;
                const cursor = new Date(contractStart);
                cursor.setHours(0, 0, 0, 0);
                while (cursor <= to) {
                  if (isPlannedDay(cursor)) {
                    cnt += 1;
                  }
                  cursor.setDate(cursor.getDate() + 1);
                  cursor.setHours(0, 0, 0, 0);
                }
                plannedCountCache.set(key, cnt);
                return cnt;
              };

              const { minDate, maxDate } = scheduleDateRange;
              const minTime = minDate ? minDate.getTime() : null;
              const maxTime = maxDate ? maxDate.getTime() : null;

              const dayKeys = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
              const contractDays =
                (primaryContract?.day_of_week as string[] | undefined) ?? [];

              // 일정 예외(ScheduleException) 처리
              const scheduleExceptions = primaryContract?.schedule_exceptions ?? [];
              const originalDates = new Set<string>();
              const newDates = new Set<string>();
              scheduleExceptions.forEach((ex: ScheduleException) => {
                const originalDate = new Date(ex.original_date);
                originalDate.setHours(0, 0, 0, 0);
                const newDate = new Date(ex.new_date);
                newDate.setHours(0, 0, 0, 0);
                originalDates.add(originalDate.getTime().toString());
                newDates.add(newDate.getTime().toString());
              });

              // 대체 수업 기록을 일정 변경처럼 반영 (원래 날짜는 제외, 대체 날짜는 포함)
              if (Array.isArray(detail?.attendance_logs)) {
                detail.attendance_logs.forEach((log) => {
                  if (
                    log.status === 'substitute' &&
                    log.substitute_at &&
                    log.occurred_at &&
                    !log.voided
                  ) {
                    const originalDate = new Date(log.occurred_at);
                    originalDate.setHours(0, 0, 0, 0);
                    const substituteDate = new Date(log.substitute_at);
                    substituteDate.setHours(0, 0, 0, 0);
                    originalDates.add(originalDate.getTime().toString());
                    newDates.add(substituteDate.getTime().toString());
                  }
                });
              }

              // 출결기록이 있는 날짜 확인 (출결처리가 완료된 날짜는 일정변경 불가)
              const attendanceDates = new Set<string>();
              if (Array.isArray(detail?.attendance_logs)) {
                detail.attendance_logs.forEach((log) => {
                  if (log.occurred_at && !log.voided) {
                    const logDate = new Date(log.occurred_at);
                    logDate.setHours(0, 0, 0, 0);
                    attendanceDates.add(logDate.getTime().toString());
                  }
                });
              }

              const isSameDate = (a: Date | null, b: Date | null) => {
                if (!a || !b) return false;
                return (
                  a.getFullYear() === b.getFullYear() &&
                  a.getMonth() === b.getMonth() &&
                  a.getDate() === b.getDate()
                );
              };

              // 앞쪽 빈 칸
              for (let i = 0; i < firstWeekday; i += 1) {
                days.push(<ScheduleDayCell key={`empty-${i}`} />);
              }

              // 실제 날짜 셀
              for (let day = 1; day <= daysInMonth; day += 1) {
                const date = new Date(year, month, day);
                date.setHours(0, 0, 0, 0);
                const time = date.getTime();

                const weekdayIndex = date.getDay();
                const weekdayKey = dayKeys[weekdayIndex];

                const isBeforeToday = time < today.getTime();
                const outOfRange =
                  (minTime !== null && time < minTime) ||
                  (maxTime !== null && time > maxTime);

                const dateTimeStr = time.toString();
                const isOriginalDate = originalDates.has(dateTimeStr);
                const isNewDate = newDates.has(dateTimeStr);
                const hasAttendance = attendanceDates.has(dateTimeStr); // 출결기록이 있는 날짜

                // 기본 요일 기반 수업일이지만 original_date로 변경된 경우는 제외
                // new_date인 경우는 요일과 무관하게 표시
                let hasPlannedClass =
                  (contractDays.includes(weekdayKey) && !isOriginalDate) || isNewDate;

                // 횟수제 계약이면 총 계약 회차를 초과하지 않도록 제한 (달과 무관)
                if (totalSessions > 0 && hasPlannedClass) {
                  const plannedSoFar = countPlannedUntil(date);
                  if (plannedSoFar > totalSessions) {
                    hasPlannedClass = false;
                  }
                }

                // 예약된 날짜 확인
                const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                const hasReservation = reservationDates.has(dateStr);

                // 예약 모드에 따른 선택 가능 여부
                let selectableOriginal = false;
                let selectableNew = false;
                let selectableDate = false;

                if (scheduleMode === 'add' && scheduleStep === 'selectDate') {
                  // 예약 추가: 미래 날짜만 선택 가능 (예약이 있어도 선택 가능)
                  selectableDate = !isBeforeToday && !outOfRange;
                } else if (scheduleMode === 'change' && scheduleStep === 'selectOriginal') {
                  // 예약 변경: 예약된 날짜 중 출결 로그가 없는 날짜만 선택 가능
                  const reservationInfo = hasReservation ? reservationDates.get(dateStr) : null;
                  const hasAttendanceLog = reservationInfo?.hasAttendanceLog || false;
                  selectableOriginal = !isBeforeToday && !outOfRange && hasReservation && !hasAttendanceLog;
                } else if (scheduleMode === 'change' && scheduleStep === 'selectNew') {
                  // 예약 변경: 새 날짜 선택 (미래 날짜)
                  selectableNew = !isBeforeToday && !outOfRange;
                } else {
                  // 기존 로직 (레거시)
                  selectableOriginal =
                    scheduleStep === 'selectOriginal' &&
                    !isBeforeToday &&
                    !outOfRange &&
                    hasPlannedClass &&
                    !hasAttendance;
                  selectableNew =
                    scheduleStep === 'selectNew' && !isBeforeToday && !outOfRange;
                }

                const disabled =
                  scheduleMode === 'add' && scheduleStep === 'selectDate'
                    ? !selectableDate
                    : scheduleMode === 'change' && scheduleStep === 'selectOriginal'
                    ? !selectableOriginal
                    : scheduleMode === 'change' && scheduleStep === 'selectNew'
                    ? !selectableNew
                    : scheduleStep === 'selectOriginal'
                    ? !selectableOriginal
                    : !selectableNew;

                const isSelectedOriginal = isSameDate(date, selectedOriginalDate);
                const isSelectedNew = isSameDate(date, selectedNewDate);
                const isSelectedDate = scheduleMode === 'add' && isSameDate(date, selectedDate);

                const isSelected = isSelectedOriginal || isSelectedNew || isSelectedDate;

                // 예약 모드에 따른 날짜 선택 로직
                const onPress = () => {
                  if (disabled) return;
                  
                  if (scheduleMode === 'add' && scheduleStep === 'selectDate') {
                    // 예약 추가: 날짜 선택 후 시간 선택 단계로 이동
                    setSelectedDate(date);
                    setScheduleStep('selectTime');
                  } else if (scheduleMode === 'change' && scheduleStep === 'selectOriginal') {
                    // 예약 변경: 원래 예약 날짜 선택 후 바로 다음 단계로 이동
                    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                    const reservation = reservationDates.get(dateStr);
                    if (reservation) {
                      setSelectedOriginalDate(date);
                      setSelectedReservationId(reservation.id);
                      // 시간이 있으면 미리 채우기
                      if (reservation.time) {
                        const [h, m] = reservation.time.split(':').map(Number);
                        setSelectedHour(h);
                        setSelectedMinute(m);
                      }
                      // 바로 다음 단계(변경할 날짜 선택)로 이동
                      setScheduleStep('selectNew');
                      setSelectedNewDate(null);
                    }
                  } else if (scheduleMode === 'change' && scheduleStep === 'selectNew') {
                    // 예약 변경: 새 날짜 선택
                    setSelectedNewDate(date);
                  } else if (scheduleStep === 'selectOriginal') {
                    // 기존 로직 (레거시)
                    setSelectedOriginalDate(date);
                    setScheduleStep('selectNew');
                    setSelectedNewDate(null);
                  } else {
                    // 기존 로직 (레거시)
                    setSelectedNewDate(date);
                  }
                };

                days.push(
                  <ScheduleDayCell key={`day-${day}`}>
                    <ScheduleDayButton disabled={disabled} onPress={onPress}>
                    <ScheduleDayInner
                      $selected={isSelected}
                      $isOriginalSelection={isSelectedOriginal}
                      $isNewSelection={isSelectedNew}
                        $hasPlannedClass={hasPlannedClass}
                        $disabled={disabled}
                      >
                      <ScheduleDayText
                        $selected={isSelected}
                        $isOriginalSelection={isSelectedOriginal}
                        $isNewSelection={isSelectedNew}
                        $disabled={disabled}
                      >
                          {day}
                        </ScheduleDayText>
                        {/* 예약된 날짜 또는 예정 수업일 표시 */}
                        {(hasReservation || hasPlannedClass) && (() => {
                          const reservationInfo = hasReservation ? reservationDates.get(dateStr) : null;
                          const hasAttendanceLog = reservationInfo?.hasAttendanceLog || false;
                          return (
                            <ScheduleDot
                              $selected={isSelected}
                              $isNewSelection={isSelectedNew || isSelectedDate}
                              $disabled={disabled}
                              $isReservation={hasReservation}
                              $hasAttendanceLog={hasAttendanceLog}
                            />
                          );
                        })()}
                      </ScheduleDayInner>
                    </ScheduleDayButton>
                  </ScheduleDayCell>,
                );
              }

              return days;
            })()}
          </ScheduleCalendarGrid>

          {scheduleMode === 'change' && scheduleStep === 'selectOriginal' && (
            <ScheduleLegend>
              <ScheduleLegendText>● 표시된 날짜가 예약된 날짜입니다.</ScheduleLegendText>
            </ScheduleLegend>
          )}
          {!scheduleMode && (
            <ScheduleLegend>
              <ScheduleLegendText>● 표시된 날짜가 원래 수업 예정일입니다.</ScheduleLegendText>
            </ScheduleLegend>
          )}
            </>
          )}

          {/* 시간 선택 UI (시간 선택 단계일 때만 표시) */}
          {scheduleStep === 'selectTime' && (
            <ScheduleTimeSelectionContainer>
              {/* 선택한 날짜의 예약 타임라인 */}
              <TodayReservationsContainer>
                <TodayReservationsLabel>
                  {selectedDate ? `${selectedDate.getMonth() + 1}월 ${selectedDate.getDate()}일 예약 시간` : '예약 시간'}
                </TodayReservationsLabel>
                {todayReservations.length > 0 ? (
                  <TodayReservationsTimeline>
                    {todayReservations.map((reservation, index) => (
                      <TodayReservationItem key={index}>
                        <TodayReservationTime>{reservation.time}</TodayReservationTime>
                        <TodayReservationBar />
                        <TodayReservationName>{reservation.student_name}</TodayReservationName>
                      </TodayReservationItem>
                    ))}
                  </TodayReservationsTimeline>
                ) : (
                  <TodayReservationsEmptyText>이 날짜에는 예약이 없습니다</TodayReservationsEmptyText>
                )}
              </TodayReservationsContainer>
              <ScheduleTimeLabel>시간 선택 (선택사항)</ScheduleTimeLabel>
              <ScheduleTimeRow>
                <ScheduleTimeColumn>
                  <ScheduleTimeLabel>시</ScheduleTimeLabel>
                  <ScheduleTimeScrollView>
                    {Array.from({ length: 24 }, (_, i) => i).map((hour) => (
                      <ScheduleTimeButton
                        key={hour}
                        $selected={selectedHour === hour}
                        onPress={() => setSelectedHour(hour)}
                      >
                        <ScheduleTimeButtonText $selected={selectedHour === hour}>
                          {String(hour).padStart(2, '0')}
                        </ScheduleTimeButtonText>
                      </ScheduleTimeButton>
                    ))}
                  </ScheduleTimeScrollView>
                </ScheduleTimeColumn>
                <ScheduleTimeColumn>
                  <ScheduleTimeLabel>분</ScheduleTimeLabel>
                  <ScheduleTimeScrollView>
                    {[0, 15, 30, 45].map((minute) => (
                      <ScheduleTimeButton
                        key={minute}
                        $selected={selectedMinute === minute}
                        onPress={() => setSelectedMinute(minute)}
                      >
                        <ScheduleTimeButtonText $selected={selectedMinute === minute}>
                          {String(minute).padStart(2, '0')}
                        </ScheduleTimeButtonText>
                      </ScheduleTimeButton>
                    ))}
                  </ScheduleTimeScrollView>
                </ScheduleTimeColumn>
              </ScheduleTimeRow>
            </ScheduleTimeSelectionContainer>
          )}

          <ScheduleModalFooter>
            <ScheduleCloseButton onPress={() => setShowScheduleModal(false)}>
              <ScheduleCloseButtonText>닫기</ScheduleCloseButtonText>
            </ScheduleCloseButton>
            {/* 예약 추가 확인 버튼 */}
            {scheduleMode === 'add' && scheduleStep === 'selectDate' && selectedDate && (
              <ScheduleConfirmButton
                disabled={scheduleSubmitting}
                onPress={() => setScheduleStep('selectTime')}
              >
                <ScheduleConfirmButtonText>다음</ScheduleConfirmButtonText>
              </ScheduleConfirmButton>
            )}
            {scheduleMode === 'add' && scheduleStep === 'selectTime' && (
              <ScheduleConfirmButton
                disabled={scheduleSubmitting}
                onPress={handleConfirmAddReservation}
              >
                <ScheduleConfirmButtonText>
                  {scheduleSubmitting ? '예약 중...' : '예약 확정'}
                </ScheduleConfirmButtonText>
              </ScheduleConfirmButton>
            )}
            {/* 예약 변경 확인 버튼 */}
            {/* selectOriginal 단계에서는 날짜 선택 시 자동으로 다음 단계로 이동하므로 버튼 제거 */}
            {scheduleMode === 'change' && scheduleStep === 'selectNew' && selectedNewDate && (
              <ScheduleConfirmButton
                disabled={scheduleSubmitting}
                onPress={() => setScheduleStep('selectTime')}
              >
                <ScheduleConfirmButtonText>다음</ScheduleConfirmButtonText>
              </ScheduleConfirmButton>
            )}
            {scheduleMode === 'change' && scheduleStep === 'selectTime' && (
              <ScheduleConfirmButton
                disabled={!selectedHour || !selectedMinute || scheduleSubmitting}
                onPress={handleConfirmReschedule}
              >
                <ScheduleConfirmButtonText>
                  {scheduleSubmitting ? '변경 중...' : '변경 확정'}
                </ScheduleConfirmButtonText>
              </ScheduleConfirmButton>
            )}
            {/* 기존 일정 변경 확인 버튼 (레거시) */}
            {!scheduleMode && scheduleStep === 'selectNew' && (
              <ScheduleConfirmButton
                disabled={!selectedOriginalDate || !selectedNewDate || scheduleSubmitting}
                onPress={handleConfirmReschedule}
              >
                <ScheduleConfirmButtonText>
                  {scheduleSubmitting ? '변경 중...' : '일정 변경 확정'}
                </ScheduleConfirmButtonText>
              </ScheduleConfirmButton>
            )}
          </ScheduleModalFooter>
        </ScheduleModalContainer>
      </Modal>
    </Container>
  );
}

export default function StudentDetailScreen() {
  return <StudentDetailContent />;
}

const InfoRow = ({ label, value }: { label: string; value?: string | null }) => {
  return (
    <InfoRowContainer>
      <InfoLabel>{label}</InfoLabel>
      <InfoValue>{value && value !== '' ? value : '-'}</InfoValue>
    </InfoRowContainer>
  );
};

const formatCurrency = (value: number) => value.toLocaleString('ko-KR');

const DAY_NAMES: Record<string, string> = {
  MON: '월',
  TUE: '화',
  WED: '수',
  THU: '목',
  FRI: '금',
  SAT: '토',
  SUN: '일',
};

const formatDayOfWeek = (days: string[]) => {
  return days.map((day) => DAY_NAMES[day] ?? day).join('/');
};

const formatDate = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(
    2,
    '0',
  )}`;
};

const formatAttendanceDate = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}/${day}`;
};

const formatSubstituteDate = (substituteAt: string | null | undefined) => {
  if (!substituteAt) return '';
  const subDate = new Date(substituteAt);
  if (Number.isNaN(subDate.getTime())) return '';
  const subMonth = String(subDate.getMonth() + 1).padStart(2, '0');
  const subDay = String(subDate.getDate()).padStart(2, '0');
  return `${subMonth}/${subDay}`;
};

const formatAttendanceDateTime = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${hours}:${minutes}`;
};

const formatAttendanceStatus = (status: string) => {
  const map: Record<string, string> = {
    present: '사용',
    absent: '결석',
    substitute: '대체수업',
    vanish: '소멸',
    holiday: '휴강',
  };
  return map[status] ?? status;
};

const getAttendanceStatusColor = (status: string) => {
  switch (status) {
    case 'present':
      return '#000000'; // 검정
    case 'absent':
      return '#ff3b30'; // 붉은색
    case 'substitute':
      return '#007AFF'; // 파랑
    case 'vanish':
      return '#8e8e93';
    default:
      return '#8e8e93';
  }
};

const Container = styled.ScrollView`
  flex: 1;
  background-color: #ffffff;
`;

const Content = styled.View`
  padding: 0;
  padding-bottom: 40px;
`;

const HeaderCard = styled.View`
  background-color: #ffffff;
  padding: 20px 16px;
  flex-direction: row;
  justify-content: space-between;
  align-items: flex-start;
  border-bottom-width: 1px;
  border-bottom-color: #e5e5ea;
`;

const HeaderTexts = styled.View`
  flex: 1;
  padding-right: 12px;
`;

const StudentNameContainer = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
`;

const StudentNameIcon = styled.Image`
  width: 24px;
  height: 24px;
`;

const StudentName = styled.Text`
  font-size: 24px;
  font-weight: 700;
  color: #111;
`;

const HeaderMeta = styled.Text`
  font-size: 14px;
  color: #555;
  line-height: 20px;
`;

const ButtonGroup = styled.View`
  flex-direction: row;
  gap: 8px;
  align-items: center;
`;

const EditButton = styled.TouchableOpacity`
  background-color: #1d42d8;
  padding: 8px 14px;
  border-radius: 8px;
`;

const EditButtonText = styled.Text`
  font-size: 14px;
  font-weight: 600;
  color: #fff;
`;

const ExtendButton = styled.TouchableOpacity`
  padding: 8px 14px;
  background-color: #0a84ff;
  border-radius: 8px;
`;

const ExtendButtonText = styled.Text`
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
`;

const SectionCard = styled.View`
  background-color: #ffffff;
  padding: 20px 16px;
  border-bottom-width: 1px;
  border-bottom-color: #e5e5ea;
`;

const SectionCardLast = styled.View`
  background-color: #ffffff;
  padding: 20px 16px;
`;

const ScheduleSectionCard = styled.View`
  background-color: #ffffff;
  padding: 16px;
  border-bottom-width: 1px;
  border-bottom-color: #e5e5ea;
`;

const SectionHeader = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
`;

const SectionHeaderWithIcon = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 8px;
`;

const SectionIcon = styled.Image`
  width: 20px;
  height: 20px;
`;

const SectionHeaderLeft = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 8px;
  flex: 1;
`;

const SectionTitle = styled.Text`
  font-size: 18px;
  font-weight: 700;
  color: #111;
`;

const MonthPickerButton = styled.TouchableOpacity`
  border-radius: 6px;
  background-color: transparent;
`;

const MonthPickerText = styled.Text`
  font-size: 12px;
  color: #666;
  font-weight: 600;
`;

const ContractBadge = styled.View`
  padding: 4px 10px;
  background-color: #fff2e5;
  border-radius: 999px;
`;

const ContractBadgeText = styled.Text`
  font-size: 13px;
  font-weight: 600;
  color: #ff6b00;
`;

const ContractNote = styled.Text`
  margin-top: 12px;
  font-size: 12px;
  color: #8e8e93;
  line-height: 18px;
`;

const InfoRowContainer = styled.View`
  margin-bottom: 14px;
`;

const InfoLabel = styled.Text`
  font-size: 13px;
  color: #8e8e93;
  margin-bottom: 4px;
`;

const InfoValue = styled.Text`
  font-size: 16px;
  color: #111;
  line-height: 22px;
`;

const AttendanceList = styled.View`
  gap: 16px;
`;

const AttendanceItem = styled.View`
  border-bottom-width: 1px;
  border-bottom-color: #f0f0f3;
  padding-bottom: 12px;
`;

const AttendanceLine = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
`;

const AttendanceDate = styled.Text<{ $color?: string }>`
  flex: 1;
  font-size: 15px;
  color: ${({ $color }: { $color?: string }) => $color || '#333'};
  font-weight: 600;
`;

const AttendanceAmountText = styled.Text`
  color: #ff3b30;
  font-weight: 600;
`;

const AttendanceStatus = styled.Text<{ $color: string }>`
  font-size: 14px;
  font-weight: 700;
  color: ${({ $color }: { $color: string }) => $color};
`;

const AttendanceMeta = styled.Text`
  font-size: 13px;
  color: #8e8e93;
`;

const AttendanceMemo = styled.Text`
  margin-top: 4px;
  font-size: 14px;
  color: #555;
  line-height: 20px;
`;

const AttendanceChange = styled.Text`
  margin-top: 4px;
  font-size: 12px;
  color: #ff9500;
`;

const AttendanceToggleButton = styled.TouchableOpacity`
  margin-top: 12px;
  padding: 12px;
  align-items: center;
  justify-content: center;
`;

const AttendanceToggleText = styled.Text`
  font-size: 14px;
  font-weight: 600;
  color: #007AFF;
`;

const AttendanceActionRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
`;

const AttendanceSendButton = styled.TouchableOpacity`
  padding: 4px 12px;
  background-color: #1d42d8;
  border-radius: 4px;
`;

const AttendanceSendButtonText = styled.Text`
  font-size: 12px;
  font-weight: 600;
  color: #ffffff;
`;

const AttendanceCheckIcon = styled.Text`
  font-size: 16px;
  color: #ff3b30;
  font-weight: bold;
  margin-left: auto;
`;

const EmptyDescription = styled.Text`
  font-size: 14px;
  color: #8e8e93;
`;

const InvoiceList = styled.View`
  gap: 12px;
`;

const InvoiceItem = styled.View`
  padding: 16px;
  background-color: #f8f9fa;
  border-radius: 8px;
  gap: 8px;
`;

const InvoiceInfo = styled.View`
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
`;

const InvoicePeriod = styled.Text`
  font-size: 15px;
  font-weight: 600;
  color: #111;
`;

const InvoiceAmount = styled.Text`
  font-size: 16px;
  font-weight: 700;
  color: #111;
`;

const InvoiceAdjustment = styled.Text`
  font-size: 13px;
  color: #666;
`;

const InvoiceDate = styled.Text`
  font-size: 12px;
  color: #8e8e93;
  margin-top: 4px;
`;

const PaymentStatusBadge = styled.View`
  margin-top: 8px;
  padding: 4px 10px;
  border-radius: 12px;
  background-color: #e8f2ff;
  align-self: flex-start;
`;

const PaymentStatusBadgeText = styled.Text`
  font-size: 12px;
  font-weight: 600;
  color: #1d42d8;
`;

const CenteredContainer = styled.View`
  flex: 1;
  justify-content: center;
  align-items: center;
  padding: 24px;
  gap: 12px;
`;

const CenteredText = styled.Text`
  font-size: 15px;
  color: #555;
`;

const ErrorTitle = styled.Text`
  font-size: 18px;
  font-weight: 700;
  color: #a94442;
  text-align: center;
`;

const ErrorDescription = styled.Text`
  font-size: 14px;
  color: #555;
  text-align: center;
  line-height: 20px;
`;

const RetryButton = styled.TouchableOpacity`
  padding: 10px 18px;
  background-color: #ff6b00;
  border-radius: 999px;
`;

const RetryButtonText = styled.Text`
  font-size: 14px;
  font-weight: 600;
  color: #fff;
`;

const ContractsList = styled.View`
  gap: 16px;
`;

const ContractCard = styled.View`
  background-color: #fff;
  border: 1px solid #f0f0f3;
  border-radius: 12px;
  padding: 16px;
  gap: 12px;
`;

const ContractCardHeader = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
`;

const ContractCardTitle = styled.Text`
  font-size: 16px;
  font-weight: 600;
  color: #111;
  flex: 1;
`;

const StatusBadge = styled.View<{ $color: string }>`
  padding: 4px 10px;
  background-color: ${({ $color }: { $color: string }) => `${$color}15`};
  border-radius: 999px;
`;

const StatusBadgeText = styled.Text<{ $color?: string }>`
  font-size: 12px;
  font-weight: 600;
  color: ${({ $color }: { $color?: string }) => $color || '#8e8e93'};
`;

const ContractCardBody = styled.View`
  gap: 8px;
`;

const ContractInfoRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 8px;
`;

const ContractInfoLabel = styled.Text`
  font-size: 13px;
  color: #8e8e93;
`;

const ContractInfoValue = styled.Text`
  font-size: 14px;
  color: #111;
  font-weight: 500;
`;

const ContractCardFooter = styled.View`
  margin-top: 4px;
`;

const SendButton = styled.TouchableOpacity<{ disabled?: boolean }>`
  padding: 10px 18px;
  background-color: #ff6b00;
  border-radius: 8px;
  align-items: center;
  justify-content: center;
  opacity: ${({ disabled }: { disabled?: boolean }) => (disabled ? 0.6 : 1)};
`;

const SendButtonText = styled.Text`
  font-size: 14px;
  font-weight: 600;
  color: #fff;
`;

const MonthPickerModalContainer = styled.View`
  background-color: #ffffff;
  border-top-left-radius: 20px;
  border-top-right-radius: 20px;
  max-height: 80%;
  padding-bottom: 40px;
`;

const MonthPickerModalHeader = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom-width: 1px;
  border-bottom-color: #e0e0e0;
`;

const MonthPickerModalTitle = styled.Text`
  font-size: 18px;
  font-weight: 700;
  color: #111111;
`;

const MonthPickerCloseButton = styled.TouchableOpacity`
  padding: 8px;
`;

const MonthPickerCloseText = styled.Text`
  font-size: 16px;
  color: #1d42d8;
  font-weight: 600;
`;

const MonthPickerList = styled.ScrollView`
  padding: 20px;
`;

const MonthPickerItem = styled.TouchableOpacity`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom-width: 1px;
  border-bottom-color: #f0f0f0;
`;

const MonthPickerItemText = styled.Text<{ $selected?: boolean }>`
  font-size: 16px;
  color: ${(props: { $selected?: boolean }) => (props.$selected ? '#1d42d8' : '#111111')};
  font-weight: ${(props: { $selected?: boolean }) => (props.$selected ? '600' : '400')};
`;

const MonthPickerCheckmark = styled.Text`
  font-size: 16px;
  color: #1d42d8;
  font-weight: 600;
`;

const ScheduleButtonContainer = styled.View`
  margin-top: 4px;
  align-items: flex-end;
`;

const ScheduleButton = styled.TouchableOpacity`
  padding: 8px 14px;
  border-radius: 8px;
  background-color: #1d42d8;
`;

const ScheduleButtonText = styled.Text`
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
`;

const ScheduleSectionContent = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 12px;
  margin-bottom: 6px;
`;

const ScheduleIcon = styled.Image`
  width: 32px;
  height: 32px;
  opacity: 0.7;
`;

const ScheduleInfoText = styled.Text`
  flex: 1;
  font-size: 13px;
  color: #666666;
  line-height: 18px;
`;

const ScheduleModalContainer = styled.View`
  background-color: #ffffff;
  border-top-left-radius: 20px;
  border-top-right-radius: 20px;
  max-height: 80%;
  padding-bottom: 24px;
`;

const ScheduleModalHeader = styled.View`
  padding: 20px 20px 12px;
  border-bottom-width: 1px;
  border-bottom-color: #e0e0e0;
`;

const ScheduleModalTitle = styled.Text<{ $isNewStep?: boolean }>`
  font-size: 18px;
  font-weight: 700;
  color: ${({ $isNewStep }: { $isNewStep?: boolean }) => ($isNewStep ? '#ff6b00' : '#1d42d8')};
  margin-bottom: 4px;
  text-align: center;
`;

const ScheduleModalSubtitle = styled.Text`
  font-size: 13px;
  color: #666666;
  text-align: center;
`;

const ScheduleCalendarPlaceholder = styled.View`
  padding: 24px 20px;
  align-items: center;
  justify-content: center;
`;

const SchedulePlaceholderText = styled.Text`
  font-size: 13px;
  color: #8e8e93;
  text-align: center;
  line-height: 18px;
`;

const ScheduleModalFooter = styled.View`
  flex-direction: row;
  justify-content: flex-end;
  align-items: center;
  padding: 12px 20px 16px;
  border-top-width: 1px;
  border-top-color: #f0f0f0;
  gap: 8px;
`;

const ScheduleCloseButton = styled.TouchableOpacity`
  padding: 10px 16px;
  border-radius: 999px;
  background-color: #f0f0f0;
`;

const ScheduleCloseButtonText = styled.Text`
  font-size: 14px;
  font-weight: 600;
  color: #333333;
`;

const ScheduleConfirmButton = styled.TouchableOpacity<{ disabled?: boolean }>`
  padding: 10px 18px;
  border-radius: 999px;
  background-color: ${({ disabled }: { disabled?: boolean }) => (disabled ? '#c7d2fe' : '#1d42d8')};
  opacity: ${({ disabled }: { disabled?: boolean }) => (disabled ? 0.7 : 1)};
`;

const ScheduleConfirmButtonText = styled.Text`
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
`;

const ScheduleCalendarHeader = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px 8px;
`;

const ScheduleMonthButton = styled.TouchableOpacity`
  padding: 6px 10px;
`;

const ScheduleMonthButtonText = styled.Text`
  font-size: 18px;
  color: #1d42d8;
  font-weight: 600;
`;

const ScheduleMonthLabel = styled.Text`
  font-size: 16px;
  font-weight: 600;
  color: #111111;
`;

const ScheduleWeekHeader = styled.View`
  flex-direction: row;
  padding: 0 20px 4px;
`;

const ScheduleWeekDay = styled.Text`
  flex: 1;
  text-align: center;
  font-size: 12px;
  color: #8e8e93;
`;

const ScheduleCalendarGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  padding: 4px 20px 8px;
`;

const ScheduleDayCell = styled.View`
  width: 14.28%;
  align-items: center;
  margin-bottom: 8px;
`;

const ScheduleDayButton = styled.TouchableOpacity<{ disabled?: boolean }>`
  opacity: ${({ disabled }: { disabled?: boolean }) => (disabled ? 0.35 : 1)};
`;

const ScheduleDayInner = styled.View<{
  $selected?: boolean;
  $isOriginalSelection?: boolean;
  $isNewSelection?: boolean;
  $hasPlannedClass?: boolean;
  $disabled?: boolean;
}>`
  width: 34px;
  height: 34px;
  border-radius: 17px;
  align-items: center;
  justify-content: center;
  background-color: ${({ $isOriginalSelection, $isNewSelection }: { $isOriginalSelection?: boolean; $isNewSelection?: boolean }) => {
    if ($isOriginalSelection) return '#1d42d8'; // 원본 선택: 진한 파랑
    if ($isNewSelection) return '#ff6b00'; // 변경될 날짜 선택: 주황
    return 'transparent';
  }};
`;

const ScheduleDayText = styled.Text<{
  $selected?: boolean;
  $isOriginalSelection?: boolean;
  $isNewSelection?: boolean;
  $disabled?: boolean;
}>`
  font-size: 13px;
  font-weight: ${({ $selected }: { $selected?: boolean }) => ($selected ? 700 : 500)};
  color: ${({ $isOriginalSelection, $isNewSelection, $disabled }: { $isOriginalSelection?: boolean; $isNewSelection?: boolean; $disabled?: boolean }) => {
    if ($isOriginalSelection || $isNewSelection) return '#ffffff';
    if ($disabled) return '#c0c0c0';
    return '#111111';
  }};
`;

const ScheduleDot = styled.View<{
  $selected?: boolean;
  $isNewSelection?: boolean;
  $disabled?: boolean;
  $isReservation?: boolean;
  $hasAttendanceLog?: boolean;
}>`
  width: 4px;
  height: 4px;
  border-radius: 2px;
  margin-top: 3px;
  background-color: ${({ $selected, $isNewSelection, $disabled, $isReservation, $hasAttendanceLog }: { $selected?: boolean; $isNewSelection?: boolean; $disabled?: boolean; $isReservation?: boolean; $hasAttendanceLog?: boolean }) => {
    if ($selected) return '#ffffff';
    // 출결 로그가 있는 예약 날짜는 회색 (비활성)
    if ($isReservation && $hasAttendanceLog) return '#c0c0c0';
    // 출결 로그가 없는 예약 날짜는 파란색 (활성)
    if ($isReservation) return '#1d42d8';
    if ($disabled) return '#c0c0c0';
    if ($isNewSelection) return '#ff6b00';
    return '#1d42d8';
  }};
`;

const ScheduleLegend = styled.View`
  padding: 4px 20px 8px;
`;

const ScheduleLegendText = styled.Text`
  font-size: 12px;
  color: #8e8e93;
`;

const ScheduleModeSelectionContainer = styled.View`
  padding: 20px;
  gap: 12px;
`;

const ScheduleModeButton = styled.TouchableOpacity<{ $isChange?: boolean }>`
  background-color: ${(props: { $isChange?: boolean }) => (props.$isChange ? '#e8f2ff' : '#1d42d8')};
  border-radius: 12px;
  padding: 16px;
  align-items: center;
`;

const ScheduleModeButtonText = styled.Text<{ $isChange?: boolean }>`
  font-size: 16px;
  font-weight: 600;
  color: ${(props: { $isChange?: boolean }) => (props.$isChange ? '#246bfd' : '#ffffff')};
`;

const TodayReservationsContainer = styled.View`
  margin-bottom: 20px;
  padding: 16px;
  background-color: #f8f9fa;
  border-radius: 12px;
`;

const TodayReservationsLabel = styled.Text`
  font-size: 14px;
  font-weight: 600;
  color: #111111;
  margin-bottom: 12px;
`;

const TodayReservationsTimeline = styled.View`
  gap: 8px;
`;

const TodayReservationItem = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 8px;
`;

const TodayReservationTime = styled.Text`
  font-size: 13px;
  font-weight: 600;
  color: #666666;
  width: 50px;
`;

const TodayReservationBar = styled.View`
  flex: 1;
  height: 24px;
  background-color: #e8f2ff;
  border-radius: 4px;
`;

const TodayReservationName = styled.Text`
  font-size: 13px;
  font-weight: 500;
  color: #111111;
  width: 60px;
`;

const TodayReservationsEmptyText = styled.Text`
  font-size: 13px;
  color: #999999;
  text-align: center;
  padding: 8px 0;
`;

const ScheduleTimeSelectionContainer = styled.View`
  padding: 20px;
  border-top-width: 1px;
  border-top-color: #e0e0e0;
`;

const ScheduleTimeLabel = styled.Text`
  font-size: 14px;
  font-weight: 600;
  color: #111111;
  margin-bottom: 12px;
`;

const ScheduleTimeRow = styled.View`
  flex-direction: row;
  gap: 12px;
  align-items: flex-start;
`;

const ScheduleTimeColumn = styled.View`
  flex: 1;
`;

const ScheduleTimeScrollView = styled.ScrollView`
  max-height: 200px;
`;

const ScheduleTimeSelectionTitle = styled.Text`
  font-size: 16px;
  font-weight: 600;
  color: #111111;
  margin-bottom: 16px;
`;

const ScheduleTimeButton = styled.TouchableOpacity<{ $selected?: boolean }>`
  background-color: ${({ $selected }: { $selected?: boolean }) => ($selected ? '#1d42d8' : '#f5f5f5')};
  border-radius: 8px;
  padding: 12px;
  align-items: center;
  margin-bottom: 8px;
`;

const ScheduleTimeButtonText = styled.Text<{ $selected?: boolean }>`
  font-size: 14px;
  font-weight: 500;
  color: ${({ $selected }: { $selected?: boolean }) => ($selected ? '#ffffff' : '#111111')};
`;

const ScheduleTimeSkipButton = styled.TouchableOpacity`
  padding: 12px 16px;
  align-items: center;
`;

const ScheduleTimeSkipText = styled.Text`
  font-size: 14px;
  font-weight: 500;
  color: #1d42d8;
  text-decoration-line: underline;
`;

// 고객 메모 섹션 스타일
const MemoEditButton = styled.TouchableOpacity`
  padding: 0;
`;

const MemoEditButtonText = styled.Text`
  font-size: 14px;
  font-weight: 600;
  color: #1d42d8;
  text-decoration-line: underline;
`;

const MemoEditContainer = styled.View`
  gap: 12px;
`;

const MemoTextInput = styled.TextInput`
  min-height: 100px;
  padding: 12px;
  background-color: #f9f9f9;
  border-radius: 8px;
  border-width: 1px;
  border-color: #e0e0e0;
  font-size: 14px;
  color: #111;
`;

const MemoButtonRow = styled.View`
  flex-direction: row;
  justify-content: flex-end;
  gap: 8px;
`;

const MemoCancelButton = styled.TouchableOpacity<{ disabled?: boolean }>`
  padding: 10px 20px;
  background-color: #f5f5f5;
  border-radius: 8px;
  opacity: ${({ disabled }: { disabled?: boolean }) => (disabled ? 0.5 : 1)};
`;

const MemoCancelButtonText = styled.Text`
  font-size: 14px;
  font-weight: 600;
  color: #666;
`;

const MemoSaveButton = styled.TouchableOpacity<{ disabled?: boolean }>`
  padding: 10px 20px;
  background-color: #1d42d8;
  border-radius: 8px;
  opacity: ${({ disabled }: { disabled?: boolean }) => (disabled ? 0.5 : 1)};
`;

const MemoSaveButtonText = styled.Text`
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
`;

const MemoContent = styled.View`
  padding: 12px 0;
`;

const MemoText = styled.Text`
  font-size: 14px;
  line-height: 20px;
  color: #111;
`;

const MemoEmptyText = styled.Text`
  font-size: 14px;
  color: #999;
  font-style: italic;
`;