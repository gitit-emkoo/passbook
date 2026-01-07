import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, Modal } from 'react-native';
import styled from 'styled-components/native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import InvoiceAmountModal from '../components/modals/InvoiceAmountModal';
import { useInvoicesStore } from '../store/useInvoicesStore';
import { useAuthStore } from '../store/useStore';
import { InvoiceHistoryGroup, InvoiceSummary, MonthlySettlement } from '../types/invoices';
import { SettlementStackNavigationProp } from '../navigation/AppNavigator';
import { invoicesApi } from '../api/invoices';

const emptyStateIcon = require('../../assets/empty.png');
const empty1StateIcon = require('../../assets/empty1.png');

export default function SettlementScreen() {
  return <SettlementContent />;
}

function SettlementContent() {
  const navigation = useNavigation<SettlementStackNavigationProp>();
  const [refreshing, setRefreshing] = useState(false);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<number>>(new Set()); // 개별 선택 (기본 OFF)
  const [amountModalVisible, setAmountModalVisible] = useState(false);
  const [amountTargetInvoice, setAmountTargetInvoice] = useState<InvoiceSummary | null>(null);

  const fetchSections = useInvoicesStore((state) => state.fetchSections);
  const updateInvoice = useInvoicesStore((state) => state.updateInvoice);
  const sections = useInvoicesStore((state) => state.sections);
  const invoicesStatus = useInvoicesStore((state) => state.status);
  const invoicesError = useInvoicesStore((state) => state.errorMessage);
  const invoicesInFlight = useInvoicesStore((state) => state._inFlight);

  // 현재 날짜 기준으로 이번 달 키 생성
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentMonthKey = `${currentYear}-${currentMonth}`;

  // 화면 포커스 시마다 자동 새로고침
  useFocusEffect(
    useCallback(() => {
      // 인증 상태 확인
      const isAuthenticated = useAuthStore.getState().isAuthenticated;
      if (!isAuthenticated) {
        return;
      }

      // 매번 포커스될 때마다 새로고침 (fetchSections 내부에서 _inFlight 체크로 중복 호출 방지)
      fetchSections(true).catch((error: any) => {
        console.error('[Invoices] error on focus', error?.message);
      });
    }, [fetchSections]),
  );

  const calculateSettlement = useCallback((group: InvoiceHistoryGroup): MonthlySettlement => {
    const invoices = group.invoices ?? [];
    const totalAmount = invoices.reduce((sum, inv) => sum + (inv.final_amount ?? 0), 0);
    const sentCount = invoices.filter((inv) => inv.send_status === 'sent').length;
    const notSentCount = invoices.filter((inv) => inv.send_status === 'not_sent').length;
    const partialCount = invoices.filter((inv) => inv.send_status === 'partial').length;

    let sendStatus: 'draft' | 'partial' | 'sent';
    if (invoices.length === 0) {
      sendStatus = 'draft';
    } else if (sentCount === invoices.length) {
      sendStatus = 'sent';
    } else if (partialCount > 0 || (sentCount > 0 && sentCount < invoices.length)) {
      sendStatus = 'partial';
    } else if (notSentCount === invoices.length) {
      sendStatus = 'draft';
    } else {
      sendStatus = 'partial';
    }

    return {
      year: group.year,
      month: group.month,
      invoices,
      totalAmount,
      totalCount: invoices.length,
      sendStatus,
      sentCount,
      notSentCount,
    };
  }, []);

  // 오늘청구 섹션 계산
  const todayBillingSettlement = useMemo<MonthlySettlement>(() => {
    const invoices = sections?.todayBilling ?? [];
    const group: InvoiceHistoryGroup = {
      year: currentYear,
      month: currentMonth,
      invoices,
    };
    return calculateSettlement(group);
  }, [calculateSettlement, sections?.todayBilling, currentMonth, currentYear]);

  // 정산중 섹션 계산
  const inProgressSettlement = useMemo<MonthlySettlement>(() => {
    const invoices = sections?.inProgress ?? [];
    const group: InvoiceHistoryGroup = {
      year: currentYear,
      month: currentMonth,
      invoices,
    };
    return calculateSettlement(group);
  }, [calculateSettlement, sections?.inProgress, currentMonth, currentYear]);

  // 전송한 청구서 섹션 계산 (연도별로 그룹화)
  const sentSettlementsByYear = useMemo<Map<number, MonthlySettlement[]>>(() => {
    const settlements = (sections?.sentInvoices ?? []).map((group) => calculateSettlement(group));
    const grouped = new Map<number, MonthlySettlement[]>();
    
    for (const settlement of settlements) {
      const year = settlement.year;
      if (!grouped.has(year)) {
        grouped.set(year, []);
      }
      grouped.get(year)!.push(settlement);
    }
    
    // 각 연도 내에서 월별로 정렬 (내림차순)
    for (const [year, monthSettlements] of grouped.entries()) {
      monthSettlements.sort((a, b) => {
        if (a.month !== b.month) return b.month - a.month;
        return 0;
      });
    }
    
    return grouped;
  }, [calculateSettlement, sections?.sentInvoices]);
  
  // 연도 목록 (내림차순)
  const sentYears = useMemo(() => {
    return Array.from(sentSettlementsByYear.keys()).sort((a, b) => b - a);
  }, [sentSettlementsByYear]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchSections(true);
    } catch (error: any) {
      console.error('[Invoices] refresh error', error?.message);
    } finally {
      setRefreshing(false);
    }
  }, [fetchSections]);

  const handleRetry = useCallback(async () => {
    try {
      await fetchSections(true);
      Alert.alert('정산', '정산 목록을 다시 불러왔습니다.');
    } catch (error: any) {
      Alert.alert('정산', error?.message ?? '정산 목록을 불러오지 못했습니다.');
    }
  }, [fetchSections]);

  const toggleMonth = useCallback((key: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const toggleYear = useCallback((year: number) => {
    setExpandedYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) {
        next.delete(year);
      } else {
        next.add(year);
      }
      return next;
    });
  }, []);

  const handleAmountEdit = useCallback((invoice: InvoiceSummary) => {
    if (invoice.send_status === 'sent') {
      Alert.alert('정산', '이미 전송 완료된 청구서는 금액을 수정할 수 없습니다.');
      return;
    }
    setAmountTargetInvoice(invoice);
    setAmountModalVisible(true);
  }, []);

  const handleMoveToTodayBilling = useCallback(async (invoice: InvoiceSummary) => {
    if (invoice.send_status === 'sent') {
      Alert.alert('정산', '이미 전송 완료된 청구서는 이동할 수 없습니다.');
      return;
    }

    Alert.alert(
      '오늘청구로 이동',
      `${invoice.student?.name || '수강생'}의 청구서를 오늘청구로 이동하시겠습니까?\n\n조기 청구 시 금액은 수동으로 조정할 수 있습니다.`,
      [
        {
          text: '취소',
          style: 'cancel',
        },
        {
          text: '이동',
          onPress: async () => {
            try {
              await invoicesApi.moveToTodayBilling(invoice.id);
              await fetchSections(true);
              Alert.alert('완료', '청구서가 오늘청구로 이동되었습니다.');
            } catch (error: any) {
              Alert.alert('오류', error?.response?.data?.message || error?.message || '청구서 이동에 실패했습니다.');
            }
          },
        },
      ],
    );
  }, [fetchSections]);

  const handleSendInvoice = useCallback(
    (invoices: InvoiceSummary[]) => {
      // 전송 가능 상태인 인보이스만
      const sendable = invoices.filter(
        (inv) => inv.send_status === 'not_sent' || inv.send_status === 'partial',
      );
      if (sendable.length === 0) {
        Alert.alert('청구', '전송할 청구서가 없습니다.');
        return;
      }

      // 선택된 항목이 있으면 선택만, 없으면 경고
      const selected = sendable.filter((inv) => selectedInvoiceIds.has(inv.id));
      if (selectedInvoiceIds.size > 0 && selected.length === 0) {
        Alert.alert('청구', '선택한 항목 중 전송 가능한 청구서가 없습니다.');
        return;
      }
      if (selectedInvoiceIds.size === 0) {
        Alert.alert('청구', '전송할 청구서를 선택하세요.');
        return;
      }

      // 선택된 청구서 ID 배열
      const selectedIds = Array.from(selectedInvoiceIds).filter(id => 
        selected.some(inv => inv.id === id)
      );

      // 바로 미리보기 화면으로 이동
      navigation.navigate('InvoicePreview', {
        invoiceIds: selectedIds,
        initialIndex: 0,
      });
    },
    [navigation, selectedInvoiceIds],
  );

  const getStatusLabel = (settlement: MonthlySettlement): string => {
    if (settlement.sendStatus === 'sent') {
      return '전송 완료';
    } else if (settlement.sendStatus === 'partial') {
      return `${settlement.notSentCount}명 미전송`;
    } else {
      return '작성 중';
    }
  };

  const getStatusColor = (settlement: MonthlySettlement): string => {
    if (settlement.sendStatus === 'sent') {
      return '#4CAF50'; // 초록색
    } else if (settlement.sendStatus === 'partial') {
      return '#1d42d8'; // 블루
    } else {
      return '#FF9800'; // 주황색
    }
  };

  const formatMonthTitle = (year: number, month: number): string => {
    return `${year}년 ${month}월 정산`;
  };

  const formatSummary = (settlement: MonthlySettlement): string => {
    if (settlement.sendStatus === 'sent') {
      return `${settlement.sentCount}명에게 보냄 · ${settlement.totalAmount.toLocaleString()}원`;
    } else if (settlement.sendStatus === 'partial') {
      return `청구 예정 ${settlement.notSentCount}명 · 합계 ${settlement.totalAmount.toLocaleString()}원`;
    } else {
      return `청구 예정 ${settlement.totalCount}명 · 합계 ${settlement.totalAmount.toLocaleString()}원`;
    }
  };

  // 뱃지 텍스트 변환
  const getBillingTypeLabel = useCallback((type: string) => {
    return type === 'prepaid' ? '선불' : type === 'postpaid' ? '후불' : type;
  }, []);

  const getAbsencePolicyLabel = useCallback((policy: string) => {
    if (policy === 'carry_over') return '회차이월';
    if (policy === 'deduct_next') return '차감';
    if (policy === 'vanish') return '소멸';
    return policy;
  }, []);

  const getAutoAdjustmentDetail = useCallback((invoice: InvoiceSummary): string | null => {
    if (!invoice) return null;
    if (invoice.auto_adjustment >= 0) return null;
    const policyPerSession = invoice.contract?.policy_snapshot?.per_session_amount;
    let perSession: number | null = null;
    if (typeof policyPerSession === 'number' && policyPerSession > 0) {
      perSession = policyPerSession;
    } else if (invoice.planned_count && invoice.planned_count > 0) {
      perSession = invoice.base_amount / invoice.planned_count;
    }
    if (!perSession || perSession <= 0) {
      return null;
    }
    const count = Math.round(Math.abs(invoice.auto_adjustment) / perSession);
    if (!count) return null;
    return `(결석 ${count}회 차감)`;
  }, []);

  // 횟수제: 정산중 섹션에서는 잔여회차 표시, 오늘청구 섹션에서는 빈 문자열 (PeriodText에서 표시)
  // 기간제: PeriodText로만 표시하도록 라벨은 비움
  const formatStudentInfo = (invoice: InvoiceSummary, isInProgress: boolean = false): string => {
    const policySnapshot = invoice.contract?.policy_snapshot as any;
    const totalSessions = typeof policySnapshot?.total_sessions === 'number' ? policySnapshot.total_sessions : 0;
    const isSessionBased = totalSessions > 0 && !invoice.contract?.ended_at;

    if (invoice.send_status === 'sent') return '';
    if (isSessionBased) {
      // 정산중 섹션: 잔여회차 표시
      if (isInProgress) {
        const sessionsUsed = invoice.contract?.sessions_used ?? 0;
        // 연장 정산서인 경우: target_sessions가 있으면 해당 연장의 회차를 사용
        // 연장 전 계약 종료 후 연장: target_sessions = 연장한 회차 (예: 5회)
        // 연장 전 계약 종료 전 연장: target_sessions가 없으면 전체 회차 사용
        const targetSessions = invoice.contract?.target_sessions ?? totalSessions;
        const remaining = Math.max(targetSessions - sessionsUsed, 0);
        return `잔여 ${remaining}회`;
      }
      // 오늘청구 섹션: PeriodText에서 "N월청구" 표시하므로 여기서는 빈 문자열 반환
      return '';
    }
    // 기간제는 PeriodText로 한 번만 표시
    return '';
  };

  // 연장 청구서인지 판단
  const isExtensionInvoice = useMemo(() => {
    // 모든 invoice를 수집
    const allInvoices: InvoiceSummary[] = [
      ...(sections?.todayBilling ?? []),
      ...(sections?.inProgress ?? []),
      ...(sections?.sentInvoices?.flatMap((group: any) => group.invoices ?? []) ?? []),
    ];
    
    // contract_id별로 invoice 그룹화
    const invoicesByContract = new Map<number, InvoiceSummary[]>();
    for (const inv of allInvoices) {
      if (!inv.contract_id) continue;
      if (!invoicesByContract.has(inv.contract_id)) {
        invoicesByContract.set(inv.contract_id, []);
      }
      invoicesByContract.get(inv.contract_id)!.push(inv);
    }
    
    // 각 contract_id별로 첫 번째 invoice가 아닌 것들을 연장 청구서로 판단
    const extensionInvoiceIds = new Set<number>();
    for (const [contractId, invoices] of invoicesByContract.entries()) {
      if (invoices.length > 1) {
        // id 기준으로 정렬 (id가 순차적이므로)
        const sorted = [...invoices].sort((a, b) => a.id - b.id);
        // 첫 번째를 제외한 나머지는 연장 청구서
        for (let i = 1; i < sorted.length; i++) {
          extensionInvoiceIds.add(sorted[i].id);
        }
      }
    }
    
    return extensionInvoiceIds;
  }, [sections]);

  // 연장 청구서인지 확인하는 함수
  const checkIsExtensionInvoice = useCallback((invoice: InvoiceSummary): boolean => {
    return isExtensionInvoice.has(invoice.id);
  }, [isExtensionInvoice]);

  // 청구서 기간 포맷팅 (뷰티앱: 오직 선불 횟수 계약 로직만 사용)
  const formatInvoicePeriod = (invoice: InvoiceSummary): string => {
    const policySnapshot = invoice.contract?.policy_snapshot as any;
    const totalSessions = typeof policySnapshot?.total_sessions === 'number' ? policySnapshot.total_sessions : 0;
    const isSessionBased = totalSessions > 0 && !invoice.contract?.ended_at; // 횟수권
    const isAmountBased = invoice.contract?.ended_at; // 금액권 (유효기간이 있음)
    const isExtension = checkIsExtensionInvoice(invoice);

    // 뷰티앱: 오직 선불 횟수 계약 로직만 사용
    if (isSessionBased) {
      // 횟수권: 전송한 청구서는 "(횟수)" 형식, 그 외는 "N월청구"
      if (invoice.send_status === 'sent' && invoice.display_period_start && invoice.display_period_end === '회') {
        const sessionCount = invoice.display_period_start;
        return `${invoice.month}월 (${sessionCount}회)${isExtension ? ' (연장)' : ''}`;
      }
      return `${invoice.month}월청구${isExtension ? ' (연장)' : ''}`;
    } else if (isAmountBased && invoice.contract?.started_at && invoice.contract?.ended_at) {
      // 금액권: 전송한 청구서는 display_period_start/display_period_end 사용, 그 외는 유효기간 표시
      if (invoice.send_status === 'sent' && invoice.display_period_start && invoice.display_period_end) {
        // 전송 시점에 저장된 표시 기간을 그대로 사용 (YYYY-MM-DD 형식)
        const parseStoredDate = (dateStr: string): { year: number; month: number; day: number } => {
          const [year, month, day] = dateStr.split('-').map(Number);
          return { year, month, day };
        };
        
        const startDate = parseStoredDate(invoice.display_period_start);
        const endDate = parseStoredDate(invoice.display_period_end);
        
        const startYearShort = String(startDate.year).slice(-2);
        const endYearShort = String(endDate.year).slice(-2);
        return `${invoice.month}월 (${startYearShort}.${startDate.month}.${startDate.day}일~${endYearShort}.${endDate.month}.${endDate.day}일)${isExtension ? ' (연장)' : ''}`;
      } else {
        // 전송 전: 유효기간(계약 시작일 ~ 계약 종료일) 표시
        const parseDate = (dateValue: Date | string): { year: number; month: number; day: number } => {
          const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
          return {
            year: date.getFullYear(),
            month: date.getMonth() + 1,
            day: date.getDate(),
          };
        };
        
        const startDate = parseDate(invoice.contract.started_at);
        const endDate = parseDate(invoice.contract.ended_at);
        
        const startYearShort = String(startDate.year).slice(-2);
        const endYearShort = String(endDate.year).slice(-2);
        return `${invoice.month}월 (${startYearShort}.${startDate.month}.${startDate.day}일~${endYearShort}.${endDate.month}.${endDate.day}일)${isExtension ? ' (연장)' : ''}`;
      }
    }
    
    return '';
  };

  const isLoading = invoicesStatus === 'loading' && !sections;


  return (
    <Container
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      <Header>
        <HeaderTitle>청구</HeaderTitle>
      </Header>

      {invoicesError ? (
        <ErrorBanner>
          <ErrorText>{invoicesError}</ErrorText>
          <RetryButton onPress={handleRetry}>
            <RetryButtonText>재시도</RetryButtonText>
          </RetryButton>
        </ErrorBanner>
      ) : null}

      {isLoading ? (
        <SkeletonGroup>
          {Array.from({ length: 2 }).map((_, index) => (
            <SkeletonCard key={index}>
              <SkeletonLine width="60%" />
              <SkeletonLine width="40%" />
            </SkeletonCard>
          ))}
        </SkeletonGroup>
      ) : (
        <SettlementsList>
          {/* 1. 오늘청구 섹션 */}
          <SectionBlock>
            <SectionHeaderBlock>
              <SectionBlockTitle>전송이 필요한 청구서</SectionBlockTitle>
            </SectionHeaderBlock>

            {todayBillingSettlement.totalCount === 0 ? (
              <EmptyContainerSmall>
                <EmptyStateImage source={emptyStateIcon} resizeMode="contain" />
                <EmptyTitle>전송 가능한 청구서가 없습니다.</EmptyTitle>
              </EmptyContainerSmall>
            ) : (
              <MonthlyCard>
                <MonthlyCardHeader>
                  <MonthlyCardHeaderLeft>
                    <MonthlyCardTitle>청구 대상</MonthlyCardTitle>
                    <MonthlyCardSummary>
                      전송할 청구서를 선택하세요.
                    </MonthlyCardSummary>
                  </MonthlyCardHeaderLeft>
                </MonthlyCardHeader>
                <MonthlyCardContent>
                  <SelectToolbar>
                    <SelectAllButton
                      onPress={() => {
                        setSelectedInvoiceIds((prev) => {
                          const next = new Set<number>(prev);
                          const allIds = todayBillingSettlement.invoices
                            .filter((i) => i && (i.send_status === 'not_sent' || i.send_status === 'partial'))
                            .map((i) => i.id)
                            .filter((id) => typeof id === 'number');
                          const allSelected = allIds.every((id) => next.has(id));
                          if (allSelected) {
                            allIds.forEach((id) => next.delete(id));
                          } else {
                            allIds.forEach((id) => next.add(id));
                          }
                          return next;
                        });
                      }}
                    >
                      <SelectAllButtonText>전체 선택/해제</SelectAllButtonText>
                    </SelectAllButton>
                  </SelectToolbar>
                  {todayBillingSettlement.invoices.map((invoice) => {
                    const isSendable = invoice.send_status === 'not_sent' || invoice.send_status === 'partial';
                    const checked = selectedInvoiceIds.has(invoice.id);
                    return (
                      <StudentItem key={invoice.id}>
                        <StudentItemLeft>
                          {isSendable ? (
                            <SelectCheckbox
                              disabled={!isSendable}
                              onPress={() => {
                                if (!isSendable) return;
                                setSelectedInvoiceIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(invoice.id)) next.delete(invoice.id);
                                  else next.add(invoice.id);
                                  return next;
                                });
                              }}
                            >
                              <CheckboxBox $checked={checked} $disabled={!isSendable}>
                                {checked ? <CheckboxMark>✓</CheckboxMark> : null}
                              </CheckboxBox>
                            </SelectCheckbox>
                          ) : null}
                          <StudentTexts>
                            <StudentName>{invoice.student?.name || '이름 없음'}</StudentName>
                            <StudentInfo>{formatStudentInfo(invoice)}</StudentInfo>
                            {formatInvoicePeriod(invoice) && (
                              <PeriodText>{formatInvoicePeriod(invoice)}</PeriodText>
                            )}
                          </StudentTexts>
                        </StudentItemLeft>
                        <StudentItemRight>
                          <StudentAmount>{invoice.final_amount.toLocaleString()}원</StudentAmount>
                          {invoice.send_status === 'sent' ? (
                            <SmallStatusTag $type="sent">전송 완료</SmallStatusTag>
                          ) : (
                            <AmountEditButton onPress={() => handleAmountEdit(invoice)}>
                              <AmountEditButtonText>상세금액</AmountEditButtonText>
                            </AmountEditButton>
                          )}
                        </StudentItemRight>
                      </StudentItem>
                    );
                  })}
                  {todayBillingSettlement.sendStatus !== 'sent' && (
                    <SendInvoiceButton
                      onPress={() => handleSendInvoice(todayBillingSettlement.invoices)}
                      disabled={selectedInvoiceIds.size === 0}
                    >
                      <SendInvoiceButtonText>
                        청구서 전송
                      </SendInvoiceButtonText>
                    </SendInvoiceButton>
                  )}
                </MonthlyCardContent>
              </MonthlyCard>
            )}
          </SectionBlock>

          {/* 2. 정산중 섹션 - 뷰티앱에서는 숨김 처리 (선불 횟수 계약 로직만 사용) */}
          {false && (
          <SectionBlock>
            <SectionHeaderBlock>
              <SectionBlockTitle>정산중인 정산서</SectionBlockTitle>
            </SectionHeaderBlock>

            {inProgressSettlement.totalCount === 0 ? (
              <EmptyContainerSmall>
                <EmptyTitle>정산 중인 내역이 없습니다.</EmptyTitle>
                <EmptyDescription>출결이 반영되는 진행 중인 청구서가 여기 표시됩니다.</EmptyDescription>
              </EmptyContainerSmall>
            ) : (
              <MonthlyCard>
                <MonthlyCardHeader>
                  <MonthlyCardHeaderLeftRight>
                    <MonthlyCardSummaryRight>
                      {inProgressSettlement.totalCount}명 · 합계 {inProgressSettlement.totalAmount.toLocaleString()}원
                    </MonthlyCardSummaryRight>
                  </MonthlyCardHeaderLeftRight>
                </MonthlyCardHeader>
                <MonthlyCardContent>
                  {inProgressSettlement.invoices.map((invoice) => {
                    const contract = invoice.contract;
                    return (
                    <StudentItem key={invoice.id}>
                      <StudentItemLeft>
                        <StudentTexts>
                          <StudentNameContainer>
                            <StudentName>{invoice.student?.name || '이름 없음'}</StudentName>
                            {contract && (
                              <BadgeContainer>
                                <Badge billingType>
                                  <BadgeText>{getBillingTypeLabel(contract.billing_type)}</BadgeText>
                                </Badge>
                                {contract.absence_policy && (
                                  <Badge absencePolicy>
                                    <BadgeText absencePolicy>
                                      {getAbsencePolicyLabel(contract.absence_policy)}
                                    </BadgeText>
                                  </Badge>
                                )}
                              </BadgeContainer>
                            )}
                          </StudentNameContainer>
                          <StudentInfo>{formatStudentInfo(invoice, true)}</StudentInfo>
                          {formatInvoicePeriod(invoice) && (
                            <PeriodText>{formatInvoicePeriod(invoice)}</PeriodText>
                          )}
                        </StudentTexts>
                      </StudentItemLeft>
                      <StudentItemRight>
                        <StudentAmount>{invoice.final_amount.toLocaleString()}원</StudentAmount>
                        <ButtonRow>
                          <MoveToTodayButton onPress={() => handleMoveToTodayBilling(invoice)}>
                            <MoveToTodayButtonText>바로청구</MoveToTodayButtonText>
                          </MoveToTodayButton>
                          <AmountEditButton onPress={() => handleAmountEdit(invoice)}>
                            <AmountEditButtonText>정산내역</AmountEditButtonText>
                          </AmountEditButton>
                        </ButtonRow>
                      </StudentItemRight>
                    </StudentItem>
                    );
                  })}
                </MonthlyCardContent>
              </MonthlyCard>
            )}
          </SectionBlock>
          )}

          {/* 3. 전송한 청구서 섹션 */}
          <SectionBlock>
            <SectionHeaderBlock>
              <SectionBlockTitle>전송 완료한 청구서</SectionBlockTitle>
            </SectionHeaderBlock>

            {sentYears.length === 0 ? (
              <EmptyContainerSmall>
                <EmptyStateImage source={empty1StateIcon} resizeMode="contain" />
                <EmptyTitle>전송 완료한 청구서가 없습니다.</EmptyTitle>
                <EmptyDescription>전송한 청구서는 고객 카드에서도 확인 할 수 있습니다.</EmptyDescription>
              </EmptyContainerSmall>
            ) : (
              sentYears.map((year) => {
                const yearSettlements = sentSettlementsByYear.get(year) ?? [];
                const isYearExpanded = expandedYears.has(year);
                return (
                  <YearCard key={year}>
                    <YearCardHeader onPress={() => toggleYear(year)}>
                      <YearCardHeaderLeft>
                        <YearCardTitle>{year}년</YearCardTitle>
                      </YearCardHeaderLeft>
                      <YearCardHeaderRight>
                        <ExpandIcon>{isYearExpanded ? '▴' : '▾'}</ExpandIcon>
                      </YearCardHeaderRight>
                    </YearCardHeader>

                    {isYearExpanded && (
                      <YearCardContent>
                        {yearSettlements.map((settlement) => {
                          const monthKey = `${settlement.year}-${settlement.month}`;
                          const isExpanded = expandedMonths.has(monthKey);
                          return (
                            <MonthlyCard key={monthKey}>
                              <MonthlyCardHeader onPress={() => toggleMonth(monthKey)}>
                                <MonthlyCardHeaderLeft>
                                  <MonthlyCardTitle>
                                    {settlement.month}월 전송 완료한 청구서
                                  </MonthlyCardTitle>
                                  <MonthlyCardSummary>{formatSummary(settlement)}</MonthlyCardSummary>
                                </MonthlyCardHeaderLeft>
                                <MonthlyCardHeaderRight>
                                  <StatusTag $color={getStatusColor(settlement)}>
                                    {getStatusLabel(settlement)}
                                  </StatusTag>
                                  <ExpandIcon>{isExpanded ? '▴' : '▾'}</ExpandIcon>
                                </MonthlyCardHeaderRight>
                              </MonthlyCardHeader>

                              {isExpanded && (
                                <MonthlyCardContent>
                                  {settlement.invoices.map((invoice) => (
                                    <StudentItem key={invoice.id}>
                                      <StudentItemLeft>
                                        <StudentTexts>
                                          <StudentName>{invoice.student?.name || '이름 없음'}</StudentName>
                                          {/* 전송한 청구서는 본문 라벨/기간 생략 */}
                                        </StudentTexts>
                                      </StudentItemLeft>
                                      <StudentItemRight>
                                        <StudentAmount>{invoice.final_amount.toLocaleString()}원</StudentAmount>
                                      </StudentItemRight>
                                    </StudentItem>
                                  ))}
                                </MonthlyCardContent>
                              )}
                            </MonthlyCard>
                          );
                        })}
                      </YearCardContent>
                    )}
                  </YearCard>
                );
              })
            )}
          </SectionBlock>
        </SettlementsList>
      )}
      {/* 금액 수정 모달 */}
      {amountTargetInvoice ? (
        <InvoiceAmountModal
          visible={amountModalVisible}
          onClose={() => setAmountModalVisible(false)}
          onConfirm={async () => {
            await fetchSections(true);
          }}
          invoiceId={amountTargetInvoice.id}
          currentAmount={amountTargetInvoice.final_amount}
          baseAmount={amountTargetInvoice.base_amount}
          autoAdjustment={amountTargetInvoice.auto_adjustment}
          manualAdjustment={amountTargetInvoice.manual_adjustment}
          autoAdjustmentDetail={getAutoAdjustmentDetail(amountTargetInvoice)}
        />
      ) : null}
    </Container>
  );
}

