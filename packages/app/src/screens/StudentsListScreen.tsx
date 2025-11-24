import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { featureFlags } from '../config/features';
import { useStudentsStore } from '../store/useStudentsStore';
import { useAuthStore } from '../store/useStore';
import { StudentSummary } from '../types/students';
import { StudentsStackNavigationProp, MainTabsNavigationProp } from '../navigation/AppNavigator';
import ExtendContractModal from '../components/modals/ExtendContractModal';
import styled from 'styled-components/native';

const StudentsListStub = () => (
  <View style={stubStyles.container}>
    <Text style={stubStyles.text}>수강생 목록</Text>
    <Text style={stubStyles.subtext}>STEP 1: 네비게이션 테스트</Text>
  </View>
);

type ContractMeta = {
  contractType: 'sessions' | 'monthly' | 'unknown';
  isExpired: boolean;
  extendEligible: boolean;
  extendReason: string | null;
  remainingSessions: number | null;
  totalSessions: number | null;
  daysUntilEnd: number | null;
};

type StudentCardItem = {
  student: StudentSummary;
  meta: ContractMeta;
};

function StudentsListContent() {
  const navigation = useNavigation<StudentsStackNavigationProp>();
  const mainTabsNavigation = useNavigation<MainTabsNavigationProp>();
  const didRequestRef = useRef(false);

  // 검색 상태
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [showExpiredExpanded, setShowExpiredExpanded] = useState(false);
  
  // 연장 모달 상태
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [selectedContractForExtend, setSelectedContractForExtend] = useState<{
    contractId: number;
    contractType: 'sessions' | 'monthly';
    totalSessions?: number;
    remainingSessions?: number;
    currentEndDate?: string | null;
  } | null>(null);

  const fetchStudents = useStudentsStore((state) => state.fetchStudents);
  const fetchNextPage = useStudentsStore((state) => state.fetchNextPage);
  const items = useStudentsStore((state) => state.list.items);
  const status = useStudentsStore((state) => state.list.status);
  const errorMessage = useStudentsStore((state) => state.list.errorMessage);
  const isRefreshing = useStudentsStore((state) => state.list.isRefreshing);
  const hasMore = useStudentsStore((state) => state.list.hasMore);
  const total = useStudentsStore((state) => state.list.total);
  const lastUpdatedAt = useStudentsStore((state) => state.list.lastUpdatedAt);
  const loadedOnce = useStudentsStore((state) => state.list._loadedOnce);
  const inFlight = useStudentsStore((state) => state.list._inFlight);

  // 이번 달 청구 대상 카운트 계산
  const billingThisMonthCount = useMemo(() => {
    return items.filter((item) => item.this_month_invoice && item.this_month_invoice.final_amount > 0).length;
  }, [items]);

  const isInitialLoading = status === 'loading' && items.length === 0;

  // 검색 실행
  const handleSearch = useCallback(() => {
    setSearchQuery(searchInput.trim());
    didRequestRef.current = false;
  }, [searchInput]);

  // draft 상태 계약서 제외
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (!item.latest_contract) return true; // 계약이 없으면 표시
      return item.latest_contract.status !== 'draft'; // draft가 아니면 표시
    });
  }, [items]);

  const computeContractMeta = useCallback((student: StudentSummary): ContractMeta => {
    const contract = student.latest_contract;
    const now = new Date();

    if (!contract) {
      return {
        contractType: 'unknown',
        isExpired: true,
        extendEligible: false,
        extendReason: null,
        remainingSessions: null,
        totalSessions: null,
        daysUntilEnd: null,
      };
    }

    const snapshot = (contract.policy_snapshot ?? {}) as Record<string, any>;
    const totalSessions =
      typeof snapshot.total_sessions === 'number' ? snapshot.total_sessions : 0;
    const sessionsUsed = contract.sessions_used ?? 0;

    if (totalSessions > 0) {
      const remaining = Math.max(totalSessions - sessionsUsed, 0);
      const isExpired = remaining <= 0;
      const extendEligible = remaining < 3; // 3회 미만
      const extendReason = remaining > 0 ? `회차 ${remaining}회 남음` : '회차 모두 사용됨';
      return {
        contractType: 'sessions',
        isExpired,
        extendEligible,
        extendReason,
        remainingSessions: remaining,
        totalSessions,
        daysUntilEnd: null,
      };
    }

    const endDate = contract.ended_at ? new Date(contract.ended_at) : null;
    if (endDate) {
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
      return {
        contractType: 'monthly',
        isExpired,
        extendEligible,
        extendReason,
        remainingSessions: null,
        totalSessions: null,
        daysUntilEnd,
      };
    }

    return {
      contractType: 'monthly',
      isExpired: false,
      extendEligible: false,
      extendReason: null,
      remainingSessions: null,
      totalSessions: null,
      daysUntilEnd: null,
    };
  }, []);

  const enrichedItems = useMemo<StudentCardItem[]>(() => {
    return filteredItems.map((student) => ({
      student,
      meta: computeContractMeta(student),
    }));
  }, [filteredItems, computeContractMeta]);

  const [showAllActive, setShowAllActive] = useState(false);
  const [showAllExpired, setShowAllExpired] = useState(false);

  const activeCardsAll = useMemo(
    () => enrichedItems.filter((card) => !card.meta.isExpired),
    [enrichedItems],
  );
  const expiredCardsAll = useMemo(
    () => enrichedItems.filter((card) => card.meta.isExpired),
    [enrichedItems],
  );

  const activeCardsCollapsed = useMemo(
    () => (showAllActive ? activeCardsAll : activeCardsAll.slice(0, 3)),
    [activeCardsAll, showAllActive],
  );
  const expiredCardsCollapsed = useMemo(
    () => (showAllExpired ? expiredCardsAll : expiredCardsAll.slice(0, 3)),
    [expiredCardsAll, showAllExpired],
  );

  const primaryCards = activeCardsCollapsed;
  const showExpiredSection = true;
  const totalActiveCount = activeCardsAll.length;

  useEffect(() => {
    if (!showExpiredSection) {
      setShowExpiredExpanded(false);
    }
  }, [showExpiredSection]);

  // 검색 변경 시 데이터 재로드
  useEffect(() => {
    if (!loadedOnce && !didRequestRef.current) return;

    fetchStudents({ refresh: true, search: searchQuery || undefined }).catch((error: any) => {
      // 401 에러는 로그아웃 과정에서 발생할 수 있으므로 조용히 처리
      if (error?.response?.status !== 401) {
        if (__DEV__) {
          console.log('[Students] error list on search', error?.message);
        }
      }
    });
  }, [searchQuery, fetchStudents, loadedOnce]);

  const handleRetry = useCallback(async () => {
    try {
      didRequestRef.current = false;
      await fetchStudents({ refresh: true, search: searchQuery || undefined });
      Alert.alert('수강생', '목록을 다시 불러왔습니다.');
    } catch (error: any) {
      Alert.alert('오류', error?.message ?? '목록을 불러오지 못했습니다.');
    }
  }, [fetchStudents, searchQuery]);

  const handleExtendPress = useCallback((card: StudentCardItem) => {
    const contract = card.student.latest_contract;
    if (!contract) return;

    const meta = card.meta;
    if (meta.contractType === 'sessions') {
      setSelectedContractForExtend({
        contractId: contract.id,
        contractType: 'sessions',
        totalSessions: meta.totalSessions ?? 0,
        remainingSessions: meta.remainingSessions ?? 0,
      });
    } else if (meta.contractType === 'monthly') {
      setSelectedContractForExtend({
        contractId: contract.id,
        contractType: 'monthly',
        currentEndDate: contract.ended_at,
      });
    } else {
      return;
    }
    setShowExtendModal(true);
  }, []);

  const handleExtendSuccess = useCallback(async () => {
    // 연장 성공 후 학생 목록 새로고침
    await fetchStudents({ refresh: true, search: searchQuery || undefined });
    Alert.alert('완료', '연장 처리되었습니다.');
  }, [fetchStudents, searchQuery]);

  const handleExtendSectionToggle = useCallback(() => {
    setShowExpiredExpanded((prev) => !prev);
  }, []);

  const loadMore = useCallback(async () => {
    if (!hasMore || inFlight || status !== 'success' || items.length === 0) {
      return;
    }
    try {
      await fetchNextPage();
    } catch (error: any) {
      Alert.alert('오류', error?.message ?? '다음 페이지를 불러오지 못했습니다.');
    }
  }, [fetchNextPage, hasMore, inFlight, items.length, status]);

  useFocusEffect(
    useCallback(() => {
      // 인증 상태 확인
      const isAuthenticated = useAuthStore.getState().isAuthenticated;
      if (!isAuthenticated) {
        return;
      }

      // 항상 새로고침하여 최신 데이터 반영 (계약 생성 후 즉시 반영)
      didRequestRef.current = true;
      fetchStudents({ 
        refresh: true, 
        search: searchQuery || undefined
      }).catch((error: any) => {
        // 401 에러는 로그아웃 과정에서 발생할 수 있으므로 조용히 처리
        if (error?.response?.status !== 401) {
          if (__DEV__) {
            console.log('[Students] error list on focus', error?.message);
          }
        }
      });

      return undefined;
    }, [fetchStudents, searchQuery]),
  );

  const handleRefresh = useCallback(async () => {
    try {
      await fetchStudents({ refresh: true, search: searchQuery || undefined });
    } catch (error) {
      // 401 에러는 로그아웃 과정에서 발생할 수 있으므로 조용히 처리
      if ((error as any)?.response?.status !== 401) {
        if (__DEV__) {
          console.log('[Students] error refresh', (error as Error)?.message);
        }
      }
    }
  }, [fetchStudents, searchQuery]);

  useEffect(() => {
    if (!errorMessage) {
      return;
    }
  }, [errorMessage]);

  // 뱃지 텍스트 변환
  const getBillingTypeLabel = (type: string) => {
    return type === 'prepaid' ? '선불' : type === 'postpaid' ? '후불' : type;
  };

  const getAbsencePolicyLabel = (policy: string, billingType?: string) => {
    if (policy === 'carry_over') return '회차이월';
    if (policy === 'deduct_next') return '차감';
    if (policy === 'vanish') return '소멸';
    return policy;
  };

  const renderStudentCard = useCallback(
    (card: StudentCardItem) => {
      const { student, meta } = card;
      const contract = student.latest_contract;
      const invoice = student.this_month_invoice;
      const baseAmount = invoice?.base_amount ?? 0;
      const contractAmount = contract?.monthly_amount ?? 0;
      const displayAmount = baseAmount > 0 ? baseAmount : contractAmount;

      return (
        <Card>
          <CardRow1>
            <CardNameContainer>
              <CardName>{student.name}</CardName>
              {contract ? (
                <BadgeContainer>
                  <Badge billingType>
                    <BadgeText>{getBillingTypeLabel(contract.billing_type)}</BadgeText>
                  </Badge>
                  <Badge absencePolicy>
                    <BadgeText absencePolicy>
                      {getAbsencePolicyLabel(contract.absence_policy, contract.billing_type)}
                    </BadgeText>
                  </Badge>
                </BadgeContainer>
              ) : null}
            </CardNameContainer>
            <AmountContainer>
              {displayAmount > 0 ? (
                <AmountText>{displayAmount.toLocaleString()}원</AmountText>
              ) : invoice && invoice.base_amount > 0 ? (
                <NoBillingBadge>이번 달 청구 안 함</NoBillingBadge>
              ) : null}
            </AmountContainer>
          </CardRow1>

          {student.class_info ? <CardRow2>{student.class_info}</CardRow2> : null}

          <RowWithFooter>
            {student.this_month_status_summary ? (
              <CardRow3>{student.this_month_status_summary}</CardRow3>
            ) : (
              <Spacer />
            )}
            <ButtonGroup>
              {meta.extendEligible ? (
                <ExtendActionButton onPress={() => handleExtendPress(card)}>
                  <ExtendActionButtonText>연장하기</ExtendActionButtonText>
                </ExtendActionButton>
              ) : null}
              <DetailButton onPress={() => navigation.navigate('StudentDetail', { studentId: Number(student.id) })}>
                <DetailButtonText>상세보기</DetailButtonText>
              </DetailButton>
            </ButtonGroup>
          </RowWithFooter>
          {meta.extendEligible && meta.extendReason ? (
            <ExtendNote>{meta.extendReason}</ExtendNote>
          ) : null}
        </Card>
      );
    },
    [getAbsencePolicyLabel, getBillingTypeLabel, handleExtendPress, navigation],
  );

  const renderItem = useCallback(
    ({ item }: { item: StudentCardItem }) => renderStudentCard(item),
    [renderStudentCard],
  );

  const listEmptyComponent = useMemo(() => {
    const shouldShowEmptyState = primaryCards.length === 0 && !showExpiredSection;

    if (!shouldShowEmptyState) {
      return null;
    }

    if (isInitialLoading) {
      return (
        <SkeletonContainer>
          {Array.from({ length: 5 }).map((_, index) => (
            <SkeletonCard key={index}>
              <SkeletonTitle />
              <SkeletonLine />
              <SkeletonLineShort />
            </SkeletonCard>
          ))}
        </SkeletonContainer>
      );
    }

    if (filteredItems.length === 0 && items.length > 0) {
      return (
        <EmptyContainer>
          <EmptyTitle>검색 결과가 없습니다.</EmptyTitle>
          <EmptyDescription>검색어를 변경해 주세요.</EmptyDescription>
        </EmptyContainer>
      );
    }

    return (
      <EmptyContainer>
        <EmptyTitle>표시할 수강생이 없습니다.</EmptyTitle>
        <EmptyDescription>새로운 데이터를 불러오거나 검색어를 확인해 주세요.</EmptyDescription>
        <RetryButton onPress={handleRetry}>
          <RetryButtonText>다시 불러오기</RetryButtonText>
        </RetryButton>
      </EmptyContainer>
    );
  }, [
    filteredItems.length,
    handleRetry,
    isInitialLoading,
    items.length,
    primaryCards.length,
    showExpiredSection,
  ]);

  const renderFooter = useMemo(() => {
    if (status === 'loading' && items.length > 0) {
      return (
        <FooterLoader>
          <ActivityIndicator color="#ff6b00" />
        </FooterLoader>
      );
    }
    return null;
  }, [items.length, status]);

  const listHeaderComponent = useMemo(() => {
    return (
      <SectionIntro>
        <SectionTitleText>
          계약 중 수강생 <SectionCount>{activeCardsAll.length}명</SectionCount>
        </SectionTitleText>
      </SectionIntro>
    );
  }, [activeCardsAll.length]);

  const expiredSection = useMemo(() => {
    // 항상 표시되어야 하므로 showExpiredSection 체크 제거
    const showToggle = expiredCardsAll.length > 3;
    return (
      <ExpiredSectionContainer>
        <ExpiredHeader onPress={showToggle ? handleExtendSectionToggle : undefined} activeOpacity={showToggle ? 0.6 : 1}>
          <ExpiredTitle>
            계약 종료 수강생 <SectionCount>{expiredCardsAll.length}명</SectionCount>
          </ExpiredTitle>
          {showToggle && <ExpandIcon>{showExpiredExpanded ? '▴' : '▾'}</ExpandIcon>}
        </ExpiredHeader>
        {(!showToggle || showExpiredExpanded) ? (
          expiredCardsAll.length === 0 ? (
            <EmptyDescription>계약 종료된 수강생이 없습니다.</EmptyDescription>
          ) : (
            expiredCardsCollapsed.map((card) => (
              <View key={card.student.id}>{renderStudentCard(card)}</View>
            ))
          )
        ) : null}
        {showToggle && (
          <ShowMoreButton onPress={() => setShowAllExpired((prev) => !prev)}>
            <ShowMoreButtonText>{showAllExpired ? '접기' : '전체 보기'}</ShowMoreButtonText>
          </ShowMoreButton>
        )}
      </ExpiredSectionContainer>
    );
  }, [
    expiredCardsAll.length,
    expiredCardsCollapsed,
    handleExtendSectionToggle,
    renderStudentCard,
    showExpiredExpanded,
  ]);

  const combinedFooter = useMemo(() => {
    // activeToggle: 3개 이상이거나 전체보기 상태일 때 표시
    const activeToggle =
      activeCardsAll.length > 3 || showAllActive ? (
        <ShowMoreButton onPress={() => setShowAllActive((prev) => !prev)}>
          <ShowMoreButtonText>{showAllActive ? '접기' : '전체 보기'}</ShowMoreButtonText>
        </ShowMoreButton>
      ) : null;

    // activeToggle이 있으면 항상 표시 (renderFooter가 없어도)
    if (!activeToggle && !renderFooter) {
      return null;
    }
    return (
      <View>
        {renderFooter}
        {activeToggle}
      </View>
    );
  }, [
    activeCardsAll.length,
    renderFooter,
    showAllActive,
  ]);

  const handleAddStudent = useCallback(() => {
    // 홈 스택의 ContractNew로 이동
    (mainTabsNavigation as any).navigate('Home', {
      screen: 'ContractNew',
    });
  }, [mainTabsNavigation]);

  return (
    <Container>
      {errorMessage ? (
        <ErrorBanner>
          <ErrorText>오류: {errorMessage}</ErrorText>
          <RetryButton onPress={handleRetry}>
            <RetryButtonText>재시도</RetryButtonText>
          </RetryButton>
        </ErrorBanner>
      ) : null}

      {/* 헤더: 서브텍스트 + 수강생 추가 버튼 */}
      <Header>
        <HeaderTexts>
          <HeaderTitle>수강생</HeaderTitle>
          <HeaderSubtext>
            총 {totalActiveCount}명 · 계약중 {billingThisMonthCount}명
          </HeaderSubtext>
        </HeaderTexts>
        <AddButton onPress={handleAddStudent}>
          <AddButtonText>+ 수강생 추가</AddButtonText>
        </AddButton>
      </Header>

      {/* 검색 */}
      <SearchRow>
        <SearchInputWrapper>
          <SearchIcon>🔍</SearchIcon>
          <SearchInput
            placeholder="이름 · 보호자 · 과목으로 검색"
            value={searchInput}
            onChangeText={setSearchInput}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
        </SearchInputWrapper>
      </SearchRow>

      {/* 전체 스크롤 가능한 컨텐츠 */}
      <ScrollView
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
        onScroll={(event) => {
          const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
          const paddingToBottom = 20;
          if (layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom) {
            loadMore();
          }
        }}
        scrollEventThrottle={400}
      >
        {/* 계약 중 수강생 섹션 */}
        <SectionContainer>
          {listHeaderComponent}
          {primaryCards.length === 0 ? (
            listEmptyComponent
          ) : (
            <>
              {primaryCards.map((item) => (
                <React.Fragment key={String(item.student.id)}>
                  {renderStudentCard(item)}
                </React.Fragment>
              ))}
              {combinedFooter}
            </>
          )}
        </SectionContainer>
        
        {/* 계약 종료 수강생 섹션 - 항상 표시 */}
        {expiredSection}
      </ScrollView>

      {/* 연장 모달 */}
      {selectedContractForExtend && (
        <ExtendContractModal
          visible={showExtendModal}
          onClose={() => {
            setShowExtendModal(false);
            setSelectedContractForExtend(null);
          }}
          onSuccess={handleExtendSuccess}
          contractId={selectedContractForExtend.contractId}
          contractType={selectedContractForExtend.contractType}
          totalSessions={selectedContractForExtend.totalSessions}
          remainingSessions={selectedContractForExtend.remainingSessions}
          currentEndDate={selectedContractForExtend.currentEndDate}
        />
      )}
    </Container>
  );
}

