import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  LayoutChangeEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation, CommonActions } from '@react-navigation/native';
import { useDashboardStore } from '../store/useDashboardStore';
import { useAuthStore } from '../store/useStore';
import { useContractsStore } from '../store/useContractsStore';
import { useInvoicesStore } from '../store/useInvoicesStore';
import { useStudentsStore } from '../store/useStudentsStore';
import { HomeStackNavigationProp, MainTabsNavigationProp, MainAppStackNavigationProp } from '../navigation/AppNavigator';
import { contractsApi } from '../api/contracts';
import { attendanceApi } from '../api/attendance';
import { usersApi } from '../api/users';
import { popupsApi, Popup } from '../api/popups';
import AttendanceConfirmModal from '../components/modals/AttendanceConfirmModal';
import AttendanceSignatureModal from '../components/modals/AttendanceSignatureModal';
import AttendanceAbsenceModal from '../components/modals/AttendanceAbsenceModal';
import AttendanceDeleteModal from '../components/modals/AttendanceDeleteModal';
import ReservationChangeModal from '../components/modals/ReservationChangeModal';
import FirstTimeContractBonusModal from '../components/modals/FirstTimeContractBonusModal';
import RemotePopupModal from '../components/modals/RemotePopupModal';
import styled from 'styled-components/native';
import { RecentContract } from '../types/dashboard';
import { hasSeenFirstTimePopup, markFirstTimePopupAsShown } from '../utils/subscription';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 아이콘 이미지
const notificationBellIcon = require('../../assets/bell.png');
const dashboardStudentIcon = require('../../assets/p1.png');
const dashboardClassesIcon = require('../../assets/p2.png');
const dashboardUnprocessedIcon = require('../../assets/p3.png');
const dashboardSettlementIcon = require('../../assets/p4.png');
const recentContractIcon = require('../../assets/bbb2.png');
const guidanceEmptyIcon = require('../../assets/if1.png');
const calendarIcon = require('../../assets/cal.png');

interface TodayClass {
  id: number;
  subject: string;
  time: string | null;
  day_of_week?: string[] | null;
  attendance_requires_signature: boolean;
  hasAttendanceLog: boolean;
  attendanceLogId: number | null;
  student: {
    id: number;
    name: string;
    phone?: string;
  };
  billing_type: string;
  absence_policy: string;
  monthly_amount: number;
  isSubstitute?: boolean;
  originalOccurredAt?: string | null;
  policy_snapshot?: {
    total_sessions?: number;
    lesson_notes?: string;
    [key: string]: any;
  } | null;
  sessions_used?: number;
  amount_used?: number;
  reservation_id?: number | null;
  started_at?: string | null;
  ended_at?: string | null;
}