const Container = styled.ScrollView`
  flex: 1;
  background-color: #f5f5f5;
`;

const Header = styled.View`
  padding: 20px 16px 16px;
  background-color: #303643;
`;

const HeaderTitle = styled.Text`
  font-size: 24px;
  font-weight: 700;
  color: #ffffff;
  margin-bottom: 4px;
`;

const HeaderSubtitle = styled.Text`
  font-size: 14px;
  color: #666666;
`;

const ErrorBanner = styled.View`
  background-color: #ffeef0;
  border-radius: 12px;
  padding: 12px 16px;
  margin: 16px;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
`;

const ErrorText = styled.Text`
  color: #a94442;
  font-size: 14px;
  flex: 1;
  margin-right: 12px;
`;

const RetryButton = styled.TouchableOpacity`
  padding: 6px 12px;
  border-radius: 8px;
  background-color: #ff6b00;
`;

const RetryButtonText = styled.Text`
  color: #ffffff;
  font-size: 13px;
  font-weight: 600;
`;

const SkeletonGroup = styled.View`
  padding: 16px;
  gap: 12px;
`;

const SkeletonCard = styled.View`
  background-color: #f5f6f8;
  border-radius: 12px;
  padding: 16px;
`;

const SkeletonLine = styled.View<{ width: string }>`
  height: 14px;
  border-radius: 6px;
  background-color: #e1e4ea;
  margin-bottom: 10px;
  width: ${(props) => props.width};
`;

