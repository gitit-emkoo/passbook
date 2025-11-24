import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert } from 'react-native';
import styled from 'styled-components/native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { featureFlags } from '../config/features';
import { useStudentsStore } from '../store/useStudentsStore';
import { useContractsStore } from '../store/useContractsStore';
import { contractsApi } from '../api/contracts';
import ContractSendModal from '../components/modals/ContractSendModal';
import ExtendContractModal from '../components/modals/ExtendContractModal';
import { StudentsStackNavigationProp, StudentsStackParamList } from '../navigation/AppNavigator';
import type { RouteProp } from '@react-navigation/native';
import { StudentAttendanceLog, StudentContractDetail } from '../types/students';

const StudentDetailStub = () => (
  <StubContainer>
    <StubTitle>수강생 상세</StubTitle>
    <StubSubtitle>STEP 1: 네비게이션 테스트</StubSubtitle>
  </StubContainer>
);

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
  const [sendingContractId, setSendingContractId] = useState<number | null>(null);
  const [showSendModal, setShowSendModal] = useState(false);
  const [selectedContract, setSelectedContract] = useState<{ id: number; studentPhone?: string; billingType?: 'prepaid' | 'postpaid' } | null>(null);
  const [isAttendanceExpanded, setIsAttendanceExpanded] = useState(false);
  const [showExtendModal, setShowExtendModal] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: '수강생 상세',
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
      fetchStudentDetail(studentId).catch((error: any) => {
        console.error('[Students] error detail initial', { studentId, message: error?.message });
      });
    }, [fetchStudentDetail, studentId]),
  );

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
        console.error('[StudentDetail] get contract error', error);
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
        } else {
          // 링크만 복사하는 경우는 ContractSendModal에서 처리
          return;
        }
        // 수강생 상세 정보 다시 불러오기
        await fetchStudentDetail(studentId, { force: true });
        
        // 링크 복사인 경우 모달을 닫고, SMS 전송인 경우 모달에서 Alert를 표시하므로 여기서는 모달만 닫지 않음
        if (channel === 'link') {
          setShowSendModal(false);
          setSelectedContract(null);
        }
      } catch (error: any) {
        console.error('[StudentDetail] send contract error', error);
        Alert.alert('오류', error?.message || '계약서 전송에 실패했습니다.');
      } finally {
        setSendingContractId(null);
      }
    },
    [selectedContract, fetchStudentDetail, studentId, sendingContractId],
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
    if (totalSessions > 0) {
      return `횟수제 (${totalSessions}회)`;
    }
    return '월단위';
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
      carry_over: '회차이월',
      deduct_next: '차감',
      vanish: '소멸',
    };
    return map[policy] ?? policy;
  }, []);

  const primaryContract: StudentContractDetail | undefined = useMemo(() => {
    if (!Array.isArray(detail?.contracts) || detail.contracts.length === 0) return undefined;
    const active = detail.contracts.find(
      (c) => c.status === 'confirmed' || c.status === 'sent',
    );
    return active ?? detail.contracts[0];
  }, [detail?.contracts]);

  const formattedSchedule = useMemo(() => {
    if (primaryContract && primaryContract.day_of_week && primaryContract.day_of_week.length > 0) {
      const days = formatDayOfWeek(primaryContract.day_of_week);
      if (primaryContract.time) {
        return `${days} ${primaryContract.time}`;
      }
      return days;
    }
    return detail?.class_info ?? undefined;
  }, [detail?.class_info, primaryContract]);

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

  const thisMonthAttendanceLogs: StudentAttendanceLog[] = useMemo(() => {
    if (!Array.isArray(detail?.attendance_logs)) return [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const filtered = detail.attendance_logs
      .filter((log) => {
        // occurred_at 또는 substitute_at 중 하나라도 이번 달이면 포함
        let targetDate: Date | null = null;
        if (log.occurred_at) {
          targetDate = new Date(log.occurred_at);
        } else if (log.substitute_at) {
          targetDate = new Date(log.substitute_at);
        }
        if (!targetDate) return false;
        return targetDate.getFullYear() === currentYear && targetDate.getMonth() === currentMonth;
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
  }, [detail?.attendance_logs]);

  // 접기/펼치기 상태에 따라 표시할 로그 결정
  const displayedAttendanceLogs = useMemo(() => {
    if (isAttendanceExpanded) {
      return thisMonthAttendanceLogs;
    }
    // 기본 접힘 상태: 최근 1개만 표시
    return thisMonthAttendanceLogs.slice(0, 1);
  }, [thisMonthAttendanceLogs, isAttendanceExpanded]);

  const attendanceEmptyDescription = useMemo(() => {
    const now = new Date();
    const month = `${now.getMonth() + 1}`.padStart(2, '0');
    return `${month}월에 기록된 출석/결석 로그가 없습니다.`;
  }, []);

  const attendanceSectionTitle = useMemo(() => {
    const now = new Date();
    const month = now.getMonth() + 1;
    return `${month}월 출결 기록`;
  }, []);

  // 연장 가능 여부 계산 (수강생 목록 화면과 동일한 로직)
  const extendMeta = useMemo(() => {
    if (!primaryContract) {
      return { extendEligible: false, extendReason: null };
    }

    const now = new Date();
    const snapshot = (primaryContract.policy_snapshot ?? {}) as Record<string, any>;
    const totalSessions = typeof snapshot.total_sessions === 'number' ? snapshot.total_sessions : 0;

    // 횟수제: 남은 횟수 3회 미만
    if (totalSessions > 0) {
      const sessionsUsed =
        typeof primaryContract.sessions_used === 'number' ? primaryContract.sessions_used : 0;
      const remaining = Math.max(totalSessions - sessionsUsed, 0);
      const extendEligible = remaining < 3; // 3회 미만
      const extendReason = remaining > 0 ? `회차 ${remaining}회 남음` : '회차 모두 사용됨';
      return { extendEligible, extendReason };
    }

    // 월단위: 종료일 7일 이내
    if (primaryContract.ended_at) {
      const endDate = new Date(primaryContract.ended_at);
      const diffMs = endDate.getTime() - now.getTime();
      const daysUntilEnd = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      const isExpired = diffMs < 0;
      let extendEligible = false;
      let extendReason: string | null = null;
      if (isExpired) {
        extendEligible = true;
        extendReason = '기간 만료됨';
      } else {
        extendEligible = daysUntilEnd <= 7;
        extendReason = `${daysUntilEnd}일 남음`;
      }
      return { extendEligible, extendReason };
    }

    return { extendEligible: false, extendReason: null };
  }, [primaryContract]);

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

  // 연장 모달에 필요한 정보 계산
  const extendModalProps = useMemo(() => {
    if (!primaryContract) return null;

    const snapshot = (primaryContract.policy_snapshot ?? {}) as Record<string, any>;
    const totalSessions = typeof snapshot.total_sessions === 'number' ? snapshot.total_sessions : 0;

    if (totalSessions > 0) {
      const sessionsUsed =
        typeof primaryContract.sessions_used === 'number' ? primaryContract.sessions_used : 0;
      const remaining = Math.max(totalSessions - sessionsUsed, 0);
      return {
        contractType: 'sessions' as const,
        totalSessions,
        remainingSessions: remaining,
      };
    } else {
      // 월단위
      return {
        contractType: 'monthly' as const,
        currentEndDate: primaryContract.ended_at,
      };
    }
  }, [primaryContract]);

  if (status === 'loading' && !detail) {
    return (
      <CenteredContainer>
        <ActivityIndicator color="#ff6b00" />
        <CenteredText>수강생 정보를 불러오는 중이에요...</CenteredText>
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
            <StudentName>{detail.name}</StudentName>
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

        <SectionCard>
          <SectionHeader>
            <SectionTitle>기본 정보</SectionTitle>
          </SectionHeader>
          <InfoRow label="이름" value={detail.name} />
          <InfoRow label="연락처" value={detail.phone ?? '-'} />
          <InfoRow label="과목/레슨" value={primaryContract?.subject ?? '-'} />
          <InfoRow label="수업 요일/시간" value={formattedSchedule ?? '-'} />
          <InfoRow label="보호자" value={guardianLine ?? '-'} />
        </SectionCard>

        <SectionCard>
          <SectionHeader>
            <SectionTitle>계약 정보</SectionTitle>
          </SectionHeader>
          {contractsList.length === 0 ? (
            <EmptyDescription>등록된 계약이 없습니다.</EmptyDescription>
          ) : (
            <ContractsList>
              {contractsList.map((contract) => {
                const isConfirmed = contract.status === 'confirmed';
                const isSent = contract.status === 'sent';
                const showSendButton = isConfirmed && !isSent;
                const isSending = sendingContractId === contract.id;

                return (
                  <ContractCard key={contract.id}>
                    <ContractCardHeader>
                      <ContractCardTitle>
                        {contract.subject || contract.title || `계약 #${contract.id}`}
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
                        <ContractInfoLabel>결석 처리:</ContractInfoLabel>
                        <ContractInfoValue>{formatAbsencePolicy(contract.absence_policy)}</ContractInfoValue>
                      </ContractInfoRow>
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

        <SectionCard>
          <SectionHeader>
            <SectionTitle>{attendanceSectionTitle}</SectionTitle>
          </SectionHeader>
          {thisMonthAttendanceLogs.length === 0 ? (
            <EmptyDescription>{attendanceEmptyDescription}</EmptyDescription>
          ) : (
            <>
              <AttendanceList>
                {displayedAttendanceLogs.map((log) => {
                  const statusText = formatAttendanceStatus(log.status);
                  const memo = log.memo_internal || log.memo_public;
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
                    displayText = memo 
                      ? `${dateText} ${statusText} (${memo})`
                      : `${dateText} ${statusText}`;
                  }
                  
                  return (
                    <AttendanceItem key={log.id}>
                      <AttendanceLine>
                        <AttendanceDate $color={statusColor}>{displayText}</AttendanceDate>
                      </AttendanceLine>
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
              {thisMonthAttendanceLogs.length > 1 && (
                <AttendanceToggleButton onPress={() => setIsAttendanceExpanded(!isAttendanceExpanded)}>
                  <AttendanceToggleText>
                    {isAttendanceExpanded ? '접기' : `더보기 (${thisMonthAttendanceLogs.length - 1}개)`}
                  </AttendanceToggleText>
                </AttendanceToggleButton>
              )}
            </>
          )}
        </SectionCard>

        {/* 정산서 전송내역 섹션 */}
        <SectionCard>
          <SectionHeader>
            <SectionTitle>정산서 전송내역</SectionTitle>
          </SectionHeader>
          {sentInvoices.length === 0 ? (
            <EmptyDescription>전송된 정산서가 없습니다.</EmptyDescription>
          ) : (
            <InvoiceList>
              {sentInvoices.map((invoice) => {
                const billingType = invoice.contract?.billing_type ?? null;
                const actualBilling = getActualBillingMonth(invoice);
                const periodText = billingType === 'prepaid'
                  ? `${invoice.year}년 ${invoice.month}월(${actualBilling.month}월분)`
                  : `${invoice.year}년 ${invoice.month}월(${invoice.month}월분)`;
                
                return (
                <InvoiceItem key={invoice.id}>
                  <InvoiceInfo>
                    <InvoicePeriod>{periodText}</InvoicePeriod>
                    <InvoiceAmount>{(invoice.final_amount ?? 0).toLocaleString()}원</InvoiceAmount>
                  </InvoiceInfo>
                  {invoice.auto_adjustment !== undefined && invoice.auto_adjustment !== 0 && (
                    <InvoiceAdjustment>
                      자동 조정: {invoice.auto_adjustment > 0 ? '+' : ''}{invoice.auto_adjustment.toLocaleString()}원
                    </InvoiceAdjustment>
                  )}
                  {invoice.manual_adjustment !== undefined && invoice.manual_adjustment !== 0 && (
                    <InvoiceAdjustment>
                      수동 조정: {invoice.manual_adjustment > 0 ? '+' : ''}{invoice.manual_adjustment.toLocaleString()}원
                      {invoice.manual_reason && ` (${invoice.manual_reason})`}
                    </InvoiceAdjustment>
                  )}
                  {invoice.created_at && (
                    <InvoiceDate>전송일: {new Date(invoice.created_at).toLocaleDateString('ko-KR')}</InvoiceDate>
                  )}
                </InvoiceItem>
              );
              })}
            </InvoiceList>
          )}
        </SectionCard>
      </Content>

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
          currentEndDate={extendModalProps.currentEndDate}
        />
      )}
    </Container>
  );
}

export default function StudentDetailScreen() {
  if (featureFlags.students.useStub) {
    return <StudentDetailStub />;
  }

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
    present: '출석',
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
  background-color: #f2f2f7;
`;

const Content = styled.View`
  padding: 20px 16px 40px;
  gap: 16px;
`;

const HeaderCard = styled.View`
  background-color: #ffffff;
  border-radius: 16px;
  padding: 20px;
  flex-direction: row;
  justify-content: space-between;
  align-items: flex-start;
  shadow-color: #000;
  shadow-opacity: 0.08;
  shadow-offset: 0px 4px;
  shadow-radius: 12px;
  elevation: 4;
`;

const HeaderTexts = styled.View`
  flex: 1;
  padding-right: 12px;
`;

const StudentName = styled.Text`
  font-size: 24px;
  font-weight: 700;
  color: #111;
  margin-bottom: 6px;
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
  background-color: #ff6b00;
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
  border-radius: 16px;
  padding: 20px;
  shadow-color: #000;
  shadow-opacity: 0.06;
  shadow-offset: 0px 4px;
  shadow-radius: 10px;
  elevation: 3;
`;

const SectionHeader = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
`;

const SectionTitle = styled.Text`
  font-size: 18px;
  font-weight: 700;
  color: #111;
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
  font-size: 15px;
  color: ${({ $color }: { $color?: string }) => $color || '#333'};
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
  border-top-width: 1px;
  border-top-color: #f0f0f3;
`;

const AttendanceToggleText = styled.Text`
  font-size: 14px;
  font-weight: 600;
  color: #007AFF;
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
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
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

const StubContainer = styled.View`
  flex: 1;
  justify-content: center;
  align-items: center;
  background-color: #f5f5f5;
`;

const StubTitle = styled.Text`
  font-size: 24px;
  font-weight: 700;
  color: #000;
  margin-bottom: 10px;
`;

const StubSubtitle = styled.Text`
  font-size: 16px;
  color: #666;
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