function HomeContent() {
  const homeNavigation = useNavigation<HomeStackNavigationProp>();
  const navigation = useNavigation<MainTabsNavigationProp>();
  const appNavigation = useNavigation<MainAppStackNavigationProp>();
  const didRequestRef = useRef(false);
  const todayClassesRequestedRef = useRef(false);
  const todayClassesInFlightRef = useRef(false);
  const [todayClasses, setTodayClasses] = useState<TodayClass[]>([]);
  const [todayClassesLoading, setTodayClassesLoading] = useState(false);
  const [showAllGuidanceStudents, setShowAllGuidanceStudents] = useState(false);
  const [showAllRecentContracts, setShowAllRecentContracts] = useState(false);
  const sendContract = useContractsStore((state) => state.sendContract);
  
  // 출석 모달 상태
  const [showAttendanceConfirmModal, setShowAttendanceConfirmModal] = useState(false);
  const [showAttendanceSignatureModal, setShowAttendanceSignatureModal] = useState(false);
  const [showAttendanceAbsenceModal, setShowAttendanceAbsenceModal] = useState(false);
  const [showDeleteAttendanceModal, setShowDeleteAttendanceModal] = useState(false);
  // 예약 변경 모달 상태
  const [showReservationChangeModal, setShowReservationChangeModal] = useState(false);
  const [selectedNewReservationDate, setSelectedNewReservationDate] = useState<Date | null>(null);
  const [selectedNewReservationHour, setSelectedNewReservationHour] = useState<number | null>(null);
  const [selectedNewReservationMinute, setSelectedNewReservationMinute] = useState<number | null>(null);
  const [reservationChangeSubmitting, setReservationChangeSubmitting] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const todaySectionYRef = useRef(0);
  const [selectedClassItem, setSelectedClassItem] = useState<TodayClass | null>(null);
  const [unprocessedCount, setUnprocessedCount] = useState<number>(0);
  const [showFirstTimeBonusModal, setShowFirstTimeBonusModal] = useState(false);
  const firstTimePopupCheckedRef = useRef(false);
  const [pressedCard, setPressedCard] = useState<string | null>(null);
  // 원격 팝업 상태
  const [currentPopup, setCurrentPopup] = useState<Popup | null>(null);
  const [showRemotePopup, setShowRemotePopup] = useState(false);
  const remotePopupCheckedRef = useRef(false);

  const user = useAuthStore((state) => state.user);
  const apiBaseUrl = useAuthStore((state) => state.apiBaseUrl);
  const accessToken = useAuthStore((state) => state.accessToken);
  const fetchDashboard = useDashboardStore((state) => state.fetchDashboard);
  const summary = useDashboardStore((state) => state.summary);
  const fetchInvoicesSections = useInvoicesStore((s) => s.fetchSections);
  const sections = useInvoicesStore((state) => state.sections);
  const fetchStudentDetail = useStudentsStore((state) => state.fetchStudentDetail);
  const status = useDashboardStore((state) => state.status);
  const errorMessage = useDashboardStore((state) => state.errorMessage);
  const loadedOnce = useDashboardStore((state) => state._loadedOnce);

  // persist rehydration 완료 확인
  // apiBaseUrl이 설정되어 있고, accessToken도 있으면 persist가 완료된 것으로 간주
  // 또는 apiBaseUrl이 기본값(env.API_URL)과 다르면 사용자가 설정한 값으로 간주
  const isPersistReady = useMemo(() => {
    // apiBaseUrl이 있고, localhost가 아니면 준비된 것으로 간주
    return apiBaseUrl && !apiBaseUrl.includes('localhost');
  }, [apiBaseUrl]);

  // persist 준비 완료 감지 및 대시보드/정산 데이터 로드
  React.useEffect(() => {
    if (!isPersistReady || didRequestRef.current || loadedOnce) return;
    didRequestRef.current = true;
    Promise.all([
      fetchDashboard().catch((err: any) => {
        console.error('[Dashboard] error initial', err?.message);
      }),
      fetchInvoicesSections(true).catch((err: any) => {
        const statusCode = err?.response?.status;
        if (statusCode === 401 || statusCode === 403) {
          console.warn('[Invoices] unauthorized, skipping error banner');
        } else {
        console.error('[Invoices] error initial', err?.message);
        }
      }),
    ]);
  }, [isPersistReady, loadedOnce, fetchDashboard, fetchInvoicesSections]);

  // 최초 접속 팝업 체크 (구독 여부와 상관없이 최초 접속자에게만 표시)
  React.useEffect(() => {
    if (!isPersistReady || firstTimePopupCheckedRef.current) return;
    
    const checkFirstTimePopup = async () => {
      firstTimePopupCheckedRef.current = true;
      
      // 최초 접속 팝업을 본 적이 없으면 표시 (구독 여부와 무관)
      const hasSeen = await hasSeenFirstTimePopup();
      if (!hasSeen) {
        setShowFirstTimeBonusModal(true);
        await markFirstTimePopupAsShown();
      }
    };
    
    checkFirstTimePopup();
  }, [isPersistReady]);

  // 원격 팝업 체크 (관리자 페이지에서 생성한 팝업)
  React.useEffect(() => {
    if (!isPersistReady || remotePopupCheckedRef.current) return;

    const checkRemotePopup = async () => {
      remotePopupCheckedRef.current = true;

      try {
        const activePopups = await popupsApi.findActive();
        
        if (activePopups.length > 0) {
          // 이미지가 있는 팝업만 필터링
          const popupsWithImage = activePopups.filter(popup => popup.image_url);
          
          if (popupsWithImage.length > 0) {
            // 가장 최근 팝업을 표시
            const latestPopup = popupsWithImage[0];
            
            // 오늘 날짜 키 생성 (YYYY-MM-DD 형식)
            const today = new Date().toISOString().split('T')[0];
            const dontShowTodayKey = `popup_dont_show_today_${latestPopup.id}_${today}`;
            
            // 오늘 하루 열지 않기 체크
            const dontShowToday = await AsyncStorage.getItem(dontShowTodayKey);
            
            if (!dontShowToday) {
              setCurrentPopup(latestPopup);
              setShowRemotePopup(true);
            }
          }
        }
      } catch (error: any) {
        console.error('[Home] error loading remote popup', error?.message);
      }
    };

    checkRemotePopup();
  }, [isPersistReady]);

  // persist 준비 완료 감지 및 오늘 수업 로드
  React.useEffect(() => {
    if (!isPersistReady || todayClassesRequestedRef.current || todayClassesInFlightRef.current) return;

    const loadTodayClasses = async () => {
      if (todayClassesInFlightRef.current) return;

      todayClassesInFlightRef.current = true;
      todayClassesRequestedRef.current = true;
      setTodayClassesLoading(true);

      try {
        const data = await contractsApi.getTodayClasses();
        setTodayClasses(Array.isArray(data) ? data : []);
      } catch (error: any) {
        console.error('[Home] error loading today classes', error?.message);
        setTodayClasses([]);
      } finally {
        setTodayClassesLoading(false);
        todayClassesInFlightRef.current = false;
      }
    };

    loadTodayClasses();
  }, [isPersistReady]);

  // 미처리 출결 개수 로드
  const loadUnprocessedCount = useCallback(async () => {
    try {
      const count = await attendanceApi.getUnprocessedCount();
      setUnprocessedCount(count);
    } catch (error: any) {
      console.error('[Home] error loading unprocessed count', error);
      setUnprocessedCount(0);
    }
  }, []);

  React.useEffect(() => {
    if (!isPersistReady) return;
    loadUnprocessedCount();
  }, [isPersistReady, loadUnprocessedCount]);

  // 탭 포커스 시 대시보드/정산/오늘 수업 재요청
  useFocusEffect(
    React.useCallback(() => {
      // 인증 상태 확인
      const { isAuthenticated, accessToken } = useAuthStore.getState();
      if (!isPersistReady || !isAuthenticated || !accessToken) return;
      
      // 홈 화면이 focus될 때마다 오늘 방문 목록 새로고침
      const refreshTodayClasses = async () => {
        try {
          setTodayClassesLoading(true);
          const data = await contractsApi.getTodayClasses();
          setTodayClasses(Array.isArray(data) ? data : []);
        } catch (error: any) {
          console.error('[Home] error refreshing today classes on focus', error?.message);
        } finally {
          setTodayClassesLoading(false);
        }
      };
      
      refreshTodayClasses();
      
      // 대시보드 갱신
      fetchDashboard().catch(() => {});
      // 정산 데이터 갱신
      fetchInvoicesSections(true).catch(() => {});
      // 오늘 수업 갱신
      (async () => {
        try {
          setTodayClassesLoading(true);
          const data = await contractsApi.getTodayClasses();
          setTodayClasses(Array.isArray(data) ? data : []);
        } catch (e) {
          setTodayClasses([]);
        } finally {
          setTodayClassesLoading(false);
        }
      })();
      // 미처리 출결 개수 갱신
      loadUnprocessedCount();
    }, [isPersistReady, fetchDashboard, fetchInvoicesSections, loadUnprocessedCount]),
  );

  const handleRetry = useCallback(async () => {
    try {
      await fetchDashboard({ force: true });
      Alert.alert('대시보드', '데이터를 다시 불러왔습니다.');
    } catch (error: any) {
      Alert.alert('대시보드', error?.message ?? '데이터를 불러오지 못했습니다.');
    }
  }, [fetchDashboard]);

  // occurred_at 생성: 오늘 날짜 + 계약서 time
  // 타임존 변환 없이 로컬 날짜를 유지하면서 ISO 형식으로 변환
  const createOccurredAt = useCallback((time: string | null | undefined): string => {
    const today = new Date();
    // time이 없으면 현재 시간 사용
    if (!time || !time.trim()) {
      // 타임존 오프셋 보정: 로컬 시각을 UTC 시각으로 변환하지 않고 그대로 유지
      const offset = today.getTimezoneOffset();
      const localTime = new Date(today.getTime() - offset * 60 * 1000);
      return localTime.toISOString();
    }
    const [hours, minutes] = time.split(':').map(Number);
    today.setHours(hours, minutes, 0, 0);
    // 타임존 오프셋 보정: 로컬 시각을 UTC 시각으로 변환하지 않고 그대로 유지
    const offset = today.getTimezoneOffset();
    const localTime = new Date(today.getTime() - offset * 60 * 1000);
    return localTime.toISOString();
  }, []);

  // 출석 기록 후 처리: 리스트에서 제거 및 새로고침
  const handleAttendanceRecorded = useCallback(async () => {
    // 오늘 수업 목록 새로고침
    try {
      setTodayClassesLoading(true);
      const data = await contractsApi.getTodayClasses();
      setTodayClasses(data);
      // 정산 데이터도 동시에 최신화 (당월 차감 실시간 반영)
      await fetchInvoicesSections(true);
      // 대시보드도 새로고침 (미청구 정산 학생 수 업데이트)
      await fetchDashboard({ force: true });
    } catch (error: any) {
      console.error('[Home] refresh today classes error', error);
    } finally {
      setTodayClassesLoading(false);
    }
  }, [fetchInvoicesSections, fetchDashboard]);

  // 출석 기록 API 호출
  const handleAttendancePresentSubmit = useCallback(async (signatureData?: string, amount?: number, memo?: string) => {
    if (!selectedClassItem) return;

    try {
      const occurredAt = createOccurredAt(selectedClassItem.time);
      const result = await attendanceApi.create({
        student_id: selectedClassItem.student.id,
        contract_id: selectedClassItem.id,
        occurred_at: occurredAt,
        status: 'present',
        signature_data: signatureData,
        amount: amount, // 금액권: 차감 금액, 횟수권: undefined (전달하지 않음)
        memo_public: memo, // 서비스 내용
      });
      
      // 사용처리 완료 안내 미리보기 화면으로 이동
      if (result?.id) {
        const studentPhone = selectedClassItem.student?.phone;
        homeNavigation.navigate('AttendanceView', {
          attendanceLogId: result.id,
          studentPhone: studentPhone || undefined,
        });
      } else {
        Alert.alert('완료', '이용권 사용처리가 완료되었습니다.');
      }
      
      // 목록 새로고침 (출석 로그 상태 업데이트)
      await handleAttendanceRecorded();
      // 해당 수강생의 상세 정보도 강제로 새로고침 (수강생 상세 화면 실시간 반영)
      if (selectedClassItem.student?.id) {
        await fetchStudentDetail(selectedClassItem.student.id, { force: true });
      }
    } catch (error: any) {
      console.error('[Home] attendance present error', error);
      Alert.alert('오류', error?.message || '출석 기록에 실패했습니다.');
    }
  }, [selectedClassItem, createOccurredAt, handleAttendanceRecorded, fetchStudentDetail]);

  // 예약 변경 API 호출
  const handleReservationChangeSubmit = useCallback(async () => {
    if (!selectedClassItem || !selectedClassItem.reservation_id || !selectedNewReservationDate) {
      Alert.alert('알림', '날짜를 선택해주세요.');
      return;
    }

    try {
      setReservationChangeSubmitting(true);
      const toIsoDate = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      const reservedTime = selectedNewReservationHour !== null && selectedNewReservationMinute !== null
        ? `${String(selectedNewReservationHour).padStart(2, '0')}:${String(selectedNewReservationMinute).padStart(2, '0')}`
        : selectedClassItem.time;

      await contractsApi.updateReservation(selectedClassItem.id, selectedClassItem.reservation_id, {
        reserved_date: toIsoDate(selectedNewReservationDate),
        reserved_time: reservedTime,
      });

      Alert.alert('완료', '예약이 변경되었습니다.');
      // 목록 새로고침
      await handleAttendanceRecorded();
      // 해당 수강생의 상세 정보도 강제로 새로고침
      if (selectedClassItem.student?.id) {
        await fetchStudentDetail(selectedClassItem.student.id, { force: true });
      }
      // 모달 닫기
      setShowReservationChangeModal(false);
      setSelectedClassItem(null);
      setSelectedNewReservationDate(null);
      setSelectedNewReservationHour(null);
      setSelectedNewReservationMinute(null);
    } catch (error: any) {
      console.error('[Home] reservation change error', error);
      const errorMessage = typeof error?.response?.data?.message === 'string' 
        ? error.response.data.message 
        : typeof error?.message === 'string'
        ? error.message
        : '예약 변경에 실패했습니다.';
      Alert.alert('오류', errorMessage);
    } finally {
      setReservationChangeSubmitting(false);
    }
  }, [selectedClassItem, selectedNewReservationDate, selectedNewReservationHour, selectedNewReservationMinute, handleAttendanceRecorded, fetchStudentDetail]);

  // 노쇼/대체 기록 API 호출
  const handleAttendanceAbsenceSubmit = useCallback(async (data: {
    status: 'vanish' | 'substitute'; // 소멸 = vanish, 대체 = substitute
    substitute_at?: string;
    reason: string;
    amount?: number | null; // 차감 금액 (금액권 소멸 시)
  }) => {
    if (!selectedClassItem) return;

    try {
      // 대체일 지정이고 reservation_id가 있으면 예약 변경 처리
      if (data.status === 'substitute' && data.substitute_at && selectedClassItem.reservation_id) {
        const substituteDate = new Date(data.substitute_at);
        const toIsoDate = (d: Date) => {
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        };

        // 시간은 기존 예약 시간 유지
        const reservedTime = selectedClassItem.time;

        await contractsApi.updateReservation(selectedClassItem.id, selectedClassItem.reservation_id, {
          reserved_date: toIsoDate(substituteDate),
          reserved_time: reservedTime,
        });

        Alert.alert('완료', '예약이 변경되었습니다.');
        // 목록 새로고침
        await handleAttendanceRecorded();
        // 해당 수강생의 상세 정보도 강제로 새로고침 (고객 상세 화면 캘린더 반영)
        if (selectedClassItem.student?.id) {
          await fetchStudentDetail(selectedClassItem.student.id, { force: true });
        }
        return;
      }

      // 노쇼 처리 또는 reservation_id가 없는 경우 출결 기록 생성
      const occurredAt = createOccurredAt(selectedClassItem.time);
      const result = await attendanceApi.create({
        student_id: selectedClassItem.student.id,
        contract_id: selectedClassItem.id,
        occurred_at: occurredAt,
        status: data.status,
        substitute_at: data.substitute_at,
        // 사유를 memo_public에 저장
        memo_public: data.reason,
        // 금액권 소멸 시 차감 금액 (입력하지 않으면 undefined)
        amount: data.amount ?? undefined,
      });
      
      // 소멸도 사용처리와 동일하게 미리보기/발송 플로우로 이동
      if (data.status === 'vanish' && result?.id) {
        const studentPhone = selectedClassItem.student?.phone;
        homeNavigation.navigate('AttendanceView', {
          attendanceLogId: result.id,
          studentPhone: studentPhone || undefined,
        });
      } else {
        Alert.alert('완료', `${data.status === 'vanish' ? '소멸' : '대체'}이 기록되었습니다.`);
      }
      // 목록/정산 새로고침 (출석 로그 상태 및 정산 반영)
      await handleAttendanceRecorded();
      // 해당 수강생의 상세 정보도 강제로 새로고침 (수강생 상세 화면 실시간 반영)
      if (selectedClassItem.student?.id) {
        await fetchStudentDetail(selectedClassItem.student.id, { force: true });
      }
    } catch (error: any) {
      console.error('[Home] attendance absence error', error);
      
      // 에러 메시지 추출 및 사용자 친화적 메시지로 변환
      let errorMessage = '기록에 실패했습니다.';
      
      // 백엔드에서 직접 오는 메시지 우선 확인
      const backendMessage = error?.response?.data?.message;
      if (typeof backendMessage === 'string') {
        errorMessage = backendMessage;
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
    }
  }, [selectedClassItem, createOccurredAt, handleAttendanceRecorded, fetchStudentDetail]);

  // 출석 처리
  const handleAttendancePresent = useCallback((classItem: TodayClass) => {
    setSelectedClassItem(classItem);
    // 출석: 서명 필요 여부 확인
    if (classItem.attendance_requires_signature) {
      setShowAttendanceSignatureModal(true);
    } else {
      setShowAttendanceConfirmModal(true);
    }
  }, []);

  // 변경 처리 (노쇼/대체일 지정 선택)
  const handleAttendanceAbsence = useCallback(async (classItem: TodayClass) => {
    setSelectedClassItem(classItem);
    
    // 마이페이지 기본값 설정 읽어오기
    let defaultAbsenceStatus: 'vanish' | 'substitute' | undefined;
    try {
      const user = await usersApi.getMe();
      const settings = (user.settings || {}) as Record<string, unknown>;
      if (settings.default_absence_policy) {
        // 'carry_over' -> 'substitute', 'vanish' -> 'vanish'
        const policy = settings.default_absence_policy as 'carry_over' | 'vanish';
        defaultAbsenceStatus = policy === 'carry_over' ? 'substitute' : 'vanish';
      }
    } catch (error) {
      console.error('[Home] Failed to load default absence policy', error);
    }
    
    // 기본값을 classItem에 저장하여 모달에 전달
    (classItem as any).defaultAbsenceStatus = defaultAbsenceStatus;
    
    // 항상 노쇼/대체일 지정 선택 모달 먼저 표시
    setShowAttendanceAbsenceModal(true);
  }, []);

  // 출결 기록 삭제 처리
  const handleDeleteAttendance = useCallback((classItem: TodayClass) => {
    setSelectedClassItem(classItem);
    setShowDeleteAttendanceModal(true);
  }, []);

  // 출결 기록 삭제 확인
  const handleDeleteAttendanceConfirm = useCallback(async () => {
    if (!selectedClassItem || !selectedClassItem.attendanceLogId) return;

    try {
      await attendanceApi.void(selectedClassItem.attendanceLogId, '홈 화면에서 삭제');
      Alert.alert('완료', '관리 기록이 삭제되었습니다.');
      // 목록 새로고침
      await handleAttendanceRecorded();
      // 해당 수강생의 상세 정보도 강제로 새로고침 (수강생 상세 화면 실시간 반영)
      if (selectedClassItem.student?.id) {
        await fetchStudentDetail(selectedClassItem.student.id, { force: true });
      }
      setShowDeleteAttendanceModal(false);
      setSelectedClassItem(null);
    } catch (error: any) {
      console.error('[Home] delete attendance error', error);
      Alert.alert('오류', error?.message || '관리 기록 삭제에 실패했습니다.');
    }
  }, [selectedClassItem, handleAttendanceRecorded, fetchStudentDetail]);

  const handleSettlementPress = useCallback(() => {
    navigation.navigate('Settlement');
  }, [navigation]);

  const handleNotificationPress = useCallback(() => {
    appNavigation.navigate('Notifications');
  }, [appNavigation]);

  const handleStudentPress = useCallback(
    (contract: { id: number; studentId: number | null }) => {
      if (!contract.studentId) {
        Alert.alert('오류', '학생 정보를 찾을 수 없습니다.');
        return;
      }
      // MainTabs의 Students 탭으로 이동 후 StudentDetail 화면으로 push
      // CommonActions.reset을 사용하여 Students 스택을 명시적으로 구성:
      // StudentsList를 먼저 push하고, 그 다음 StudentDetail을 push하여 뒤로가기 버튼이 정상 작동
      (navigation as any).dispatch(
        CommonActions.reset({
          index: 1,
          routes: [
            { name: 'Home' },
            {
              name: 'Students',
              state: {
                routes: [
                  { name: 'StudentsList' },
                  { name: 'StudentDetail', params: { studentId: contract.studentId } },
                ],
                index: 1,
              },
            },
          ],
        }),
      );
    },
    [navigation],
  );

  const handleTodaySectionLayout = useCallback((event: LayoutChangeEvent) => {
    todaySectionYRef.current = event.nativeEvent.layout.y;
  }, []);

  const handleScrollToToday = useCallback(() => {
    if (!scrollViewRef.current) return;
    const offset = Math.max(todaySectionYRef.current - 16, 0);
    scrollViewRef.current.scrollTo({ y: offset, animated: true });
  }, []);

  const handleStudentsShortcut = useCallback(() => {
    navigation.dispatch(
      CommonActions.navigate({
        name: 'Students',
        params: {
          screen: 'StudentsList',
        },
      }),
    );
  }, [navigation]);

  const handleUnprocessedShortcut = useCallback(() => {
    appNavigation.navigate('UnprocessedAttendance');
  }, [appNavigation]);

  // 추가 안내가 필요한 수강생: 연장 필요 조건 (백엔드에서 필터링된 결과 사용)
  const rawGuidanceContracts = useMemo(() => {
    // 백엔드에서 needsAttentionContracts를 제공하면 사용, 없으면 빈 배열
    return (summary as any)?.needsAttentionContracts ?? [];
  }, [summary]);
  const guidanceContracts = useMemo(() => {
    const seen = new Set<number>();
    return rawGuidanceContracts.filter((contract: RecentContract) => {
      if (!contract.studentId) {
        return false;
      }
      if (seen.has(contract.studentId)) {
        return false;
      }
      seen.add(contract.studentId);
      return true;
    });
  }, [rawGuidanceContracts]);
  const displayedGuidanceContracts = useMemo(
    () => (showAllGuidanceStudents ? guidanceContracts : guidanceContracts.slice(0, 3)),
    [guidanceContracts, showAllGuidanceStudents],
  );
  const hasMoreGuidanceStudents = useMemo(
    () => rawGuidanceContracts.length > 3 || guidanceContracts.length > 3,
    [guidanceContracts.length, rawGuidanceContracts.length],
  );

  const unsentInvoicesCount = useMemo(
    () => sections?.todayBilling?.length ?? 0,
    [sections?.todayBilling],
  );

  const handleToggleGuidance = useCallback(() => {
    setShowAllGuidanceStudents((prev) => !prev);
  }, []);

  React.useEffect(() => {
    if (!hasMoreGuidanceStudents && showAllGuidanceStudents) {
      setShowAllGuidanceStudents(false);
    }
  }, [hasMoreGuidanceStudents, showAllGuidanceStudents]);

  const getBillingTypeLabel = useCallback((type: string) => {
    if (type === 'prepaid') return '선불';
    if (type === 'postpaid') return '후불';
    return type;
  }, []);

  const getAbsencePolicyLabel = useCallback((policy: string, billingType?: string) => {
    if (policy === 'carry_over') return '대체';
    if (policy === 'deduct_next') return '차감';
    if (policy === 'vanish') return '소멸';
    return policy;
  }, []);

  const getContractTypeLabel = useCallback((billingType: string) => {
    if (billingType === 'sessions') return '횟수권';
    if (billingType === 'amount') return '선불권';
    return '알 수 없음';
  }, []);

  const handleSendContractClick = useCallback(
    (contractId: number) => {
      // 계약서 미리보기 화면으로 이동
      (navigation as any).navigate('Students', {
        screen: 'ContractView',
        params: { contractId },
      });
    },
    [navigation],
  );


  const getContractStatusLabel = useCallback((status: string | null | undefined) => {
    if (!status) return '알 수 없음';
    const map: Record<string, string> = {
      draft: '초안',
      confirmed: '확정',
      sent: '전송 완료',
    };
    return map[status] || status;
  }, []);

  const getContractStatusColor = useCallback((status: string | null | undefined) => {
    if (!status) return '#8e8e93';
    const map: Record<string, string> = {
      draft: '#8e8e93',
      confirmed: '#ff9500',
      sent: '#34c759',
    };
    return map[status] || '#8e8e93';
  }, []);

  const recentContracts: RecentContract[] = useMemo(() => {
    return summary?.recentContracts ?? [];
  }, [summary?.recentContracts]);

  const displayedRecentContracts = useMemo(
    () => (showAllRecentContracts ? recentContracts : recentContracts.slice(0, 2)),
    [recentContracts, showAllRecentContracts],
  );

  const hasMoreRecentContracts = recentContracts.length > 2;

  const handleToggleRecentContracts = useCallback(() => {
    setShowAllRecentContracts((prev) => !prev);
  }, []);

  if (status === 'loading' && !summary) {
    return (
      <Container>
        <LoadingContainer>
          <ActivityIndicator size="large" color="#1d42d8" />
          <LoadingText>대시보드를 불러오는 중이에요...</LoadingText>
        </LoadingContainer>
      </Container>
    );
  }

  if (status === 'error' && !summary) {
    return (
      <Container>
        <ErrorContainer>
          <ErrorTitle>대시보드를 불러오지 못했습니다.</ErrorTitle>
          <ErrorDescription>{errorMessage ?? '네트워크 연결을 확인해주세요.'}</ErrorDescription>
          <RetryButton onPress={handleRetry}>
            <RetryButtonText>다시 시도</RetryButtonText>
          </RetryButton>
        </ErrorContainer>
      </Container>
    );
  }

  return (
    <>
      <Container>
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 상단 헤더 및 대시보드 영역 */}
        <HeaderTopSection>
        {/* 상단 헤더: 로고, 알림 아이콘, 안내 텍스트 */}
        <HeaderSection>
          <HeaderTop>
            <HeaderTitle>패스북</HeaderTitle>
            <NotificationButton onPress={handleNotificationPress}>
              <NotificationIcon source={notificationBellIcon} tintColor="#B22222" />
            </NotificationButton>
          </HeaderTop>
          <HeaderSubtext>이용권 발행부터 사용처리 까지 고객 확인으로 분쟁없이 깔끔하게.</HeaderSubtext>
        </HeaderSection>

        {/* 에러 배너 */}
        {status === 'error' && summary ? (
          <ErrorBanner>
            <ErrorText>{errorMessage}</ErrorText>
            <InlineButton onPress={handleRetry}>
              <InlineButtonText>재시도</InlineButtonText>
            </InlineButton>
          </ErrorBanner>
        ) : null}

          {/* 대시보드 요약 카드 */}
          <DashboardCardSection>
          <DashboardCardGrid>
            <DashboardCard 
              onPress={handleStudentsShortcut} 
              activeOpacity={1.0}
              onPressIn={() => setPressedCard('students')}
              onPressOut={() => setPressedCard(null)}
              $pressed={pressedCard === 'students'}
            >
              <DashboardCardRow>
                <DashboardIconColumn>
                  <DashboardIconWrapper>
                    <DashboardIconImage source={dashboardStudentIcon} resizeMode="contain" />
                  </DashboardIconWrapper>
                </DashboardIconColumn>
                <DashboardTextBlock>
                  <DashboardLabel numberOfLines={1}>이용권 고객</DashboardLabel>
                  <DashboardValue numberOfLines={1}>
                    {(summary?.studentsCount ?? 0).toLocaleString()}명
                  </DashboardValue>
                </DashboardTextBlock>
              </DashboardCardRow>
            </DashboardCard>

            <DashboardCard 
              onPress={handleScrollToToday} 
              activeOpacity={1.0}
              onPressIn={() => setPressedCard('today')}
              onPressOut={() => setPressedCard(null)}
              $pressed={pressedCard === 'today'}
            >
              <DashboardCardRow>
                <DashboardIconColumn>
                  <DashboardIconWrapper>
                    <DashboardIconImage source={dashboardClassesIcon} resizeMode="contain" />
                  </DashboardIconWrapper>
                </DashboardIconColumn>
                <DashboardTextBlock>
                  <DashboardLabel numberOfLines={1}>오늘방문</DashboardLabel>
                  <DashboardValue numberOfLines={1}>{todayClasses.length.toLocaleString()}건</DashboardValue>
                </DashboardTextBlock>
              </DashboardCardRow>
            </DashboardCard>

            <DashboardCard 
              onPress={handleUnprocessedShortcut} 
              activeOpacity={1.0}
              onPressIn={() => setPressedCard('unprocessed')}
              onPressOut={() => setPressedCard(null)}
              $pressed={pressedCard === 'unprocessed'}
            >
              <DashboardCardRow>
                <DashboardIconColumn>
                  <DashboardIconWrapper>
                    <DashboardIconImage source={dashboardUnprocessedIcon} resizeMode="contain" />
                  </DashboardIconWrapper>
                </DashboardIconColumn>
                <DashboardTextBlock>
                  <DashboardLabel numberOfLines={1}>미처리 내역</DashboardLabel>
                  <DashboardValue numberOfLines={1}>{unprocessedCount.toLocaleString()}건</DashboardValue>
                </DashboardTextBlock>
              </DashboardCardRow>
            </DashboardCard>

            <DashboardCard 
              onPress={handleSettlementPress} 
              activeOpacity={1.0}
              onPressIn={() => setPressedCard('settlement')}
              onPressOut={() => setPressedCard(null)}
              $pressed={pressedCard === 'settlement'}
            >
              <DashboardCardRow>
                <DashboardIconColumn>
                  <DashboardIconWrapper>
                    <DashboardIconImage source={dashboardSettlementIcon} resizeMode="contain" />
                  </DashboardIconWrapper>
                </DashboardIconColumn>
                <DashboardTextBlock>
                  <DashboardLabel numberOfLines={1}>청구 미전송</DashboardLabel>
                  <DashboardValue numberOfLines={1}>{unsentInvoicesCount.toLocaleString()}명</DashboardValue>
                </DashboardTextBlock>
              </DashboardCardRow>
            </DashboardCard>
          </DashboardCardGrid>
          </DashboardCardSection>
        </HeaderTopSection>

        {/* 1. 오늘 방문 예정인 고객 섹션 */}
        <Section style={{ borderTopWidth: 0, paddingTop: 0 }} onLayout={handleTodaySectionLayout}>
          <SectionHeader>
            <SectionTitle>오늘 방문 예정인 고객</SectionTitle>
          </SectionHeader>
          {todayClassesLoading ? (
            <SkeletonContainer>
              {Array.from({ length: 3 }).map((_, index) => (
                <SkeletonClassCard key={index}>
                  <SkeletonClassCardRow1>
                    <SkeletonClassCardName />
                    <SkeletonClassCardAmount />
                  </SkeletonClassCardRow1>
                  <SkeletonClassCardRow2 />
                  <SkeletonClassCardRow3>
                    <SkeletonClassCardRemaining />
                    <SkeletonClassCardTime />
                  </SkeletonClassCardRow3>
                  <SkeletonClassCardButtons>
                    <SkeletonButton />
                    <SkeletonButton />
                  </SkeletonClassCardButtons>
                </SkeletonClassCard>
              ))}
            </SkeletonContainer>
          ) : todayClasses.length === 0 ? (
            <EmptyStateContainer>
              <EmptyStateIcon source={dashboardClassesIcon} resizeMode="contain" />
              <EmptyStateText>오늘 방문 예정인 고객이 없습니다.</EmptyStateText>
            </EmptyStateContainer>
          ) : (
            <ListContainer>
              {todayClasses.map((classItem) => {
                // 계약 타입 판단: totalSessions만으로 판단 (ended_at은 표시용일 뿐, 판별에 사용하지 않음)
                // 뷰티앱: 금액권과 횟수권 모두 선불 횟수 계약 로직 사용
                const snapshot = classItem.policy_snapshot || {};
                const totalSessions = typeof snapshot.total_sessions === 'number' ? snapshot.total_sessions : 0;
                // 횟수권: totalSessions > 0
                // 금액권: totalSessions === 0
                const contractType = totalSessions > 0 ? 'sessions' : 'amount';
                const contractTypeLabel = getContractTypeLabel(contractType === 'sessions' ? 'sessions' : 'amount');
                const absencePolicyLabel = getAbsencePolicyLabel(classItem.absence_policy, classItem.billing_type);
                const amount = classItem.monthly_amount ? `${classItem.monthly_amount.toLocaleString()}원` : '';
                // 출결 여부: 백엔드 hasAttendanceLog 값이 없거나 잘못된 경우를 대비해 attendanceLogId도 함께 체크
                const hasLog = !!classItem.hasAttendanceLog || !!classItem.attendanceLogId;
                
                // 이용권 내용 (policy_snapshot.lesson_notes)
                const lessonNotes = snapshot.lesson_notes && typeof snapshot.lesson_notes === 'string' 
                  ? snapshot.lesson_notes 
                  : null;
                
                // 잔여 정보 계산
                const sessionsUsed = classItem.sessions_used ?? 0;
                const remainingSessions = totalSessions > 0 ? Math.max(totalSessions - sessionsUsed, 0) : null;
                
                // 금액권의 총금액/잔여금액 계산
                const totalAmount = classItem.monthly_amount ?? 0;
                const amountUsed = classItem.amount_used ?? 0;
                const remainingAmount = contractType === 'amount' ? Math.max(totalAmount - amountUsed, 0) : null; // ended_at은 표시용일 뿐, 판별에 사용하지 않음
                
                // 시간 포맷팅
                const formatTime = (time: string | null | undefined): string => {
                  if (!time) return '-';
                  return time;
                };
                
                // 유효기간 포맷팅
                const formatDateRange = (startDate: string | null | undefined, endDate: string | null | undefined) => {
                  if (!startDate || !endDate) return null;
                  const start = new Date(startDate);
                  const end = new Date(endDate);
                  const startYear = String(start.getFullYear()).slice(-2); // 뒤 2자리만
                  const startMonth = String(start.getMonth() + 1).padStart(2, '0');
                  const startDay = String(start.getDate()).padStart(2, '0');
                  const endYear = String(end.getFullYear()).slice(-2); // 뒤 2자리만
                  const endMonth = String(end.getMonth() + 1).padStart(2, '0');
                  const endDay = String(end.getDate()).padStart(2, '0');
                  return `${startYear}.${startMonth}.${startDay} ~ ${endYear}.${endMonth}.${endDay}`;
                };

                return (
                  <ClassCard key={classItem.id}>
                    <ClassInfo>
                      {/* 1줄: 이름 + 계약타입뱃지 + 조건뱃지 + 금액 */}
                      <ClassCardRow1>
                        <ClassCardNameContainer>
                          <ClassCardName>{classItem.student?.name || '알 수 없음'}</ClassCardName>
                          <ClassBadgeContainer>
                            <ClassBadge contractType contractTypeValue={contractType}>
                              <ClassBadgeText contractType contractTypeValue={contractType}>{contractTypeLabel}</ClassBadgeText>
                            </ClassBadge>
                            {absencePolicyLabel && absencePolicyLabel !== '차감' && (
                              <ClassBadge absencePolicy absencePolicyValue={classItem.absence_policy}>
                                <ClassBadgeText absencePolicy absencePolicyValue={classItem.absence_policy}>{absencePolicyLabel}</ClassBadgeText>
                              </ClassBadge>
                            )}
                          </ClassBadgeContainer>
                        </ClassCardNameContainer>
                        <ClassAmountContainer>
                          {amount ? <ClassAmountText>{amount}</ClassAmountText> : null}
                        </ClassAmountContainer>
                      </ClassCardRow1>

                      {/* 2줄: 이용권명 (이용권 내용) */}
                      {classItem.subject && (
                        <ClassCardRow2Container>
                          <ClassCardRow2Subject>
                            {classItem.subject}
                            {lessonNotes ? ` (${lessonNotes})` : ''}
                          </ClassCardRow2Subject>
                        </ClassCardRow2Container>
                      )}

                      {/* 3줄: 잔여정보(좌측) + 시간(우측) */}
                      <ClassCardRow3Container>
                        <ClassCardRow3Left>
                          {contractType === 'sessions' && totalSessions > 0 && typeof remainingSessions === 'number' ? (
                            <ClassExtendNoteContainer>
                              <ClassExtendNote>
                                <ClassExtendNoteTotal>총{totalSessions}회</ClassExtendNoteTotal>
                                {' / '}
                                <ClassExtendNoteRemaining>잔여{remainingSessions}회</ClassExtendNoteRemaining>
                              </ClassExtendNote>
                            </ClassExtendNoteContainer>
                          ) : contractType === 'amount' && typeof remainingAmount === 'number' ? (
                            <ClassExtendNoteContainer>
                              <ClassExtendNote>
                                <ClassExtendNoteTotal>총{totalAmount.toLocaleString()}원</ClassExtendNoteTotal>
                                {' / '}
                                <ClassExtendNoteRemaining>잔여{remainingAmount.toLocaleString()}원</ClassExtendNoteRemaining>
                              </ClassExtendNote>
                            </ClassExtendNoteContainer>
                          ) : null}
                        </ClassCardRow3Left>
                        <ClassCardRow3Right>
                          <ClassTimeText>{formatTime(classItem.time)}</ClassTimeText>
                        </ClassCardRow3Right>
                      </ClassCardRow3Container>

                      {/* 4줄: 유효기간 (표시용만) */}
                      {classItem.started_at && classItem.ended_at && (
                        <ClassCardRow4>
                          <ClassValidPeriod>
                            유효기간: {formatDateRange(classItem.started_at, classItem.ended_at)}
                          </ClassValidPeriod>
                        </ClassCardRow4>
                      )}
                    </ClassInfo>
                    <EditButton
                      onPress={() => handleDeleteAttendance(classItem)}
                      disabled={!hasLog}
                    >
                      <EditButtonText disabled={!hasLog}>
                        수정
                      </EditButtonText>
                    </EditButton>
                    <AttendanceButtonsRow>
                      <AttendanceBottomButton
                            onPress={() => handleAttendancePresent(classItem)}
                            variant="present"
                            disabled={hasLog}
                          >
                        <AttendanceBottomButtonText variant="present" disabled={hasLog}>
                              사용처리
                        </AttendanceBottomButtonText>
                      </AttendanceBottomButton>
                      <AttendanceDivider />
                      <AttendanceBottomButton
                            onPress={() => handleAttendanceAbsence(classItem)}
                            variant="absent"
                            disabled={hasLog}
                          >
                        <AttendanceBottomButtonText variant="absent" disabled={hasLog}>
                              노쇼처리
                        </AttendanceBottomButtonText>
                      </AttendanceBottomButton>
                    </AttendanceButtonsRow>
                  </ClassCard>
                );
              })}
            </ListContainer>
          )}
        </Section>

        {/* 전체 일정 카드 섹션 */}
        <Section>
          <AllSchedulesCard onPress={() => homeNavigation.navigate('AllSchedules')}>
            <AllSchedulesCardIcon source={calendarIcon} resizeMode="contain" />
            <AllSchedulesCardContent>
              <AllSchedulesCardTitle>Schedule Note</AllSchedulesCardTitle>
              <AllSchedulesCardSubtitle>전체 예약 일정과 처리 내역을 확인하세요.</AllSchedulesCardSubtitle>
            </AllSchedulesCardContent>
            <AllSchedulesCardArrow>›</AllSchedulesCardArrow>
          </AllSchedulesCard>
        </Section>

        {/* 2. 이번 달 신규 계약 섹션 */}
          <Section>
            <SectionHeader>
            <SectionHeaderLeft>
              <SectionTitle>신규 계약</SectionTitle>
              {recentContracts.length > 0 && (
              <Badge>
                <BadgeText>{recentContracts.length}</BadgeText>
              </Badge>
              )}
            </SectionHeaderLeft>
            {hasMoreRecentContracts && (
              <ShowMoreButtonInline onPress={handleToggleRecentContracts}>
                <ShowMoreButtonText>{showAllRecentContracts ? '접기' : '전체 보기'}</ShowMoreButtonText>
              </ShowMoreButtonInline>
            )}
            </SectionHeader>
          {recentContracts.length === 0 ? (
            <EmptyStateContainer>
              <EmptyStateIcon source={recentContractIcon} resizeMode="contain" />
              <EmptyStateText>이번 달 신규 계약이 없습니다.</EmptyStateText>
            </EmptyStateContainer>
          ) : (
            <ListContainer>
              {displayedRecentContracts.map((contract) => {
                const isConfirmed = contract.status === 'confirmed';
                const isSent = contract.status === 'sent';
                const showSendButton = isConfirmed && !isSent;

                return (
                  <RecentContractItem 
                    key={contract.id}
                    onPress={() => {
                      // Students 탭으로 먼저 이동한 다음 ContractView로 이동
                      (navigation as any).navigate('Students', {
                        screen: 'ContractView',
                        params: { contractId: contract.id },
                      });
                    }}
                  >
                    <RecentContractContent>
                      <RecentContractTitle>{contract.studentName || '학생 정보 없음'}</RecentContractTitle>
                      <RecentContractMeta>{contract.subject}</RecentContractMeta>
                    </RecentContractContent>
                    {showSendButton ? (
                      <RecentContractSendButton
                        onPress={() => handleSendContractClick(contract.id)}
                        disabled={false}
                      >
                        <RecentContractSendButtonText>전송</RecentContractSendButtonText>
                      </RecentContractSendButton>
                    ) : isSent ? (
                      <RecentContractStatusBadge $color={getContractStatusColor(contract.status)}>
                        <RecentContractStatusText $color={getContractStatusColor(contract.status)}>
                          전송 완료
                        </RecentContractStatusText>
                      </RecentContractStatusBadge>
                    ) : null}
                  </RecentContractItem>
                );
              })}
            </ListContainer>
        )}
        </Section>

        {/* 3. 연장 안내가 필요한 고객 섹션 */}
        <Section>
          <SectionHeader>
            <SectionHeaderLeft>
            <SectionTitle>연장 안내가 필요한 고객</SectionTitle>
            {guidanceContracts.length > 0 && (
              <Badge>
                <BadgeText>{guidanceContracts.length}</BadgeText>
              </Badge>
            )}
            </SectionHeaderLeft>
          </SectionHeader>
          {!summary || guidanceContracts.length === 0 ? (
            <EmptyStateContainer>
              <EmptyStateIcon source={guidanceEmptyIcon} resizeMode="contain" />
              <EmptyStateText>연장 안내가 필요한 고객이 없습니다.</EmptyStateText>
            </EmptyStateContainer>
          ) : (
            <ListContainer>
              {displayedGuidanceContracts.map((contract: RecentContract) => (
                <StudentItem key={contract.id}>
                  <StudentItemContent>
                    <StudentItemName>{contract.studentName}</StudentItemName>
                    <StudentItemMeta>계약연장필요</StudentItemMeta>
                  </StudentItemContent>
                  <StudentItemButton onPress={() => handleStudentPress(contract)}>
                    <StudentItemButtonText>보기</StudentItemButtonText>
                  </StudentItemButton>
                </StudentItem>
              ))}
              {hasMoreGuidanceStudents ? (
                <ShowMoreButton onPress={handleToggleGuidance}>
                  <ShowMoreButtonText>{showAllGuidanceStudents ? '접기' : '전체 보기'}</ShowMoreButtonText>
                </ShowMoreButton>
              ) : null}
            </ListContainer>
          )}
        </Section>

      </ScrollView>
      </Container>


      {/* 출석 확인 모달 (서명 없음) */}
      {selectedClassItem && (
        <AttendanceConfirmModal
          visible={showAttendanceConfirmModal}
          onClose={() => {
            setShowAttendanceConfirmModal(false);
            setSelectedClassItem(null);
          }}
          onConfirm={() => {
            handleAttendancePresentSubmit();
            setShowAttendanceConfirmModal(false);
            setSelectedClassItem(null);
          }}
          studentName={selectedClassItem.student.name}
        />
      )}

      {/* 사용 서명 모달 */}
      {selectedClassItem && (() => {
        // 계약 타입 판단
        // 뷰티앱: 금액권과 횟수권 모두 선불 횟수 계약 로직 사용
        const snapshot = selectedClassItem.policy_snapshot || {};
        const totalSessions = typeof snapshot.total_sessions === 'number' ? snapshot.total_sessions : 0;
        // 횟수권: totalSessions > 0 (ended_at은 표시용/예약 범위 체크용일 뿐, 판별에 사용하지 않음)
        // 금액권: totalSessions === 0 (ended_at은 표시용/예약 범위 체크용일 뿐, 판별에 사용하지 않음)
        const contractType = totalSessions > 0 ? 'sessions' : 'amount';
        
        return (
          <AttendanceSignatureModal
            visible={showAttendanceSignatureModal}
            onClose={() => {
              setShowAttendanceSignatureModal(false);
              setSelectedClassItem(null);
            }}
            onConfirm={async (signature: string, amount?: number, memo?: string) => {
              await handleAttendancePresentSubmit(signature, amount, memo);
              setShowAttendanceSignatureModal(false);
              setSelectedClassItem(null);
            }}
            studentName={selectedClassItem.student.name}
            contractType={contractType}
            remainingAmount={contractType === 'amount' ? (() => {
              const totalAmount = selectedClassItem.monthly_amount ?? 0;
              const amountUsed = selectedClassItem.amount_used ?? 0;
              return Math.max(totalAmount - amountUsed, 0);
            })() : undefined}
          />
        );
      })()}

      {/* 노쇼/대체일 지정 모달 */}
      {selectedClassItem && (() => {
        // 계약 타입 판단
        // 뷰티앱: 금액권과 횟수권 모두 선불 횟수 계약 로직 사용
        const snapshot = selectedClassItem.policy_snapshot || {};
        const totalSessions = typeof snapshot.total_sessions === 'number' ? snapshot.total_sessions : 0;
        // 횟수권: totalSessions > 0 (ended_at은 표시용/예약 범위 체크용일 뿐, 판별에 사용하지 않음)
        // 금액권: totalSessions === 0 (ended_at은 표시용/예약 범위 체크용일 뿐, 판별에 사용하지 않음)
        const contractType = totalSessions > 0 ? 'sessions' : 'amount';
        const isAmountBased = contractType === 'amount';
        const remainingAmount = isAmountBased ? (() => {
          const totalAmount = selectedClassItem.monthly_amount ?? 0;
          const amountUsed = selectedClassItem.amount_used ?? 0;
          return Math.max(totalAmount - amountUsed, 0);
        })() : undefined;

        return (
          <AttendanceAbsenceModal
            visible={showAttendanceAbsenceModal}
            onClose={() => {
              setShowAttendanceAbsenceModal(false);
              setSelectedClassItem(null);
            }}
            onConfirm={(data) => {
              handleAttendanceAbsenceSubmit(data);
              setShowAttendanceAbsenceModal(false);
              setSelectedClassItem(null);
            }}
            studentName={selectedClassItem.student.name}
            initialStatus={(selectedClassItem as any).defaultAbsenceStatus}
            isAmountBased={isAmountBased}
            remainingAmount={remainingAmount}
          />
        );
      })()}

      {/* 출결 기록 삭제 모달 */}
      {selectedClassItem && (
        <AttendanceDeleteModal
          visible={showDeleteAttendanceModal}
          onClose={() => {
            setShowDeleteAttendanceModal(false);
            setSelectedClassItem(null);
          }}
          onConfirm={handleDeleteAttendanceConfirm}
          studentName={selectedClassItem.student.name}
        />
      )}

      {/* 최초 접속 이용권 생성 무료구독 연장 이벤트 팝업 */}
      <FirstTimeContractBonusModal
        visible={showFirstTimeBonusModal}
        onClose={() => setShowFirstTimeBonusModal(false)}
        onExtend={() => {
          // 최초 접속 팝업 경로: isFirstTimeBonus: true로 90일 적용 경로임을 표시
          navigation.navigate('Settings', { showSubscriptionIntro: true, isFirstTimeBonus: true });
        }}
      />

      {/* 관리자 페이지에서 생성한 원격 팝업 */}
      <RemotePopupModal
        visible={showRemotePopup}
        popup={currentPopup}
        onClose={() => {
          setShowRemotePopup(false);
          setCurrentPopup(null);
        }}
        onDontShowToday={async () => {
          if (currentPopup) {
            // 오늘 날짜 키 생성 (YYYY-MM-DD 형식)
            const today = new Date().toISOString().split('T')[0];
            const dontShowTodayKey = `popup_dont_show_today_${currentPopup.id}_${today}`;
            // 오늘 하루 열지 않기로 표시
            await AsyncStorage.setItem(dontShowTodayKey, 'true');
          }
          setShowRemotePopup(false);
          setCurrentPopup(null);
        }}
      />
    </>
  );
}