const EmptyContainer = styled.View`
  align-items: center;
  padding: 48px 16px;
  gap: 8px;
`;

const EmptyContainerSmall = styled.View`
  align-items: center;
  padding: 48px 16px;
  gap: 8px;
  background-color: #ffffff;
  border-radius: 16px;
  border-width: 1px;
  border-color: #f1f1f1;
  min-height: 200px;
  justify-content: center;
`;

const EmptyStateImage = styled.Image`
  width: 48px;
  height: 48px;
  opacity: 0.5;
  margin-bottom: 8px;
`;

const EmptyTitle = styled.Text`
  font-size: 16px;
  font-weight: 700;
  color: #222222;
`;

const EmptyDescription = styled.Text`
  font-size: 14px;
  color: #666666;
  text-align: center;
  margin-bottom: 16px;
`;

const PrimaryButton = styled.TouchableOpacity`
  padding: 12px 24px;
  border-radius: 10px;
  background-color: #1d42d8;
  align-items: center;
`;

const PrimaryButtonText = styled.Text`
  color: #ffffff;
  font-size: 15px;
  font-weight: 600;
`;

const SecondaryButton = styled.TouchableOpacity`
  padding: 12px 24px;
  border-radius: 10px;
  background-color: #f0f0f0;
  align-items: center;
`;

