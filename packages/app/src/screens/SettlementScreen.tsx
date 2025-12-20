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
import { invoicesApi } from '../api/invoices';

const emptyStateIcon = require('../../assets/empty.png');

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

  // 횟수제: 정산중 섹션에서는 잔여회차 표시, 오늘청구 섹션에서는 "N월청구" 표시
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
      // 오늘청구 섹션: 기존대로 "N월청구" 표시
      return `${invoice.month}월청구`;
    }
    // 기간제는 PeriodText로 한 번만 표시
    return '';
  };

  // 청구서 기간 포맷팅
  // 테스트: 정산중/오늘청구/전송한 청구서 모두 날짜 표시
  const formatInvoicePeriod = (invoice: InvoiceSummary): string => {
    // 일시납부 계약 확인 (월단위 로직과 완전 분리)
    const isLumpSum = invoice.contract?.payment_schedule === 'lump_sum';
    
    // 일시납부 계약: 계약 시작일/종료일을 직접 사용 (period_start/period_end가 잘못 설정될 수 있으므로)
    if (isLumpSum && invoice.contract?.started_at && invoice.contract?.ended_at) {
      const parseDate = (dateValue: Date | string): { year: number; month: number; day: number } => {
        const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
        // UTC로 저장된 날짜를 로컬 시간대로 변환하여 표시
        // 예: 2025-12-17T15:00:00.000Z (한국 시간 12-18 00:00) -> 12월 18일로 표시
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
      return `${invoice.month}월 (${startYearShort}.${startDate.month}.${startDate.day}일~${endYearShort}.${endDate.month}.${endDate.day}일)`;
    }
    
    // 횟수제 계약 확인
    const policySnapshot = invoice.contract?.policy_snapshot as any;
    const totalSessions = typeof policySnapshot?.total_sessions === 'number' ? policySnapshot.total_sessions : 0;
    const isSessionBased = totalSessions > 0 && !invoice.contract?.ended_at; // 횟수계약 (계약기간없음)
    
    // 횟수제 계약은 기간 표시 안 함 (잔여 회차만 표시)
    if (isSessionBased) {
      if (invoice.send_status === 'sent' && invoice.display_period_start && invoice.display_period_end === '회') {
        const sessionCount = invoice.display_period_start;
        return `${invoice.month}월 (${sessionCount}회)`;
      }
      return `${invoice.month}월청구`;
    }
    
    // 전송한 청구서: display_period_start/display_period_end 우선 사용 (일시납부 제외)
    if (!isLumpSum && invoice.send_status === 'sent' && invoice.display_period_start && invoice.display_period_end) {
      // 선불 횟수제 계약이 아닌 경우에만 날짜 범위 표시
      if (!isSessionBased) {
        // 전송 시점에 저장된 표시 기간을 그대로 사용 (YYYY-MM-DD 형식)
        const parseStoredDate = (dateStr: string): { year: number; month: number; day: number } => {
          const [year, month, day] = dateStr.split('-').map(Number);
          return { year, month, day };
        };
        
        const startDate = parseStoredDate(invoice.display_period_start);
        const endDate = parseStoredDate(invoice.display_period_end);
        
        const startYearShort = String(startDate.year).slice(-2);
        const endYearShort = String(endDate.year).slice(-2);
        return `${invoice.month}월 (${startYearShort}.${startDate.month}.${startDate.day}일~${endYearShort}.${endDate.month}.${endDate.day}일)`;
      }
    }
    
    // period_start/period_end를 사용하여 기간 표시 (정산중/오늘청구/전송한 청구서 모두) - 월단위 납부만
    if (invoice.contract?.started_at && invoice.contract?.ended_at) {
      // 선불 계약의 첫 정산서: 항상 contract.started_at과 billing_day로 계산 (미리보기와 동일한 로직)
      const parseContractDate = (dateValue: Date | string | null | undefined): { year: number; month: number; day: number } | null => {
        if (!dateValue) return null;
        
        // Date 객체로 변환 (UTC를 로컬 시간으로 자동 변환)
        let date: Date;
        if (dateValue instanceof Date) {
          date = dateValue;
        } else {
          // 문자열인 경우: Date 객체로 파싱 (UTC를 로컬 시간으로 자동 변환)
          date = new Date(dateValue);
        }
        
        // 로컬 시간대 기준으로 날짜 추출
        return {
          year: date.getFullYear(),
          month: date.getMonth() + 1,
          day: date.getDate(),
        };
      };
      
      const contractStartDate = parseContractDate(invoice.contract.started_at);
      const contractEndDate = parseContractDate(invoice.contract.ended_at);
      const billingDay = invoice.contract?.billing_day;
      
      // 선불 계약의 첫 정산서 판단: 
      // period_start와 period_end를 로컬 시간으로 변환하여 비교
      // 첫 정산서는 period_start와 period_end가 같은 날(또는 하루 차이)로 저장됨
      const parseUTCToLocalForComparison = (dateValue: Date | string): { year: number; month: number; day: number } | null => {
        if (!dateValue) return null;
        let date: Date;
        if (dateValue instanceof Date) {
          date = dateValue;
        } else {
          date = new Date(dateValue);
        }
        return {
          year: date.getFullYear(),
          month: date.getMonth() + 1,
          day: date.getDate()
        };
      };
      
      const periodStartLocal = invoice.period_start ? parseUTCToLocalForComparison(invoice.period_start) : null;
      const periodEndLocal = invoice.period_end ? parseUTCToLocalForComparison(invoice.period_end) : null;
      
      // period_start와 period_end가 같은 날이거나 하루 차이면 첫 정산서로 판단
      const isFirstInvoiceByPeriod = periodStartLocal && periodEndLocal && 
        periodStartLocal.year === periodEndLocal.year &&
        periodStartLocal.month === periodEndLocal.month &&
        Math.abs(periodStartLocal.day - periodEndLocal.day) <= 1;
      
      const isPrepaidFirstInvoice = invoice.contract?.billing_type === 'prepaid' && isFirstInvoiceByPeriod;
      
      if (isPrepaidFirstInvoice && contractStartDate && contractEndDate && billingDay) {
        // 첫 정산서: 계약 시작일~다음 달 청구일 하루 전 표시 (미리보기와 동일한 로직)
        const startDate = contractStartDate;
        const nextMonth = startDate.month === 12 ? 1 : startDate.month + 1;
        const nextYear = startDate.month === 12 ? startDate.year + 1 : startDate.year;
        const displayEnd = new Date(nextYear, nextMonth - 1, billingDay);
        displayEnd.setDate(displayEnd.getDate() - 1); // Next month's billing day minus one day
        
        const startYearShort = String(startDate.year).slice(-2);
        const endYearShort = String(displayEnd.getFullYear()).slice(-2);
        const result = `${invoice.month}월 (${startYearShort}.${startDate.month}.${startDate.day}일~${endYearShort}.${displayEnd.getMonth() + 1}.${displayEnd.getDate()}일)`;
        
        return result;
      } else if (invoice.contract?.billing_type === 'prepaid' && contractStartDate && billingDay) {
        // 선불 계약의 두번째/세번째 정산서: contract.started_at과 billing_day로 직접 계산
        // invoice.month와 contract.started_at의 월 차이로 몇 번째 정산서인지 판단
        const contractMonth = contractStartDate.month;
        const contractYear = contractStartDate.year;
        const invoiceMonth = invoice.month;
        const invoiceYear = invoice.year;
        
        // 몇 번째 정산서인지 계산 (첫 정산서는 이미 처리됨)
        let invoiceNumber = 0;
        if (invoiceYear === contractYear && invoiceMonth === contractMonth) {
          invoiceNumber = 1; // 첫 정산서 (이미 처리됨)
        } else {
          // 두번째 이상: 월 차이 계산
          const monthDiff = (invoiceYear - contractYear) * 12 + (invoiceMonth - contractMonth);
          invoiceNumber = monthDiff + 1; // 첫 정산서가 1이므로 +1
        }
        
        if (invoiceNumber > 1 && invoiceNumber <= 12) {
          // 두번째 이상 정산서: 계약 시작일 + (invoiceNumber - 1)개월부터 시작
          const startDate = new Date(contractYear, contractMonth - 1, contractStartDate.day);
          startDate.setMonth(startDate.getMonth() + (invoiceNumber - 1));
          
          // 종료일: 시작일 + 1개월 - 1일
          const endDate = new Date(startDate);
          endDate.setMonth(endDate.getMonth() + 1);
          endDate.setDate(endDate.getDate() - 1);
          
          const startYearShort = String(startDate.getFullYear()).slice(-2);
          const endYearShort = String(endDate.getFullYear()).slice(-2);
          return `${invoice.month}월 (${startYearShort}.${startDate.getMonth() + 1}.${startDate.getDate()}일~${endYearShort}.${endDate.getMonth() + 1}.${endDate.getDate()}일)`;
        }
      } else if (invoice.period_start && invoice.period_end) {
        // 후불 계약 또는 선불이 아닌 경우: period_start ~ period_end를 그대로 표시
        // 백엔드와 동일한 로직: UTC 시간을 한국 시간(로컬)으로 변환
        const parseUTCToLocal = (dateValue: Date | string): { year: number; month: number; day: number } => {
          let date: Date;
          if (dateValue instanceof Date) {
            date = dateValue;
          } else {
            // 문자열인 경우: Date 객체로 파싱
            date = new Date(dateValue);
          }
          
          // 로컬 시간대(한국 시간)로 변환
          return {
            year: date.getFullYear(),
            month: date.getMonth() + 1,
            day: date.getDate()
          };
        };
        
        const periodStart = parseUTCToLocal(invoice.period_start);
        const periodEnd = parseUTCToLocal(invoice.period_end);
        
        // 백엔드와 동일한 형식으로 표시 (년도 2자리)
        const startYearShort = String(periodStart.year).slice(-2);
        const endYearShort = String(periodEnd.year).slice(-2);
        return `${invoice.month}월 (${startYearShort}.${periodStart.month}.${periodStart.day}일~${endYearShort}.${periodEnd.month}.${periodEnd.day}일)`;
      }
    }
    
    // 오늘청구/정산중 섹션: 날짜 표기 없음
    return `${invoice.month}월청구`;
  };

  const isLoading = invoicesStatus === 'loading' && !sections;

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
              <SectionBlockTitle>청구 가능한 정산서</SectionBlockTitle>
            </SectionHeaderBlock>

            {todayBillingSettlement.totalCount === 0 ? (
              <EmptyContainerSmall>
                <EmptyStateImage source={emptyStateIcon} resizeMode="contain" />
                <EmptyTitle>오늘 청구 가능한 정산서가 없습니다.</EmptyTitle>
                <EmptyDescription>청구일이 도래한 정산서는 여기에 표시됩니다.</EmptyDescription>
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
                          {invoice.period_start && invoice.period_end && (
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

          {/* 3. 전송한 청구서 섹션 */}
          <SectionBlock>
            <SectionHeaderBlock>
              <SectionBlockTitle>전송(청구)한 정산서</SectionBlockTitle>
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
                                    {settlement.month}월 전송한 정산서
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
                <PrimaryButtonText>미리보기</PrimaryButtonText>
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