export default function HomeScreen() {
  return <HomeContent />;
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
});

const Container = styled.View`
  flex: 1;
  background-color: #f5f5f5;
  z-index: 0;
`;

const LoadingContainer = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
`;

const LoadingText = styled.Text`
  font-size: 14px;
  color: #444;
  margin-top: 8px;
`;

const ErrorContainer = styled.View`
  flex: 1;
  justify-content: center;
  padding: 24px;
  gap: 16px;
`;

const ErrorTitle = styled.Text`
  font-size: 18px;
  font-weight: 700;
  color: #a94442;
`;

const ErrorDescription = styled.Text`
  font-size: 14px;
  color: #555;
`;

const RetryButton = styled.TouchableOpacity`
  padding: 12px 24px;
  background-color: #ff6b00;
  border-radius: 8px;
  align-self: flex-start;
`;

const RetryButtonText = styled.Text`
  color: #ffffff;
  font-size: 16px;
  font-weight: 600;
`;

const HeaderTopSection = styled.View`
  background-color: #303643;
  padding: 20px 16px 24px 16px;
  margin: -16px -16px 20px -16px;
`;

const HeaderSection = styled.View`
  margin-bottom: 20px;
`;

const HeaderTop = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
`;

const HeaderTitle = styled.Text`
  font-size: 24px;
  font-weight: 700;
  color: #ffffff;
  flex: 1;
`;