const SecondaryButtonText = styled.Text`
  color: #111111;
  font-size: 15px;
  font-weight: 600;
`;

const SettlementsList = styled.View`
  padding: 16px;
  gap: 24px;
`;

const SectionBlock = styled.View`
  gap: 12px;
`;

const SectionHeaderBlock = styled.View`
  gap: 4px;
`;

const SectionBlockTitle = styled.Text`
  font-size: 18px;
  font-weight: 700;
  color: #111111;
`;

const SectionBlockSubtitle = styled.Text`
  font-size: 14px;
  color: #666666;
`;

const YearCard = styled.View`
  background-color: #ffffff;
  border-radius: 16px;
  overflow: hidden;
  margin-bottom: 12px;
`;

const YearCardHeader = styled.TouchableOpacity`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background-color: #f8f9fa;
`;

const YearCardHeaderLeft = styled.View`
  flex: 1;
  margin-right: 12px;
`;

const YearCardTitle = styled.Text`
  font-size: 20px;
  font-weight: 700;
  color: #111111;
`;

const YearCardHeaderRight = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 8px;
`;

const YearCardContent = styled.View`
  padding: 12px;
  gap: 12px;
`;

const MonthlyCard = styled.View`
  background-color: #ffffff;
  border-radius: 16px;
  overflow: hidden;
  border-width: 1px;
  border-color: #f1f1f1;
