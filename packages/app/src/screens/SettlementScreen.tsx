import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, Modal } from 'react-native';
import styled from 'styled-components/native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { featureFlags } from '../config/features';
import InvoiceAmountModal from '../components/modals/InvoiceAmountModal';
import { useInvoicesStore } from '../store/useInvoicesStore';
import { useAuthStore } from '../store/useStore';
import { InvoiceHistoryGroup, InvoiceSummary, MonthlySettlement } from '../types/invoices';
import { SettlementStackNavigationProp } from '../navigation/AppNavigator';

const ContractsStub = () => (
  <StubContainer>
    <StubTitle>계약/정산</StubTitle>
    <StubDescription>STEP 2: 네비게이션 테스트</StubDescription>
  </StubContainer>
);

export default function SettlementScreen() {
  if (featureFlags.contracts.useStub || featureFlags.settlements.useStub) {
    return <ContractsStub />;
  }

  return <SettlementContent />;
}

function SettlementContent() {
  const navigation = useNavigation<SettlementStackNavigationProp>();
  const [refreshing, setRefreshing] = useState(false);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<number>>(new Set()); // 개별 선택 (기본 OFF)
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [amountModalVisible, setAmountModalVisible] = useState(false);
  const [amountTargetInvoice, setAmountTargetInvoice] = useState<InvoiceSummary | null>(null);
  const invoicesRequestedRef = useRef(false);

  const fetchSections = useInvoicesStore((state) => state.fetchSections);
  const updateInvoice = useInvoicesStore((state) => state.updateInvoice);
  const sections = useInvoicesStore((state) => state.sections);
  const invoicesStatus = useInvoicesStore((state) => state.status);
  const invoicesError = useInvoicesStore((state) => state.errorMessage);
  const invoicesLoaded = useInvoicesStore((state) => state._loadedOnce);
  const invoicesInFlight = useInvoicesStore((state) => state._inFlight);

  // 현재 날짜 기준으로 이번 달 키 생성
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentMonthKey = `${currentYear}-${currentMonth}`;

  // 초기 로드
  useFocusEffect(
    useCallback(() => {
      // 인증 상태 확인
      const isAuthenticated = useAuthStore.getState().isAuthenticated;
      if (!isAuthenticated) {
        return;
      }

      if (!invoicesLoaded && !invoicesRequestedRef.current) {
        invoicesRequestedRef.current = true;
        fetchSections(true).catch((error: any) => {
          console.error('[Invoices] error initial', error?.message);
        });
      }
    }, [invoicesLoaded, fetchSections]),
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

  const handleSendInvoice = useCallback(
    (invoices: InvoiceSummary[]) => {
      // 전송 가능 상태인 인보이스만
      const sendable = invoices.filter(
        (inv) => inv.send_status === 'not_sent' || inv.send_status === 'partial',
      );
      if (sendable.length === 0) {
        Alert.alert('정산', '전송할 청구서가 없습니다.');
        return;
      }

      // 선택된 항목이 있으면 선택만, 없으면 경고
      const selected = sendable.filter((inv) => selectedInvoiceIds.has(inv.id));
      if (selectedInvoiceIds.size > 0 && selected.length === 0) {
        Alert.alert('정산', '선택한 항목 중 전송 가능한 청구서가 없습니다.');
        return;
      }
      if (selectedInvoiceIds.size === 0) {
        Alert.alert('정산', '전송할 대상을 선택하세요.');
        return;
      }

      // 전송 전 확인 모달 표시
      setShowConfirmModal(true);
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

  const formatStudentInfo = (invoice: InvoiceSummary): string => {
    const parts: string[] = [];
    const contract = invoice.contract;

    // 계약 정보 (billing_type과 absence_policy는 뱃지로 표시하므로 제거)
    if (contract?.subject) {
      parts.push(`월 ${invoice.base_amount.toLocaleString()}`);
    }

    return parts.join(' · ');
  };

  // 청구서 기간 포맷팅 (예: "12월분 (11월 15일~12월 15일)")
  const formatInvoicePeriod = (invoice: InvoiceSummary): string => {
    if (!invoice.period_start || !invoice.period_end) {
      return `${invoice.month}월분`;
    }

    const startDate = new Date(invoice.period_start);
    const endDate = new Date(invoice.period_end);
    const startMonth = startDate.getMonth() + 1;
    const startDay = startDate.getDate();
    const endMonth = endDate.getMonth() + 1;
    const endDay = endDate.getDate();

    return `${invoice.month}월분 (${startMonth}월 ${startDay}일~${endMonth}월 ${endDay}일)`;
  };

  const isLoading = invoicesStatus === 'loading' && !invoicesLoaded;

  // 선택된(전송 가능) 인보이스와 합계 계산 (오늘청구 + 정산중에서 선택된 것)
  const selectedSendableInvoices = useMemo(() => {
    const ids = selectedInvoiceIds;
    const allSendable = [
      ...(sections?.todayBilling ?? []),
      ...(sections?.inProgress ?? []),
    ].filter((inv) => ids.has(inv.id) && (inv.send_status === 'not_sent' || inv.send_status === 'partial'));
    return allSendable;
  }, [sections?.todayBilling, sections?.inProgress, selectedInvoiceIds]);
  const selectedCount = selectedSendableInvoices.length;
  const selectedSum = selectedSendableInvoices.reduce((sum, inv) => sum + (inv.final_amount ?? 0), 0);

  const handleConfirmSendNow = useCallback(() => {
    if (selectedCount === 0) {
      setShowConfirmModal(false);
      return;
    }
    navigation.navigate('SettlementSend', {
      invoiceIds: selectedSendableInvoices.map((inv) => inv.id),
      year: currentYear,
      month: currentMonth,
    });
    setShowConfirmModal(false);
  }, [navigation, selectedCount, selectedSendableInvoices, currentYear, currentMonth]);

  return (
    <Container
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      <Header>
        <HeaderTitle>정산</HeaderTitle>
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
              <SectionBlockTitle>오늘청구</SectionBlockTitle>
            </SectionHeaderBlock>

            {todayBillingSettlement.totalCount === 0 ? (
              <EmptyContainerSmall>
                <EmptyTitle>오늘 청구할 내역이 없습니다.</EmptyTitle>
                <EmptyDescription>청구일이 도래한 청구서가 여기 표시됩니다.</EmptyDescription>
              </EmptyContainerSmall>
            ) : (
              <MonthlyCard>
                <MonthlyCardHeader>
                  <MonthlyCardHeaderLeft>
                    <MonthlyCardTitle>청구 대상</MonthlyCardTitle>
                    <MonthlyCardSummary>
                      {todayBillingSettlement.totalCount}명 · 합계 {todayBillingSettlement.totalAmount.toLocaleString()}원
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
                    <SelectedCount>선택 {selectedInvoiceIds.size}명</SelectedCount>
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
                            {invoice.period_start && invoice.period_end && (
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
                              <AmountEditButtonText>정산내역</AmountEditButtonText>
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
                        {selectedInvoiceIds.size === 0 ? '대상 선택 후 전송' : '청구서 전송'}
                      </SendInvoiceButtonText>
                    </SendInvoiceButton>
                  )}
                </MonthlyCardContent>
              </MonthlyCard>
            )}
          </SectionBlock>

          {/* 2. 정산중 섹션 */}
          <SectionBlock>
            <SectionHeaderBlock>
              <SectionBlockTitle>정산중</SectionBlockTitle>
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
                          <StudentInfo>{formatStudentInfo(invoice)}</StudentInfo>
                          {invoice.period_start && invoice.period_end && (
                            <PeriodText>{formatInvoicePeriod(invoice)}</PeriodText>
                          )}
                        </StudentTexts>
                      </StudentItemLeft>
                      <StudentItemRight>
                        <StudentAmount>{invoice.final_amount.toLocaleString()}원</StudentAmount>
                        <AmountEditButton onPress={() => handleAmountEdit(invoice)}>
                          <AmountEditButtonText>정산내역</AmountEditButtonText>
                        </AmountEditButton>
                      </StudentItemRight>
                    </StudentItem>
                    );
                  })}
                </MonthlyCardContent>
              </MonthlyCard>
            )}
          </SectionBlock>

          {/* 3. 전송한 청구서 섹션 */}
          <SectionBlock>
            <SectionHeaderBlock>
              <SectionBlockTitle>전송한 청구서</SectionBlockTitle>
            </SectionHeaderBlock>

            {sentYears.length === 0 ? (
              <EmptyContainerSmall>
                <EmptyTitle>전송한 청구서가 없습니다.</EmptyTitle>
                <EmptyDescription>전송 완료된 청구서가 여기 표시됩니다.</EmptyDescription>
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
                                    {settlement.month}월 정산
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
                                          <StudentInfo>{formatStudentInfo(invoice)}</StudentInfo>
                                          {invoice.period_start && invoice.period_end && (
                                            <PeriodText>{formatInvoicePeriod(invoice)}</PeriodText>
                                          )}
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
      {/* 전송 전 확인 모달 */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <ModalOverlay onPress={() => setShowConfirmModal(false)}>
          <ModalContent onStartShouldSetResponder={() => true}>
            <ModalTitle>전송 대상 확인</ModalTitle>
            <ModalRow>
              선택 인원 <ModalStrong>{selectedCount}명</ModalStrong>
            </ModalRow>
            <ModalRow>
              합계 금액 <ModalStrong>{selectedSum.toLocaleString()}원</ModalStrong>
            </ModalRow>
            <ModalButtons>
              <SecondaryButton onPress={() => setShowConfirmModal(false)}>
                <SecondaryButtonText>취소</SecondaryButtonText>
              </SecondaryButton>
              <PrimaryButton onPress={handleConfirmSendNow} disabled={selectedCount === 0}>
                <PrimaryButtonText>전송하기</PrimaryButtonText>
              </PrimaryButton>
            </ModalButtons>
          </ModalContent>
        </ModalOverlay>
      </Modal>
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
  background-color: #0f1b4d;
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
  padding: 32px 16px;
  gap: 8px;
  background-color: #ffffff;
  border-radius: 16px;
  border-width: 1px;
  border-color: #f1f1f1;
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
  background-color: #ff6b00;
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
  font-size: 20px;
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
  background-color: #f8f9fa;
  border-radius: 12px;
  overflow: hidden;
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
  font-size: 13px;
  color: #666666;
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

const AmountEditButton = styled.TouchableOpacity`
  padding: 4px 0;
`;

const AmountEditButtonText = styled.Text`
  font-size: 12px;
  color: #1d42d8;
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
const StubContainer = styled.View`
  flex: 1;
  justify-content: center;
  align-items: center;
  background-color: #f5f5f5;
`;

const StubTitle = styled.Text`
  font-size: 24px;
  font-weight: bold;
  color: #000;
  margin-bottom: 10px;
`;

const StubDescription = styled.Text`
  font-size: 16px;
  color: #666;
`;