export default function StudentsListScreen() {
  if (featureFlags.students.useStub) {
    return <StudentsListStub />;
  }

  return <StudentsListContent />;
}

// Styled Components
const Container = styled.SafeAreaView`
  flex: 1;
  background-color: #ffffff;
`;

const Header = styled.View`
  padding: 20px 16px 12px;
  background-color: #fff;
  flex-direction: row;
  justify-content: space-between;
  align-items: flex-start;
`;

const HeaderTexts = styled.View`
  flex: 1;
  padding-right: 12px;
`;

const HeaderTitle = styled.Text`
  font-size: 22px;
  font-weight: 700;
  color: #111;
  margin-bottom: 4px;
`;

const HeaderSubtext = styled.Text`
  font-size: 13px;
  color: #8e8e93;
`;

const AddButton = styled.TouchableOpacity`
  padding: 8px 16px;
  background-color: #ff6b00;
  border-radius: 8px;
`;

const AddButtonText = styled.Text`
  color: #fff;
  font-size: 14px;
  font-weight: 600;
`;

const SearchRow = styled.View`
  padding: 0 16px 16px;
  background-color: #fff;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  border-bottom-width: 1px;
  border-bottom-color: #e5e5ea;
`;

const SearchInputWrapper = styled.View`
  flex: 1;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  background-color: #f2f2f7;
  border-radius: 12px;
  padding: 0 12px;
  height: 44px;
`;