`;

const MonthlyCardHeader = styled.TouchableOpacity`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
`;

const MonthlyCardHeaderLeft = styled.View`
  flex: 1;
  margin-right: 12px;
`;

const MonthlyCardHeaderLeftRight = styled.View`
  flex: 1;
  margin-right: 12px;
  align-items: flex-end;
`;

const MonthlyCardTitle = styled.Text`
  font-size: 18px;
  font-weight: 700;
  color: #111111;
  margin-bottom: 4px;
`;

const MonthlyCardSummary = styled.Text`
  font-size: 14px;
  color: #666666;
`;

const MonthlyCardSummaryRight = styled.Text`
  font-size: 18px;
  font-weight: 700;
  color: #111111;
`;

const MonthlyCardHeaderRight = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 8px;
`;

const StatusTag = styled.Text<{ $color: string }>`
  padding: 4px 12px;
  border-radius: 12px;
  background-color: ${(props) => props.$color}20;
  color: ${(props) => props.$color};
  font-size: 12px;
  font-weight: 600;
`;

const ExpandIcon = styled.Text`
  font-size: 16px;
  color: #666666;
  margin-left: 4px;
`;

const MonthlyCardContent = styled.View`
  padding: 0 16px 16px;
  border-top-width: 1px;
  border-top-color: #f0f0f0;
`;

