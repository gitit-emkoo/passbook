import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation, CommonActions } from '@react-navigation/native';
import { featureFlags } from '../config/features';
import { useDashboardStore } from '../store/useDashboardStore';
import { useAuthStore } from '../store/useStore';
import { useContractsStore } from '../store/useContractsStore';
import { useInvoicesStore } from '../store/useInvoicesStore';
import { useStudentsStore } from '../store/useStudentsStore';
import { HomeStackNavigationProp, MainTabsNavigationProp, MainAppStackNavigationProp } from '../navigation/AppNavigator';
import { contractsApi } from '../api/contracts';
import { attendanceApi } from '../api/attendance';
import ContractSendModal from '../components/modals/ContractSendModal';
import AttendanceConfirmModal from '../components/modals/AttendanceConfirmModal';
import AttendanceSignatureModal from '../components/modals/AttendanceSignatureModal';
import AttendanceAbsenceModal from '../components/modals/AttendanceAbsenceModal';
import AttendanceDeleteModal from '../components/modals/AttendanceDeleteModal';
import styled from 'styled-components/native';
import { RecentContract } from '../types/dashboard';

// 알림 아이콘 이미지
const notificationBellIcon = require('../../assets/notification-bell.png');

const HomeStub = () => (
  <View style={stubStyles.container}>
    <Text style={stubStyles.text}>홈 화면</Text>
    <Text style={stubStyles.subtext}>STEP 1: 네비게이션 테스트</Text>
  </View>
);

interface TodayClass {
  id: number;
  subject: string;
  time: string | null;
  attendance_requires_signature: boolean;
  hasAttendanceLog: boolean;
  attendanceLogId: number | null;
  student: {
    id: number;
    name: string;
  };
  billing_type: string;
  absence_policy: string;
  monthly_amount: number;
  isSubstitute?: boolean;
  originalOccurredAt?: string | null;
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
  const [sendingContractId, setSendingContractId] = useState<number | null>(null);
  const [showSendModal, setShowSendModal] = useState(false);
  const [selectedContract, setSelectedContract] = useState<{ id: number; studentPhone?: string; billingType?: 'prepaid' | 'postpaid' } | null>(null);
  const sendContract = useContractsStore((state) => state.sendContract);
  
  // 출석 모달 상태
  const [showAttendanceConfirmModal, setShowAttendanceConfirmModal] = useState(false);
  const [showAttendanceSignatureModal, setShowAttendanceSignatureModal] = useState(false);
  const [showAttendanceAbsenceModal, setShowAttendanceAbsenceModal] = useState(false);
  const [showDeleteAttendanceModal, setShowDeleteAttendanceModal] = useState(false);
  const [selectedClassItem, setSelectedClassItem] = useState<TodayClass | null>(null);
  const [unprocessedCount, setUnprocessedCount] = useState<number>(0);