const SearchIcon = styled.Text`
  font-size: 18px;
`;

const SearchInput = styled.TextInput`
  flex: 1;
  font-size: 14px;
  color: #111;
  padding: 0;
`;

const Card = styled.View`
  background-color: #f8f9fa;
  border-radius: 12px;
  padding: 16px;
  margin: 8px 16px;
  shadow-color: #000;
  shadow-offset: 0px 2px;
  shadow-opacity: 0.1;
  shadow-radius: 4px;
  elevation: 2;
`;

const CardRow1 = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
`;

const CardNameContainer = styled.View`
  flex: 1;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

const CardName = styled.Text`
  font-size: 18px;
  font-weight: 700;
  color: #111;
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

const CardRow2 = styled.Text`
  font-size: 14px;
  color: #666;
  margin-bottom: 6px;
`;

const CardRow3 = styled.Text`
  font-size: 13px;
  color: #888;
`;

const RowWithFooter = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: flex-start;
  margin-top: 8px;
  gap: 12px;
`;

const ButtonGroup = styled.View`
  flex-direction: row;
  gap: 8px;
  margin-left: 8px;
`;

const Spacer = styled.View`
  flex: 1;
`;

const AmountContainer = styled.View`
  align-items: flex-end;
  min-width: 80px;
`;