const StudentItem = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: flex-start;
  padding: 16px 0;
  border-bottom-width: 1px;
  border-bottom-color: #f0f0f0;
`;

const StudentItemLeft = styled.View`
  flex: 1;
  margin-right: 12px;
  flex-direction: row;
  align-items: flex-start;
  gap: 10px;
`;

const StudentTexts = styled.View`
  flex: 1;
`;

const SelectToolbar = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0 4px;
`;

const SelectAllButton = styled.TouchableOpacity`
  padding: 6px 10px;
  border-radius: 8px;
  background-color: #eef2ff;
`;

const SelectAllButtonText = styled.Text`
  color: #1d42d8;
  font-size: 12px;
  font-weight: 600;
`;

const SelectedCount = styled.Text`
  font-size: 12px;
  color: #666666;
`;

const SelectCheckbox = styled.TouchableOpacity<{ disabled?: boolean }>`
  padding-top: 2px;
  opacity: ${(props) => (props.disabled ? 0.5 : 1)};
`;

const CheckboxBox = styled.View<{ $checked: boolean; $disabled?: boolean }>`
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border-width: 1px;
  border-color: ${(props) => (props.$checked ? '#1d42d8' : '#cccccc')};
  background-color: ${(props) =>
    props.$disabled ? '#f0f0f0' : props.$checked ? '#eef2ff' : '#ffffff'};
  align-items: center;
  justify-content: center;
`;