  const user = useAuthStore((state) => state.user);
  const apiBaseUrl = useAuthStore((state) => state.apiBaseUrl);
  const accessToken = useAuthStore((state) => state.accessToken);
  const fetchDashboard = useDashboardStore((state) => state.fetchDashboard);
  const summary = useDashboardStore((state) => state.summary);
  const fetchInvoicesCurrent = useInvoicesStore((s) => s.fetchCurrentMonth);
  const currentMonthInvoices = useInvoicesStore((state) => state.currentMonthInvoices);
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
      fetchInvoicesCurrent({ historyMonths: 3 }).catch((err: any) => {
        console.error('[Invoices] error initial', err?.message);
      }),
    ]);
  }, [isPersistReady, loadedOnce, fetchDashboard, fetchInvoicesCurrent]);

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
      const isAuthenticated = useAuthStore.getState().isAuthenticated;
      if (!isPersistReady || !isAuthenticated) return;
      
      // 대시보드 갱신
      fetchDashboard().catch(() => {});
      // 정산 데이터 갱신
      fetchInvoicesCurrent({ historyMonths: 3 }).catch(() => {});
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
    }, [isPersistReady, fetchDashboard, fetchInvoicesCurrent, loadUnprocessedCount]),
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
  const createOccurredAt = useCallback((time: string | null | undefined): string => {
    const today = new Date();
    // time이 없으면 현재 시간 사용
    if (!time || !time.trim()) {
      return today.toISOString();
    }
    const [hours, minutes] = time.split(':').map(Number);
    today.setHours(hours, minutes, 0, 0);
    return today.toISOString();
  }, []);

  // 출석 기록 후 처리: 리스트에서 제거 및 새로고침
  const handleAttendanceRecorded = useCallback(async () => {
    // 오늘 수업 목록 새로고침
    try {
      setTodayClassesLoading(true);
      const data = await contractsApi.getTodayClasses();
      setTodayClasses(data);
      // 정산 데이터도 동시에 최신화 (당월 차감 실시간 반영)
      await fetchInvoicesCurrent({ historyMonths: 3, force: true });
      // 대시보드도 새로고침 (이번달 정산할 학생 수 업데이트)
      await fetchDashboard({ force: true });
    } catch (error: any) {
      console.error('[Home] refresh today classes error', error);
    } finally {
      setTodayClassesLoading(false);
    }
  }, [fetchInvoicesCurrent, fetchDashboard]);

  // 출석 기록 API 호출
  const handleAttendancePresentSubmit = useCallback(async (signatureData?: string) => {
    if (!selectedClassItem) return;

    try {
      const occurredAt = createOccurredAt(selectedClassItem.time);
      await attendanceApi.create({
        student_id: selectedClassItem.student.id,
        contract_id: selectedClassItem.id,
        occurred_at: occurredAt,
        status: 'present',
        signature_data: signatureData,
      });
      
      Alert.alert('완료', '출석이 기록되었습니다.');
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

  // 결석/대체 기록 API 호출
  const handleAttendanceAbsenceSubmit = useCallback(async (data: {
    status: 'absent' | 'substitute';
    substitute_at?: string;
    memo_public?: string;
    memo_internal?: string;
    reason: string;
  }) => {
    if (!selectedClassItem) return;

    try {
      const occurredAt = createOccurredAt(selectedClassItem.time);
      await attendanceApi.create({
        student_id: selectedClassItem.student.id,
        contract_id: selectedClassItem.id,
        occurred_at: occurredAt,
        status: data.status,
        substitute_at: data.substitute_at,
        // 공개 메모는 결석/대체 사유와 동일하게 저장
        memo_public: data.reason || data.memo_public,
        memo_internal: data.memo_internal,
      });
      
      Alert.alert('완료', `${data.status === 'absent' ? '결석' : '대체'}이 기록되었습니다.`);
      // 목록/정산 새로고침 (출석 로그 상태 및 정산 반영)
      await handleAttendanceRecorded();
      // 해당 수강생의 상세 정보도 강제로 새로고침 (수강생 상세 화면 실시간 반영)
      if (selectedClassItem.student?.id) {
        await fetchStudentDetail(selectedClassItem.student.id, { force: true });
      }
    } catch (error: any) {
      console.error('[Home] attendance absence error', error);
      Alert.alert('오류', error?.message || '기록에 실패했습니다.');
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

  // 결석/대체 처리 (하나의 버튼으로 통합)
  const handleAttendanceAbsence = useCallback((classItem: TodayClass) => {
    setSelectedClassItem(classItem);
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
      Alert.alert('완료', '출결 기록이 삭제되었습니다.');
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
      Alert.alert('오류', error?.message || '출결 기록 삭제에 실패했습니다.');
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

  const handleToggleGuidance = useCallback(() => {
    setShowAllGuidanceStudents((prev) => !prev);
  }, []);

  React.useEffect(() => {
    if (!hasMoreGuidanceStudents && showAllGuidanceStudents) {
      setShowAllGuidanceStudents(false);
    }
  }, [hasMoreGuidanceStudents, showAllGuidanceStudents]);


  const getCurrentMonth = useCallback(() => {
    const now = new Date();
    return `${now.getMonth() + 1}월`;
  }, []);

  const getBillingTypeLabel = useCallback((type: string) => {
    if (type === 'prepaid') return '선불';
    if (type === 'postpaid') return '후불';
    return type;
  }, []);

  const getAbsencePolicyLabel = useCallback((policy: string, billingType?: string) => {
    if (policy === 'carry_over') return '회차이월';
    if (policy === 'deduct_next') return '차감';
    if (policy === 'vanish') return '소멸';
    return policy;
  }, []);

  const handleSendContractClick = useCallback(
    async (contractId: number) => {
      // 계약서 상세 정보 가져오기
      try {
        const contract = await contractsApi.getById(contractId);
        setSelectedContract({
          id: contractId,
          studentPhone: contract.student?.phone || contract.student?.guardian_phone,
          billingType: contract.billing_type as 'prepaid' | 'postpaid',
        });
        setShowSendModal(true);
      } catch (error: any) {
        console.error('[Home] get contract error', error);
        Alert.alert('오류', '계약서 정보를 불러오지 못했습니다.');
      }
    },
    [],
  );

  const handleSend = useCallback(
    async (channel: 'sms' | 'link') => {
      if (!selectedContract) {
        return;
      }

      if (sendingContractId !== null) {
        return;
      }

      setSendingContractId(selectedContract.id);
      try {
        if (channel === 'sms') {
          // 계약서 상태를 'sent'로 업데이트
          // 선불 계약의 경우 백엔드에서 자동으로 청구서 생성
          await contractsApi.updateStatus(selectedContract.id, 'sent');
          
          // 수강생 목록, 대시보드, 인보이스 새로고침 (즉시 반영)
          // 선불 계약의 경우 청구서가 지난 정산에 반영되도록
          await Promise.all([
            fetchDashboard({ force: true }),
            fetchInvoicesCurrent({ force: true }),
          ]);
        } else if (channel === 'link') {
          // 링크만 복사하는 경우는 ContractSendModal에서 처리
          // 모달을 닫고 상태 초기화
          setShowSendModal(false);
          setSelectedContract(null);
        }
      } catch (error: any) {
        console.error('[Home] send contract error', error);
        Alert.alert('오류', error?.message || '계약서 전송에 실패했습니다.');
      } finally {
        setSendingContractId(null);
      }
    },
    [selectedContract, fetchDashboard, fetchInvoicesCurrent, sendingContractId],
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
          <ActivityIndicator size="large" color="#ff6b00" />
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
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 상단 헤더: 로고, 알림 아이콘, 안내 텍스트 */}
        <HeaderSection>
          <HeaderTop>
            <HeaderTitle>김쌤</HeaderTitle>
            <NotificationButton onPress={handleNotificationPress}>
              <NotificationIcon source={notificationBellIcon} />
            </NotificationButton>
          </HeaderTop>
          <HeaderSubtext>계약부터 출결기록 정산서 발송까지 간편한 레슨관리</HeaderSubtext>
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

        {/* 1. 오늘 수업 섹션 */}
        <Section>
          <SectionHeader>
            <SectionTitle>오늘 수업</SectionTitle>
          </SectionHeader>
          {todayClassesLoading ? (
            <LoadingContainer>
              <ActivityIndicator size="small" color="#ff6b00" />
            </LoadingContainer>
          ) : todayClasses.length === 0 ? (
            <EmptyDescription>오늘 예정된 수업이 없습니다.</EmptyDescription>
          ) : (
            <ListContainer>
              {todayClasses.map((classItem) => {
                const amount = classItem.monthly_amount ? `${classItem.monthly_amount.toLocaleString()}원` : '';
                const billingLabel = getBillingTypeLabel(classItem.billing_type);
                const policyLabel = getAbsencePolicyLabel(classItem.absence_policy, classItem.billing_type);
                const conditionText = `${billingLabel}(${policyLabel})`;

                // 대체 수업인 경우 원래 날짜 포맷팅
                const formatSubstituteDate = (dateString: string | null | undefined) => {
                  if (!dateString) return null;
                  const date = new Date(dateString);
                  const month = date.getMonth() + 1;
                  const day = date.getDate();
                  return `${month}/${day}일`;
                };

                const substituteText = classItem.isSubstitute && classItem.originalOccurredAt
                  ? `${formatSubstituteDate(classItem.originalOccurredAt)} > 오늘`
                  : null;

                return (
                  <ClassCard key={classItem.id}>
                    <ClassInfo>
                      <ClassMainInfo>
                        <ClassMainText>
                          {classItem.time || '-'} {classItem.student?.name || '알 수 없음'} ({classItem.subject})
                        </ClassMainText>
                        {substituteText && (
                          <SubstituteInfo>{substituteText}</SubstituteInfo>
                        )}
                      </ClassMainInfo>
                      <ClassMetaRow>
                        <ClassMetaContainer>
                          {amount ? <ClassAmount>{amount}</ClassAmount> : null}
                          <ClassCondition>{conditionText}</ClassCondition>
                        </ClassMetaContainer>
                        <ClassActions>
                          <AttendanceButton
                            onPress={() => handleAttendancePresent(classItem)}
                            variant="present"
                            disabled={classItem.hasAttendanceLog}
                          >
                            <AttendanceButtonText variant="present" disabled={classItem.hasAttendanceLog}>
                              출석
                            </AttendanceButtonText>
                          </AttendanceButton>
                          <AttendanceButton
                            onPress={() => handleAttendanceAbsence(classItem)}
                            variant="absent"
                            disabled={classItem.hasAttendanceLog}
                          >
                            <AttendanceButtonText variant="absent" disabled={classItem.hasAttendanceLog}>
                              결석
                            </AttendanceButtonText>
                          </AttendanceButton>
                          <AttendanceButton
                            onPress={() => handleDeleteAttendance(classItem)}
                            variant="edit"
                            disabled={!classItem.hasAttendanceLog}
                          >
                            <AttendanceButtonText variant="edit" disabled={!classItem.hasAttendanceLog}>
                              수정
                            </AttendanceButtonText>
                          </AttendanceButton>
                        </ClassActions>
                      </ClassMetaRow>
                    </ClassInfo>
                  </ClassCard>
                );
              })}
            </ListContainer>
          )}
        </Section>

        {/* 미처리 출결 안내 카드 */}
        {unprocessedCount > 0 && (
          <Section>
            <UnprocessedCard onPress={() => appNavigation.navigate('UnprocessedAttendance')}>
              <UnprocessedCardText>
                미처리 출결 {unprocessedCount}건 → 처리하기
              </UnprocessedCardText>
              <UnprocessedCardArrow>›</UnprocessedCardArrow>
            </UnprocessedCard>
          </Section>
        )}

        {/* 2. 정산 알림 섹션 */}
        <Section>
          <SettlementCard onPress={handleSettlementPress}>
            <SettlementCardContent>
              <SettlementCardTitle>
                {getCurrentMonth()} 정산할 학생 {(() => {
                  const pendingCount = currentMonthInvoices.filter(
                    (inv) => inv.send_status === 'not_sent' || inv.send_status === 'partial'
                  ).length;
                  return pendingCount;
                })()}명
              </SettlementCardTitle>
              <SettlementCardSubtext>금액 확인 후 보내세요.</SettlementCardSubtext>
            </SettlementCardContent>
            <SettlementCardButton>
              <SettlementCardButtonText>정산으로</SettlementCardButtonText>
            </SettlementCardButton>
          </SettlementCard>
        </Section>

        {/* 3. 최근 계약 섹션 */}
        {recentContracts.length > 0 && (
          <Section>
            <SectionHeader>
              <SectionTitle>최근 계약</SectionTitle>
              <Badge>
                <BadgeText>{recentContracts.length}</BadgeText>
              </Badge>
            </SectionHeader>
            <ListContainer>
              {displayedRecentContracts.map((contract) => {
                const isConfirmed = contract.status === 'confirmed';
                const isSent = contract.status === 'sent';
                const showSendButton = isConfirmed && !isSent;
                const isSending = sendingContractId === contract.id;

                return (
                  <RecentContractItem key={contract.id}>
                    <RecentContractContent>
                      <RecentContractTitle>{contract.studentName || '학생 정보 없음'}</RecentContractTitle>
                      <RecentContractMeta>{contract.title}</RecentContractMeta>
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
              {hasMoreRecentContracts && (
                <ShowMoreButton onPress={handleToggleRecentContracts}>
                  <ShowMoreButtonText>{showAllRecentContracts ? '접기' : '전체 보기'}</ShowMoreButtonText>
                </ShowMoreButton>
              )}
            </ListContainer>
          </Section>
        )}

        {/* 4. 추가 안내가 필요한 수강생 섹션 */}
        <Section>
          <SectionHeader>
            <SectionTitle>추가 안내가 필요한 수강생</SectionTitle>
            {guidanceContracts.length > 0 && (
              <Badge>
                <BadgeText>{guidanceContracts.length}</BadgeText>
              </Badge>
            )}
          </SectionHeader>
          {!summary || guidanceContracts.length === 0 ? (
            <EmptyDescription>추가 안내가 필요한 수강생이 없습니다.</EmptyDescription>
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

        {/* 5. 요약 지표 (하단 작은 배지) */}
        <SummaryBadgeSection>
          <SummaryBadgeText>
            {(() => {
              const pendingCount = currentMonthInvoices.filter(
                (inv) => inv.send_status === 'not_sent' || inv.send_status === 'partial'
              ).length;
              const studentsCount = summary?.studentsCount ?? 0;
              const contractsCount = summary?.contractsCount ?? 0;
              
              // 항상 "총 학생 X명 · 총 계약 X건 · 미정산 X건" 형식으로 표시
              return `총 학생 ${studentsCount}명 · 총 계약 ${contractsCount}건 · 미정산 ${pendingCount}건`;
            })()}
          </SummaryBadgeText>
        </SummaryBadgeSection>
      </ScrollView>
      </Container>

      {/* 전송 모달 */}
      {selectedContract && (
        <ContractSendModal
          visible={showSendModal}
          onClose={() => {
            setShowSendModal(false);
            setSelectedContract(null);
          }}
          onSend={handleSend}
          contractLink={contractsApi.getViewLink(selectedContract.id)}
          recipientPhone={selectedContract.studentPhone}
          billingType={selectedContract.billingType}
        />
      )}

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

      {/* 출석 서명 모달 */}
      {selectedClassItem && (
        <AttendanceSignatureModal
          visible={showAttendanceSignatureModal}
          onClose={() => {
            setShowAttendanceSignatureModal(false);
            setSelectedClassItem(null);
          }}
          onConfirm={(signature: string) => {
            handleAttendancePresentSubmit(signature);
            setShowAttendanceSignatureModal(false);
            setSelectedClassItem(null);
          }}
          studentName={selectedClassItem.student.name}
        />
      )}

      {/* 결석/대체 모달 */}
      {selectedClassItem && (
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
        />
      )}

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
    </>
  );
}

export default function HomeScreen() {
  if (featureFlags.dashboard.useStub) {
    return <HomeStub />;
  }

  return <HomeContent />;
}

const stubStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  text: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 10,
  },
  subtext: {
    fontSize: 16,
    color: '#d12c2c',
  },
});

const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
});

const Container = styled.View`
  flex: 1;
  background-color: #ffffff;
  z-index: 0;
`;

const LoadingContainer = styled.View`
  padding: 20px;
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
  color: #ff6b00;
  flex: 1;
`;

const NotificationButton = styled.TouchableOpacity`
  padding: 8px;
`;

const NotificationIcon = styled.Image`
  width: 24px;
  height: 24px;
`;

const HeaderSubtext = styled.Text`
  font-size: 14px;
  color: #666;
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
  background-color: #ffffff;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
`;

const SectionHeader = styled.View`
  flex-direction: row;
  align-items: center;
  margin-bottom: 12px;
`;

const SectionTitle = styled.Text`
  font-size: 18px;
  font-weight: 700;
  color: #111;
`;

const Badge = styled.View`
  background-color: #ff6b00;
  border-radius: 12px;
  padding: 4px 10px;
  margin-left: 8px;
`;

const BadgeText = styled.Text`
  color: #ffffff;
  font-size: 12px;
  font-weight: 600;
`;

const EmptyDescription = styled.Text`
  font-size: 14px;
  color: #666;
  padding: 8px 0;
`;

const ListContainer = styled.View`
  gap: 12px;
`;

const ClassCard = styled.View`
  background-color: #f8f9fa;
  border-radius: 8px;
  padding: 12px;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
`;

const ClassInfo = styled.View`
  flex: 1;
  gap: 4px;
`;

const ClassMainInfo = styled.View`
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
`;

const ClassMainText = styled.Text`
  font-size: 15px;
  font-weight: 600;
  color: #111;
`;

const SubstituteInfo = styled.Text`
  font-size: 13px;
  font-weight: 500;
  color: #007AFF;
`;

const ClassMetaRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const ClassMetaContainer = styled.View`
  flex: 1;
  gap: 2px;
`;

const ClassAmount = styled.Text`
  font-size: 13px;
  color: #666;
  font-weight: 500;
`;

const ClassCondition = styled.Text`
  font-size: 13px;
  color: #666;
`;

const ClassActions = styled.View`
  flex-direction: row;
  gap: 6px;
  margin-left: 12px;
`;

const AttendanceButton = styled.TouchableOpacity<{ variant: 'present' | 'absent' | 'substitute' | 'edit'; disabled?: boolean }>`
  padding: 8px 14px;
  border-radius: 20px;
  align-items: center;
  justify-content: center;
  background-color: ${({ variant, disabled }: { variant: string; disabled?: boolean }) => {
    if (disabled) return '#f5f5f5';
    if (variant === 'present') return '#fff5f0';
    if (variant === 'absent') return '#fff4e6';
    if (variant === 'edit') return '#e8f4f8';
    return '#ffffff';
  }};
  border-width: ${({ variant }: { variant: string }) => (variant === 'substitute' ? '1px' : '0px')};
  border-color: ${({ variant }: { variant: string }) => (variant === 'substitute' ? '#e0e0e0' : 'transparent')};
  opacity: ${({ disabled }: { disabled?: boolean }) => (disabled ? 0.5 : 1)};
`;

const AttendanceButtonText = styled.Text<{ variant: 'present' | 'absent' | 'substitute' | 'edit'; disabled?: boolean }>`
  font-size: 13px;
  font-weight: 600;
  color: ${({ variant, disabled }: { variant: string; disabled?: boolean }) => {
    if (disabled) return '#999';
    if (variant === 'present') return '#ff6b00';
    if (variant === 'absent') return '#ff9500';
    if (variant === 'edit') return '#007AFF';
    return '#333';
  }};
`;

const SettlementCard = styled.TouchableOpacity`
  background-color: #fff7e6;
  border-radius: 12px;
  padding: 16px;
  margin: 0;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  border-width: 2px;
  border-color: #ffa500;
`;

const SettlementCardContent = styled.View`
  flex: 1;
`;

const SettlementCardTitle = styled.Text`
  font-size: 16px;
  font-weight: 700;
  color: #111;
  margin-bottom: 4px;
`;

const SettlementCardSubtext = styled.Text`
  font-size: 13px;
  color: #666;
`;

const SettlementCardButton = styled.View`
  padding: 10px 20px;
  background-color: #ff6b00;
  border-radius: 8px;
`;

const SettlementCardButtonText = styled.Text`
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
`;

const UnprocessedCard = styled.TouchableOpacity`
  background-color: #fff2e5;
  border-radius: 12px;
  padding: 16px;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  border-width: 1px;
  border-color: #ff6b00;
`;

const UnprocessedCardText = styled.Text`
  font-size: 15px;
  font-weight: 600;
  color: #ff6b00;
  flex: 1;
`;

const UnprocessedCardArrow = styled.Text`
  font-size: 20px;
  color: #ff6b00;
  margin-left: 8px;
`;

const StudentItem = styled.View`
  flex-direction: row;
  align-items: center;
  padding: 12px;
  background-color: #f8f9fa;
  border-radius: 8px;
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
  background-color: #ff6b00;
  border-radius: 6px;
`;

const StudentItemButtonText = styled.Text`
  color: #ffffff;
  font-size: 13px;
  font-weight: 600;
`;

const RecentContractItem = styled.View`
  flex-direction: row;
  align-items: center;
  padding: 12px;
  background-color: #f8f9fa;
  border-radius: 8px;
  margin-bottom: 8px;
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
  border-color: #ff6b00;
`;

const ShowMoreButtonText = styled.Text`
  color: #ff6b00;
  font-size: 13px;
  font-weight: 600;
`;

const SummaryBadgeSection = styled.View`
  background-color: #ffffff;
  border-radius: 12px;
  padding: 12px 16px;
  margin-bottom: 16px;
  align-items: center;
`;

const SummaryBadgeText = styled.Text`
  font-size: 13px;
  color: #666;
`;