const AmountText = styled.Text`
  font-size: 16px;
  font-weight: 700;
  color: #111;
`;

const NoBillingBadge = styled.Text`
  font-size: 12px;
  color: #888;
  padding: 4px 8px;
  background-color: #f5f5f5;
  border-radius: 8px;
`;

const ExtendNote = styled.Text`
  margin-top: 8px;
  font-size: 12px;
  color: #4a4a4a;
`;

const ExtendActionButton = styled.TouchableOpacity`
  padding: 8px 14px;
  background-color: #0a84ff;
  border-radius: 8px;
`;

const ExtendActionButtonText = styled.Text`
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
`;

const SectionIntro = styled.View`
  padding: 0 0 12px 0;
  margin-bottom: 12px;
`;

const SectionContainer = styled.View`
  background-color: #ffffff;
  margin: 0 16px;
  padding: 16px 0;
  border-bottom-width: 1px;
  border-bottom-color: #e0e0e0;
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

const SectionTitleText = styled.Text`
  font-size: 16px;
  font-weight: 700;
  color: #111111;
`;

const SectionCount = styled.Text`
  font-size: 14px;
  color: #8e8e93;
  margin-left: 6px;
`;

const ExpiredSectionContainer = styled.View`
  background-color: #ffffff;
  margin: 0 16px;
  padding: 16px 0;