const CheckboxMark = styled.Text`
  color: #1d42d8;
  font-size: 14px;
  line-height: 20px;
  text-align: center;
`;

const StudentNameContainer = styled.View`
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 4px;
`;

const StudentName = styled.Text`
  font-size: 16px;
  font-weight: 700;
  color: #111111;
`;

const BadgeContainer = styled.View`
  flex-direction: row;
  gap: 6px;
`;

const Badge = styled.View<{ billingType?: boolean; absencePolicy?: boolean }>`
  padding: 4px 8px;
  background-color: ${(props) => (props.billingType ? '#e8f2ff' : '#f0f8f0')};
  border-radius: 12px;
`;

const BadgeText = styled.Text<{ absencePolicy?: boolean }>`
  font-size: 11px;
  color: ${(props) => (props.absencePolicy ? '#34c759' : '#246bfd')};
  font-weight: 600;
`;

const StudentInfo = styled.Text`
  font-size: 12px;
  color: #999999;
  line-height: 18px;
`;

const PeriodText = styled.Text`
  font-size: 12px;
  color: #999999;
  margin-top: 2px;
`;

const StudentItemRight = styled.View`
  align-items: flex-end;
`;

const StudentAmount = styled.Text`
  font-size: 16px;
  font-weight: 700;
  color: #111111;
  margin-bottom: 4px;
`;