const NotificationButton = styled.TouchableOpacity`
  padding: 4px;
`;

const NotificationIcon = styled.Image`
  width: 22px;
  height: 22px;
`;

const HeaderSubtext = styled.Text`
  font-size: 14px;
  color: #ffffff;
`;

const ErrorBanner = styled.View`
  background-color: #fff7f7;
  border-radius: 12px;
  padding: 12px 16px;
  margin-bottom: 16px;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const ErrorText = styled.Text`
  font-size: 14px;
  color: #a94442;
  flex: 1;
`;

const InlineButton = styled.TouchableOpacity`
  padding: 6px 12px;
  background-color: #ff6b00;
  border-radius: 6px;
`;

const InlineButtonText = styled.Text`
  color: #ffffff;
  font-size: 13px;
  font-weight: 600;
`;

const Section = styled.View`
  background-color: transparent;
  border-radius: 12px;
  padding: 0;
  margin-bottom: 16px;
  padding-top: 16px;
  border-top-width: 1px;
  border-top-color: #e0e0e0;
`;

const SectionHeader = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding: 0;
`;

const SectionHeaderLeft = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 8px;
`;

const SectionTitle = styled.Text`
  font-size: 18px;
  font-weight: 700;
  color: #111;
`;

const Badge = styled.View`
  background-color: #c7d2fe;
  border-radius: 12px;
  padding: 3px 8px;
  align-items: center;
  justify-content: center;
