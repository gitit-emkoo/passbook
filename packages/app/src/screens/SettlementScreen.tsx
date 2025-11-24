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
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<number>>(new Set()); // 개별 선택 (기본 OFF)
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [amountModalVisible, setAmountModalVisible] = useState(false);
  const [amountTargetInvoice, setAmountTargetInvoice] = useState<InvoiceSummary | null>(null);
  const invoicesRequestedRef = useRef(false);

  const fetchCurrentMonth = useInvoicesStore((state) => state.fetchCurrentMonth);
  const updateInvoice = useInvoicesStore((state) => state.updateInvoice);
  const currentMonthInvoices = useInvoicesStore((state) => state.currentMonthInvoices);
  const historyMonths = useInvoicesStore((state) => state.historyMonths);
  const invoicesStatus = useInvoicesStore((state) => state.status);
  const invoicesError = useInvoicesStore((state) => state.errorMessage);
  const invoicesLoaded = useInvoicesStore((state) => state._loadedOnce);
  const invoicesInFlight = useInvoicesStore((state) => state._inFlight);

  // 현재 날짜 기준으로 이번 달 키 생성
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentMonthKey = `${currentYear}-${currentMonth}`;

  // 초기 로드 시 이번 달은 펼침
  useFocusEffect(
    useCallback(() => {
      // 인증 상태 확인
      const isAuthenticated = useAuthStore.getState().isAuthenticated;
      if (!isAuthenticated) {
        return;
      }

      if (!invoicesLoaded && !invoicesRequestedRef.current) {
        invoicesRequestedRef.current = true;
        setExpandedMonths(new Set([currentMonthKey]));
        fetchCurrentMonth({ historyMonths: 3 }).catch((error: any) => {
          console.error('[Invoices] error initial', error?.message);
        });
      }
    }, [invoicesLoaded, currentMonthKey, fetchCurrentMonth]),
  );

  // 기본 접힘 방지: 현재 달은 기본 펼침으로 보장
  React.useEffect(() => {
    setExpandedMonths((prev) => {
      if (prev.has(currentMonthKey)) return prev;
      const next = new Set(prev);
      if (next.size === 0) {
        next.add(currentMonthKey);
      }
      return next;
    });
  }, [currentMonthKey]);

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

  const currentSettlement = useMemo<MonthlySettlement>(() => {
    const invoices = currentMonthInvoices;
    const group: InvoiceHistoryGroup = {
      year: currentMonthInvoices[0]?.year ?? currentYear,
      month: currentMonthInvoices[0]?.month ?? currentMonth,
      invoices,
    };
    return calculateSettlement(group);
  }, [calculateSettlement, currentMonthInvoices, currentMonth, currentYear]);

  const historySettlements = useMemo<MonthlySettlement[]>(() => {
    return historyMonths.map((group) => calculateSettlement(group));
  }, [calculateSettlement, historyMonths]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchCurrentMonth({ historyMonths: 3 });
    } catch (error: any) {
      console.error('[Invoices] refresh error', error?.message);
    } finally {
      setRefreshing(false);
    }
  }, [fetchCurrentMonth]);

  const handleRetry = useCallback(async () => {
    try {
      await fetchCurrentMonth();
      Alert.alert('정산', '정산 목록을 다시 불러왔습니다.');
    } catch (error: any) {
      Alert.alert('정산', error?.message ?? '정산 목록을 불러오지 못했습니다.');
    }
  }, [fetchCurrentMonth]);

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

  const handleAmountEdit = useCallback((invoice: InvoiceSummary) => {
    if (invoice.send_status === 'sent') {
      Alert.alert('정산', '이미 전송 완료된 청구서는 금액을 수정할 수 없습니다.');
      return;
    }
    setAmountTargetInvoice(invoice);
    setAmountModalVisible(true);
  }, []);

  const handleSendInvoice = useCallback(
    (monthlySettlement: MonthlySettlement) => {
      // 전송 가능 상태인 인보이스만
      const sendable = monthlySettlement.invoices.filter(
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
      return '#FFC107'; // 노란색
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

    // 계약 정보
    if (contract?.subject) {
      const billingLabel = contract.billing_type === 'prepaid' ? '선불' : contract.billing_type === 'postpaid' ? '후불' : '';
      // 차감으로 통일
      const absenceLabel = contract.absence_policy === 'carry_over' ? '회차 이월' : 
                          contract.absence_policy === 'deduct_next' ? '차감' : 
                          contract.absence_policy === 'vanish' ? '소멸' : '';
      
      if (billingLabel && absenceLabel) {
        parts.push(`월 ${invoice.base_amount.toLocaleString()} · ${billingLabel}/${absenceLabel}`);
      } else if (billingLabel) {
        parts.push(`월 ${invoice.base_amount.toLocaleString()} · ${billingLabel}`);
      } else {
        parts.push(`월 ${invoice.base_amount.toLocaleString()}`);
      }
    }

    return parts.join(' · ');
  };

  const isCurrentEmpty = currentSettlement.totalCount === 0;
  const isHistoryEmpty = historySettlements.length === 0;
  const isLoading = invoicesStatus === 'loading' && !invoicesLoaded;

  // 선택된(전송 가능) 인보이스와 합계 계산
  const selectedSendableInvoices = useMemo(() => {
    const ids = selectedInvoiceIds;
    return currentSettlement.invoices.filter(
      (inv) => ids.has(inv.id) && (inv.send_status === 'not_sent' || inv.send_status === 'partial'),
    );
  }, [currentSettlement.invoices, selectedInvoiceIds]);
  const selectedCount = selectedSendableInvoices.length;
  const selectedSum = selectedSendableInvoices.reduce((sum, inv) => sum + (inv.final_amount ?? 0), 0);

  const handleConfirmSendNow = useCallback(() => {
    if (selectedCount === 0) {
      setShowConfirmModal(false);
      return;
    }
    navigation.navigate('SettlementSend', {
      invoiceIds: selectedSendableInvoices.map((inv) => inv.id),
      year: currentSettlement.year,
      month: currentSettlement.month,
    });
    setShowConfirmModal(false);
  }, [navigation, selectedCount, selectedSendableInvoices, currentSettlement.year, currentSettlement.month]);

  // 전송 완료 항목을 하단으로 정렬
  const orderedCurrentInvoices = useMemo(() => {
    const list = [...currentSettlement.invoices];
    return list.sort((a, b) => {
      const rank = (s: InvoiceSummary['send_status']) =>
        s === 'sent' ? 2 : s === 'partial' ? 1 : 0; // not_sent(0) < partial(1) < sent(2)
      const ra = rank(a.send_status);
      const rb = rank(b.send_status);
      if (ra !== rb) return ra - rb;
      return a.id - b.id; // 안정적 정렬
    });
  }, [currentSettlement.invoices]);

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
          <SectionBlock>
            <SectionHeaderBlock>
              <SectionBlockTitle>이번 달 정산</SectionBlockTitle>
            </SectionHeaderBlock>

            <MonthlyCard>
              <MonthlyCardHeader onPress={() => toggleMonth(currentMonthKey)}>
                <MonthlyCardHeaderLeft>
                  <MonthlyCardTitle>
                    {formatMonthTitle(currentSettlement.year, currentSettlement.month)}
                  </MonthlyCardTitle>
                  <MonthlyCardSummary>{formatSummary(currentSettlement)}</MonthlyCardSummary>
                </MonthlyCardHeaderLeft>
                <MonthlyCardHeaderRight>
                  <StatusTag $color={getStatusColor(currentSettlement)}>
                    {getStatusLabel(currentSettlement)}
                  </StatusTag>
                  <ExpandIcon>{expandedMonths.has(currentMonthKey) ? '▴' : '▾'}</ExpandIcon>
                </MonthlyCardHeaderRight>
              </MonthlyCardHeader>

              {expandedMonths.has(currentMonthKey) && (
                <MonthlyCardContent>
                  {isCurrentEmpty ? (
                    <EmptyDescription>
                      이번 달 정산 대상이 없습니다. 계약서를 생성하고 출결을 입력하면 정산이 생성됩니다.
                    </EmptyDescription>
                  ) : (
                    <>
                      <SelectToolbar>
                        <SelectAllButton
                          onPress={() => {
                            setSelectedInvoiceIds((prev) => {
                              // 기본값: 전체선택 OFF. 누르면 전체 토글
                              const next = new Set<number>(prev);
                              // 전송 가능한 인보이스만 전체 선택 대상으로 삼음
                              const allIds = currentSettlement.invoices
                                .filter((i) => i && (i.send_status === 'not_sent' || i.send_status === 'partial'))
                                .map((i) => i.id)
                                .filter((id) => typeof id === 'number');
                              const allSelected = allIds.every((id) => next.has(id));
                              if (allSelected) {
                                // 모두 선택되어 있으면 모두 해제
                                allIds.forEach((id) => next.delete(id));
                              } else {
                                // 모두 선택
                                allIds.forEach((id) => next.add(id));
                              }
                              return next;
                            });
                          }}
                        >
                          <SelectAllButtonText>
                            전체 선택/해제
                          </SelectAllButtonText>
                        </SelectAllButton>
                        <SelectedCount>
                          선택 {selectedInvoiceIds.size}명
                        </SelectedCount>
                      </SelectToolbar>
                      {orderedCurrentInvoices.map((invoice) => {
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
                              </StudentTexts>
                            </StudentItemLeft>
                            <StudentItemRight>
                              <StudentAmount>{invoice.final_amount.toLocaleString()}원</StudentAmount>
                              {invoice.send_status === 'sent' ? (
                                <SmallStatusTag $type="sent">전송 완료</SmallStatusTag>
                              ) : (
                                <AmountEditButton onPress={() => handleAmountEdit(invoice)}>
                                  <AmountEditButtonText>
                                    {invoice.final_amount === 0 ? '이번 달만 청구' : '정산내역'}
                                  </AmountEditButtonText>
                                </AmountEditButton>
                              )}
                            </StudentItemRight>
                          </StudentItem>
                        );
                      })}
                    </>
                  )}

                  {currentSettlement.sendStatus !== 'sent' && !isCurrentEmpty && (
                    <SendInvoiceButton
                      onPress={() => handleSendInvoice(currentSettlement)}
                      disabled={selectedInvoiceIds.size === 0}
                    >
                      <SendInvoiceButtonText>
                        {selectedInvoiceIds.size === 0 ? '대상 선택 후 전송' : '청구서 전송'}
                      </SendInvoiceButtonText>
                    </SendInvoiceButton>
                  )}
                  {isCurrentEmpty && (
                    <PrimaryButton onPress={handleRetry}>
                      <PrimaryButtonText>다시 불러오기</PrimaryButtonText>
                    </PrimaryButton>
                  )}
                </MonthlyCardContent>
              )}
            </MonthlyCard>
          </SectionBlock>

          <SectionBlock>
            <SectionHeaderBlock>
              <SectionBlockTitle>지난달 정산</SectionBlockTitle>
            </SectionHeaderBlock>

            {isHistoryEmpty ? (
              <EmptyContainerSmall>
                <EmptyTitle>지난달 정산 내역이 없습니다.</EmptyTitle>
                <EmptyDescription>최근 전송 완료된 정산 내역이 여기 표시됩니다.</EmptyDescription>
              </EmptyContainerSmall>
            ) : (
              historySettlements.map((settlement) => {
                const monthKey = `${settlement.year}-${settlement.month}`;
                const isExpanded = expandedMonths.has(monthKey);
                return (
                  <MonthlyCard key={monthKey}>
                    <MonthlyCardHeader onPress={() => toggleMonth(monthKey)}>
                      <MonthlyCardHeaderLeft>
                        <MonthlyCardTitle>
                          {formatMonthTitle(settlement.year, settlement.month)}
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
                              <StudentName>{invoice.student?.name || '이름 없음'}</StudentName>
                              <StudentInfo>{formatStudentInfo(invoice)}</StudentInfo>
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
            await fetchCurrentMonth({ historyMonths: 3, force: true });
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
  background-color: #ffffff;
`;

const Header = styled.View`
  padding: 20px 16px 16px;
  background-color: #ffffff;
`;

const HeaderTitle = styled.Text`
  font-size: 24px;
  font-weight: 700;
  color: #111111;
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

const MonthlyCard = styled.View`
  background-color: #ffffff;
  border-radius: 16px;
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
  background-color: #fff2e5;
`;

const SelectAllButtonText = styled.Text`
  color: #ff6b00;
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
  border-color: ${(props) => (props.$checked ? '#ff6b00' : '#cccccc')};
  background-color: ${(props) =>
    props.$disabled ? '#f0f0f0' : props.$checked ? '#ff6b00' : '#ffffff'};
  align-items: center;
  justify-content: center;
`;

const CheckboxMark = styled.Text`
  color: #ffffff;
  font-size: 14px;
  line-height: 20px;
  text-align: center;
`;

const StudentName = styled.Text`
  font-size: 16px;
  font-weight: 700;
  color: #111111;
  margin-bottom: 4px;
`;

const StudentInfo = styled.Text`
  font-size: 13px;
  color: #666666;
  line-height: 18px;
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
  color: #ff6b00;
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
  background-color: ${(props) => (props.disabled ? '#ffd2ad' : '#ff6b00')};
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