const ButtonRow = styled.View`
  flex-direction: row;
  gap: 8px;
  align-items: center;
`;

const MoveToTodayButton = styled.TouchableOpacity`
  padding: 4px 8px;
  background-color: transparent;
  border-radius: 6px;
`;

const MoveToTodayButtonText = styled.Text`
  font-size: 12px;
  color: #1d42d8;
  font-weight: 600;
`;

const AmountEditButton = styled.TouchableOpacity`
  padding: 4px 0;
`;

const AmountEditButtonText = styled.Text`
  font-size: 12px;
  color: #e53935;
  font-weight: 700;
`;

const SmallStatusTag = styled.Text<{ $type: 'sent' }>`
  padding: 4px 8px;
  border-radius: 8px;
  background-color: #e8f5e9;
  color: #2e7d32;
  font-size: 11px;
  font-weight: 700;
`;

const SendInvoiceButton = styled.TouchableOpacity<{ disabled?: boolean }>`
  margin-top: 16px;
  padding: 14px;
  border-radius: 10px;
  background-color: ${(props) => (props.disabled ? '#c7d2fe' : '#1d42d8')};
  align-items: center;
`;

const SendInvoiceButtonText = styled.Text`
  color: #ffffff;
  font-size: 16px;
  font-weight: 600;
`;

const ModalOverlay = styled.TouchableOpacity`
  flex: 1;
  background-color: rgba(0, 0, 0, 0.4);
  justify-content: center;
  align-items: center;
  padding: 24px;
`;

const ModalContent = styled.View`
  width: 100%;
  max-width: 420px;
  background-color: #ffffff;
  border-radius: 12px;
  padding: 20px;
  gap: 12px;
`;

const ModalTitle = styled.Text`
  font-size: 18px;
  font-weight: 700;
  color: #111111;
  margin-bottom: 4px;
`;

const ModalRow = styled.Text`
  font-size: 15px;
  color: #333333;
`;

const ModalStrong = styled.Text`
  color: #ff6b00;
  font-weight: 700;
`;

const ModalButtons = styled.View`
  margin-top: 8px;
  flex-direction: row;
  justify-content: flex-end;
  gap: 8px;
`;