`;

const BadgeText = styled.Text`
  color: #1d42d8;
  font-size: 12px;
  font-weight: 600;
`;

const EmptyDescription = styled.Text`
  font-size: 14px;
  color: #666;
  padding: 8px 0;
`;

const EmptyStateContainer = styled.View`
  min-height: 160px;
  justify-content: center;
  align-items: center;
  padding: 40px 20px;
`;

const EmptyStateIcon = styled.Image`
  width: 64px;
  height: 64px;
  opacity: 0.5;
  margin-bottom: 16px;
`;

const EmptyStateText = styled.Text`
  font-size: 14px;
  color: #8e8e93;
  text-align: center;
`;

const ListContainer = styled.View`
  gap: 12px;
  padding: 0;
`;

const ClassCard = styled.View`
  background-color: #ffffff;
  border-radius: 8px;
  padding: 12px;
  flex-direction: column;
  margin-bottom: 8px;
  margin-left: 0;
  margin-right: 0;
  position: relative;
  overflow: visible;
  width: 100%;
`;

const ClassInfo = styled.View`
  gap: 8px;
  padding-right: 60px;
  margin-bottom: 4px;
  width: 100%;
`;

// 1줄: 이름 + 뱃지 + 금액
const ClassCardRow1 = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 4px;
`;