`;

const ExpiredHeader = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding-vertical: 0;
  margin-bottom: 12px;
`;

const ExpiredTitle = styled.Text`
  font-size: 15px;
  font-weight: 700;
  color: #333333;
`;

const ExpandIcon = styled.Text`
  font-size: 14px;
  color: #8e8e93;
`;

const DetailButton = styled.TouchableOpacity`
  padding: 8px 16px;
  background-color: #ff6b00;
  border-radius: 8px;
`;

const DetailButtonText = styled.Text`
  color: #fff;
  font-size: 14px;
  font-weight: 600;
`;

const SkeletonContainer = styled.View`
  padding: 16px;
  gap: 12px;
`;

const SkeletonCard = styled.View`
  background-color: #fff;
  border-radius: 12px;
  padding: 16px;
`;

const SkeletonTitle = styled.View`
  height: 18px;
  border-radius: 6px;
  background-color: #e3e3e8;
  margin-bottom: 12px;
`;

const SkeletonLine = styled.View`
  height: 14px;
  border-radius: 6px;
  background-color: #ececf1;
  margin-bottom: 6px;
`;

const SkeletonLineShort = styled.View`
  width: 60%;
  height: 14px;
  border-radius: 6px;
  background-color: #ececf1;
`;

const EmptyContainer = styled.View`
  align-items: center;
  padding: 80px 24px;
  gap: 12px;
`;

const EmptyTitle = styled.Text`
  font-size: 18px;
  font-weight: 700;
  color: #222;
`;

const EmptyDescription = styled.Text`
  font-size: 14px;
  color: #555;
  text-align: center;
`;

const RetryButton = styled.TouchableOpacity`
  padding: 12px 24px;
  background-color: #ff6b00;
  border-radius: 8px;
  margin-top: 8px;
`;

const RetryButtonText = styled.Text`
  color: #fff;
  font-size: 14px;
  font-weight: 600;
`;

const ErrorBanner = styled.View`
  background-color: #ffeef0;
  padding: 12px 16px;
  border-bottom-width: 1px;
  border-bottom-color: #f8d7da;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
`;

const ErrorText = styled.Text`
  color: #a94442;
  flex: 1;
  margin-right: 12px;
  font-size: 14px;
`;

const FooterLoader = styled.View`
  padding: 20px;
`;

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
    color: '#666',
  },
});

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: 16,
  },
});