const ClassCardNameContainer = styled.View`
  flex: 1;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

const ClassCardName = styled.Text`
  font-size: 18px;
  font-weight: 700;
  color: #111;
`;

const ClassBadgeContainer = styled.View`
  flex-direction: row;
  gap: 6px;
`;

const ClassBadge = styled.View<{ contractType?: boolean; absencePolicy?: boolean; contractTypeValue?: 'sessions' | 'amount'; absencePolicyValue?: string }>`
  padding: 4px 8px;
  background-color: ${(props: { contractType?: boolean; absencePolicy?: boolean; contractTypeValue?: 'sessions' | 'amount'; absencePolicyValue?: string }) => {
    if (props.contractType) {
      // 선불권: 블루 배경, 횟수권: 빨강 배경
      return props.contractTypeValue === 'amount' ? '#e8f2ff' : '#ffe5e5';
    }
    if (props.absencePolicy) {
      // 대체: 퍼플 배경, 소멸: 초록 배경
      return props.absencePolicyValue === 'carry_over' ? '#f3e8ff' : '#f0f8f0';
    }
    return '#e8f2ff';
  }};
  border-radius: 12px;
`;

const ClassBadgeText = styled.Text<{ contractType?: boolean; absencePolicy?: boolean; contractTypeValue?: 'sessions' | 'amount'; absencePolicyValue?: string }>`
  font-size: 11px;
  color: ${(props: { contractType?: boolean; absencePolicy?: boolean; contractTypeValue?: 'sessions' | 'amount'; absencePolicyValue?: string }) => {
    if (props.contractType) {
      // 선불권: 블루 텍스트, 횟수권: 빨강 텍스트
      return props.contractTypeValue === 'amount' ? '#246bfd' : '#ff3b30';
    }
    if (props.absencePolicy) {
      // 대체: 퍼플 텍스트, 소멸: 초록 텍스트
      return props.absencePolicyValue === 'carry_over' ? '#8b5cf6' : '#34c759';
    }
    return '#246bfd';
  }};
  font-weight: 600;
`;

const ClassAmountContainer = styled.View`
  align-items: flex-end;
  min-width: 80px;
`;

const ClassAmountText = styled.Text`
  font-size: 16px;
  font-weight: 700;
  color: #111;
`;

// 2줄: 이용권명 (이용권 내용)
const ClassCardRow2Container = styled.View`
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 4px;
`;

const ClassCardRow2Subject = styled.Text`
  font-size: 14px;
  color: #0f1b4d;
  font-weight: 500;
`;

// 3줄: 잔여정보 + 우측 계약금액
const ClassCardRow3Container = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
`;

const ClassCardRow3Left = styled.View`
  flex: 1;
  justify-content: flex-start;
  flex-shrink: 1;
  margin-right: 8px;
`;

const ClassCardRow3Right = styled.View`
  align-items: flex-end;
  min-width: 60px;
  flex-shrink: 0;
`;

const ClassTimeText = styled.Text`
  font-size: 14px;
  font-weight: 600;
  color: #FFD700;
`;

const ClassExtendNoteContainer = styled.View`
  flex-direction: row;
  flex-shrink: 1;
  flex-wrap: nowrap;
`;

const ClassExtendNote = styled.Text`
  font-size: 13px;
  color: #4a4a4a;
`;

const ClassExtendNoteTotal = styled.Text`
  color: #ff3b30;
  font-weight: 600;
`;

const ClassExtendNoteRemaining = styled.Text`
  color: #ff9500;
  font-weight: 600;
`;

// 4줄(금액권만): 유효기간
const ClassCardRow4 = styled.View`
  margin-top: 2px;
`;

const ClassValidPeriod = styled.Text`
  font-size: 13px;
  color: #666;
`;

const EditButton = styled.TouchableOpacity<{ disabled?: boolean }>`
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 0;
  opacity: ${({ disabled }: { disabled?: boolean }) => (disabled ? 0.5 : 1)};
`;

const EditButtonText = styled.Text<{ disabled?: boolean }>`
  font-size: 14px;
  font-weight: 700;
  color: ${({ disabled }: { disabled?: boolean }) => (disabled ? '#999' : '#ff3b30')};
  text-decoration-line: underline;
`;

const AttendanceButtonsRow = styled.View`
  flex-direction: row;
  border-top-width: 1px;
  border-top-color: #e0e0e0;
  margin-top: 4px;
  padding-top: 4px;
`;

const AttendanceBottomButton = styled.TouchableOpacity<{ variant: 'present' | 'absent'; disabled?: boolean }>`
  flex: 1;
  padding: 12px 8px;
  align-items: center;
  justify-content: center;
  background-color: ${({ disabled }: { disabled?: boolean }) => (disabled ? '#f5f5f5' : '#f8f9fa')};
  border-radius: 8px;
  min-height: 44px;
  opacity: ${({ disabled }: { disabled?: boolean }) => (disabled ? 0.6 : 1)};
`;

const AttendanceBottomButtonText = styled.Text<{ variant: 'present' | 'absent'; disabled?: boolean }>`
  font-size: 14px;
  font-weight: 700;
  color: ${({ disabled, variant }: { disabled?: boolean; variant: 'present' | 'absent' }) => {
    if (disabled) return '#999';
    return variant === 'present' ? '#246bfd' : '#ff6b00';
  }};
`;

const AttendanceDivider = styled.View`
  width: 1px;
  background-color: #e0e0e0;
`;

const StudentItem = styled.View`
  flex-direction: row;
  align-items: center;
  padding: 12px;
  background-color: #ffffff;
  border-radius: 8px;
  border-width: 1px;
  border-color: #e0e4ff;
  margin-bottom: 8px;
`;

const StudentItemContent = styled.View`
  flex: 1;
`;

const StudentItemName = styled.Text`
  font-size: 15px;
  font-weight: 600;
  color: #111;
  margin-bottom: 4px;
`;

const StudentItemMeta = styled.Text`
  font-size: 13px;
  color: #666;
`;

const StudentItemButton = styled.TouchableOpacity`
  padding: 6px 12px;
  background-color: #1d42d8;
  border-radius: 6px;
`;

const StudentItemButtonText = styled.Text`
  color: #ffffff;
  font-size: 13px;
  font-weight: 600;
`;

const RecentContractItem = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  padding: 12px;
  background-color: #ffffff;
  border-radius: 8px;
  margin-bottom: 8px;
  border-width: 1px;
  border-color: #e0e4ff;
`;

const RecentContractContent = styled.View`
  flex: 1;
`;

const RecentContractTitle = styled.Text`
  font-size: 15px;
  font-weight: 600;
  color: #111;
  margin-bottom: 4px;
`;

const RecentContractMeta = styled.Text`
  font-size: 13px;
  color: #666;
`;

const RecentContractStatusBadge = styled.View<{ $color: string }>`
  padding: 6px 12px;
  background-color: ${({ $color }: { $color: string }) => `${$color}15`};
  border-radius: 6px;
`;

const RecentContractStatusText = styled.Text<{ $color: string }>`
  font-size: 13px;
  font-weight: 600;
  color: ${({ $color }: { $color: string }) => $color};
`;

const RecentContractSendButton = styled.TouchableOpacity<{ disabled?: boolean }>`
  padding: 8px 16px;
  background-color: #ff6b00;
  border-radius: 6px;
  opacity: ${({ disabled }: { disabled?: boolean }) => (disabled ? 0.6 : 1)};
`;

const RecentContractSendButtonText = styled.Text`
  color: #ffffff;
  font-size: 13px;
  font-weight: 600;
`;

const ShowMoreButton = styled.TouchableOpacity`
  margin-top: 12px;
  align-self: center;
  padding: 8px 16px;
  border-radius: 16px;
  border-width: 1px;
  border-color: #1d42d8;
`;

const ShowMoreButtonInline = styled.TouchableOpacity`
  padding: 4px 0;
  margin-right: 8px;
`;

const ShowMoreButtonText = styled.Text`
  color: #1d42d8;
  font-size: 14px;
  font-weight: 700;
`;

const DashboardCardSection = styled.View`
  margin-bottom: 0;
`;

const DashboardCardGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 12px;
`;

const DashboardCard = styled.TouchableOpacity<{ $pressed?: boolean }>`
  width: 48%;
  background-color: #ffffff;
  border-radius: 16px;
  padding: 16px;
  border-width: ${(props: { $pressed?: boolean }) => (props.$pressed ? '3px' : '0px')};
  border-color: #bae6fd;
`;

const DashboardIconWrapper = styled.View`
  width: 100%;
  align-items: center;
  justify-content: center;
`;

const DashboardIconText = styled.Text`
  font-size: 32px;
`;

const DashboardIconImage = styled.Image`
  width: 45px;
  height: 45px;
`;

const DashboardCardRow = styled.View`
  flex-direction: row;
  align-items: center;
`;

const DashboardIconColumn = styled.View`
  width: 50%;
  align-items: center;
  justify-content: center;
`;

const DashboardTextBlock = styled.View`
  width: 50%;
  align-items: flex-end;
  justify-content: center;
`;

const DashboardLabel = styled.Text`
  font-size: 13px;
  color: #6b7280;
  font-weight: 500;
  text-align: right;
`;

const DashboardValue = styled.Text`
  font-size: 18px;
`;

const AllSchedulesCard = styled.TouchableOpacity`
  background-color: #ffffff;
  border-radius: 12px;
  padding: 20px;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  border-width: 1px;
  border-color: #e5e5e5;
`;

const AllSchedulesCardIcon = styled.Image`
  width: 40px;
  height: 40px;
  margin-right: 16px;
`;

const AllSchedulesCardContent = styled.View`
  flex: 1;
`;

const AllSchedulesCardTitle = styled.Text`
  font-size: 18px;
  font-weight: 700;
  color: #111111;
  margin-bottom: 4px;
`;

const AllSchedulesCardSubtitle = styled.Text`
  font-size: 14px;
  color: #666666;
`;

const AllSchedulesCardArrow = styled.Text`
  font-size: 24px;
  color: #1d42d8;
  margin-left: 16px;
  font-weight: 700;
`;

const SkeletonContainer = styled.View`
  gap: 12px;
`;

const SkeletonClassCard = styled.View`
  background-color: #ffffff;
  border-radius: 12px;
  padding: 16px;
  border-width: 1px;
  border-color: #f0f0f0;
`;

const SkeletonClassCardRow1 = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
`;

const SkeletonClassCardName = styled.View`
  width: 100px;
  height: 18px;
  background-color: #e3e3e8;
  border-radius: 4px;
`;

const SkeletonClassCardAmount = styled.View`
  width: 80px;
  height: 18px;
  background-color: #e3e3e8;
  border-radius: 4px;
`;

const SkeletonClassCardRow2 = styled.View`
  width: 150px;
  height: 14px;
  background-color: #ececf1;
  border-radius: 4px;
  margin-bottom: 8px;
`;

const SkeletonClassCardRow3 = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
`;

const SkeletonClassCardRemaining = styled.View`
  width: 120px;
  height: 14px;
  background-color: #ececf1;
  border-radius: 4px;
`;

const SkeletonClassCardTime = styled.View`
  width: 60px;
  height: 14px;
  background-color: #ececf1;
  border-radius: 4px;
`;

const SkeletonClassCardButtons = styled.View`
  flex-direction: row;
  gap: 8px;
  justify-content: flex-end;
`;

const SkeletonButton = styled.View`
  width: 60px;
  height: 32px;
  background-color: #ececf1;
  border-radius: 6px;
`;
