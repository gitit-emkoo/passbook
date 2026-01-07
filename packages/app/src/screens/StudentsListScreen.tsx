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
import { useStudentsStore } from '../store/useStudentsStore';
import { useAuthStore } from '../store/useStore';
import { StudentSummary } from '../types/students';
import { StudentsStackNavigationProp, MainTabsNavigationProp } from '../navigation/AppNavigator';
import ExtendContractModal from '../components/modals/ExtendContractModal';
import { studentsApi } from '../api/students';
import { contractsApi } from '../api/contracts';
import styled from 'styled-components/native';
import { Image } from 'react-native';

const nonImage = require('../../assets/non.png');
const endImage = require('../../assets/end.png');

type ContractMeta = {
  contractType: 'sessions' | 'amount' | 'unknown';
  isExpired: boolean;
  extendEligible: boolean;
  extendReason: string | null;
  remainingSessions: number | null;
  totalSessions: number | null;
  remainingAmount: number | null;
  totalAmount: number | null;
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

  // 전체 수강생 수 (백엔드 total 우선, 없으면 현재 리스트 길이)
  const totalStudentsCount = useMemo(() => {
    if (typeof total === 'number' && total >= 0) {
      return total;
    }
    return items.length;
  }, [items.length, total]);

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

    if (!contract) {
      return {
        contractType: 'unknown',
        isExpired: true,
        extendEligible: false,
        extendReason: null,
        remainingSessions: null,
        totalSessions: null,
        remainingAmount: null,
        totalAmount: null,
      };
    }

    const snapshot = (contract.policy_snapshot ?? {}) as Record<string, any>;
    const totalSessions =
      typeof snapshot.total_sessions === 'number' ? snapshot.total_sessions : 0;
    const sessionsUsed = contract.sessions_used ?? 0;

    // 횟수권: totalSessions > 0 && !ended_at
    if (totalSessions > 0 && !contract.ended_at) {
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
        remainingAmount: null,
        totalAmount: null,
      };
    }

    // 금액권: ended_at이 있음 (유효기간이 있음)
    // 뷰티앱: 금액권도 선불 횟수 계약 로직 사용, 유효기간은 표시용/종료판단용만
    if (contract.ended_at) {
      const totalAmount = contract.monthly_amount ?? 0;
      const amountUsed = contract.amount_used ?? 0;
      const remainingAmount = Math.max(totalAmount - amountUsed, 0);
      const isExpired = remainingAmount <= 0; // 금액 모두 소진 시 종료
      const extendEligible = remainingAmount <= 20000; // 20,000원 이하
      const extendReason = remainingAmount > 0 ? `잔여 ${remainingAmount.toLocaleString()}원` : '금액 모두 사용됨';
      return {
        contractType: 'amount',
        isExpired,
        extendEligible,
        extendReason,
        remainingSessions: null,
        totalSessions: null,
        remainingAmount,
        totalAmount,
      };
    }

    return {
      contractType: 'unknown',
      isExpired: false,
      extendEligible: false,
      extendReason: null,
      remainingSessions: null,
      totalSessions: null,
      remainingAmount: null,
      totalAmount: null,
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
      Alert.alert('고객', '목록을 다시 불러왔습니다.');
    } catch (error: any) {
      Alert.alert('오류', error?.message ?? '목록을 불러오지 못했습니다.');
    }
  }, [fetchStudents, searchQuery]);

  const handleSchedulePress = useCallback((card: StudentCardItem) => {
    // StudentDetail 화면으로 단순 이동
    navigation.navigate('StudentDetail', {
      studentId: Number(card.student.id),
    });
  }, [navigation]);

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
    } else if (meta.contractType === 'amount') {
      setSelectedContractForExtend({
        contractId: contract.id,
        contractType: 'amount',
        totalAmount: meta.totalAmount ?? 0,
        remainingAmount: meta.remainingAmount ?? 0,
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

  const handleDeletePress = useCallback((card: StudentCardItem) => {
    const { student } = card;
    Alert.alert(
      '고객 삭제',
      `${student.name} 고객을 삭제하시겠습니까?\n\n삭제된 고객의 모든 데이터(계약, 출결 기록, 정산 내역 등)가 영구적으로 삭제되며 복구할 수 없습니다.`,
      [
        {
          text: '취소',
          style: 'cancel',
        },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await studentsApi.delete(Number(student.id));
              await fetchStudents({ refresh: true, search: searchQuery || undefined });
              Alert.alert('완료', '고객이 삭제되었습니다.');
            } catch (error: any) {
              Alert.alert('오류', error?.response?.data?.message || error?.message || '고객 삭제에 실패했습니다.');
            }
          },
        },
      ],
    );
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
  const getContractTypeLabel = (type: 'sessions' | 'amount' | 'unknown') => {
    if (type === 'sessions') return '횟수권';
    if (type === 'amount') return '선불권';
    return '알 수 없음';
  };

  const getAbsencePolicyLabel = (policy: string) => {
    if (policy === 'carry_over') return '대체';
    if (policy === 'deduct_next') return '차감';
    if (policy === 'vanish') return '소멸';
    return policy;
  };

  // 요일 변환 함수
  const formatDayOfWeek = (dayOfWeekArray: string[] | null | undefined): string => {
    if (!dayOfWeekArray || !Array.isArray(dayOfWeekArray) || dayOfWeekArray.length === 0) {
      return '-';
    }
    const dayMap: Record<string, string> = {
      'SUN': '일',
      'MON': '월',
      'TUE': '화',
      'WED': '수',
      'THU': '목',
      'FRI': '금',
      'SAT': '토',
    };
    return dayOfWeekArray.map(day => dayMap[day] || day).join('/');
  };

  const handleCardPress = useCallback((studentId: number) => {
    navigation.navigate('StudentDetail', { studentId });
  }, [navigation]);

  const renderStudentCard = useCallback(
    (card: StudentCardItem) => {
      const { student, meta } = card;
      const contract = student.latest_contract;
      const invoice = student.this_month_invoice;
      const baseAmount = invoice?.base_amount ?? 0;
      const contractAmount = contract?.monthly_amount ?? 0;
      const displayAmount = baseAmount > 0 ? baseAmount : contractAmount;

      return (
        <Card onPress={() => handleCardPress(Number(student.id))} activeOpacity={0.7}>
          <CardLeftLine isExpired={meta.isExpired} />
          <CardRow1>
            <CardNameContainer>
              <CardName>{student.name}</CardName>
              {contract ? (
                <BadgeContainer>
                  <Badge contractType contractTypeValue={meta.contractType}>
                    <BadgeText contractType contractTypeValue={meta.contractType}>
                      {getContractTypeLabel(meta.contractType)}
                    </BadgeText>
                  </Badge>
                  <Badge absencePolicy absencePolicyValue={contract.absence_policy}>
                    <BadgeText absencePolicy absencePolicyValue={contract.absence_policy}>
                      {getAbsencePolicyLabel(contract.absence_policy)}
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

          {contract ? (
            <CardRow2Container>
              <CardRow2Subject>
                {contract.subject}
                {(() => {
                  const snapshot = (contract.policy_snapshot ?? {}) as Record<string, any>;
                  const lessonNotes = typeof snapshot.lesson_notes === 'string' ? snapshot.lesson_notes : '';
                  return lessonNotes ? ` (${lessonNotes})` : '';
                })()}
              </CardRow2Subject>
            </CardRow2Container>
          ) : student.class_info ? (
            <CardRow2>{student.class_info}</CardRow2>
          ) : null}

          <RowWithFooter>
            <FooterLeft>
            {student.this_month_status_summary ? (
              <CardRow3>{student.this_month_status_summary}</CardRow3>
              ) : null}
              {meta.contractType === 'sessions' && typeof meta.remainingSessions === 'number' && typeof meta.totalSessions === 'number' ? (
                <ExtendNote>
                  <ExtendNoteTotal>총{meta.totalSessions}회</ExtendNoteTotal>
                  {' / '}
                  <ExtendNoteRemaining>잔여{meta.remainingSessions}회</ExtendNoteRemaining>
                </ExtendNote>
              ) : meta.contractType === 'amount' && typeof meta.remainingAmount === 'number' && typeof meta.totalAmount === 'number' ? (
                <ExtendNote>
                  <ExtendNoteLabel>총</ExtendNoteLabel>
                  <ExtendNoteTotal>{meta.totalAmount.toLocaleString()}원</ExtendNoteTotal>
                  <ExtendNoteLabel> / </ExtendNoteLabel>
                  <ExtendNoteLabel>잔여</ExtendNoteLabel>
                  <ExtendNoteRemaining>{meta.remainingAmount.toLocaleString()}원</ExtendNoteRemaining>
                </ExtendNote>
              ) : meta.extendEligible && meta.extendReason ? (
                <ExtendNote>{meta.extendReason}</ExtendNote>
              ) : null}
            </FooterLeft>
            <ButtonGroup>
              {contract && !meta.isExpired ? (
                <CardScheduleButton
                  onPress={(e) => {
                    e?.stopPropagation?.();
                    handleSchedulePress(card);
                  }}
                >
                  <CardScheduleButtonText>
                    일정 관리 <CardScheduleButtonArrow>{'>'}</CardScheduleButtonArrow>
                  </CardScheduleButtonText>
                </CardScheduleButton>
              ) : null}
              {meta.extendEligible ? (
                <ExtendActionButton onPress={(e) => {
                  e?.stopPropagation?.();
                  handleExtendPress(card);
                }}>
                  <ExtendActionButtonText>연장하기</ExtendActionButtonText>
                </ExtendActionButton>
              ) : null}
              {meta.isExpired ? (
                <DeleteButton onPress={(e) => {
                  e?.stopPropagation?.();
                  handleDeletePress(card);
                }}>
                  <DeleteButtonText>삭제</DeleteButtonText>
                </DeleteButton>
              ) : null}
            </ButtonGroup>
          </RowWithFooter>
        </Card>
      );
    },
    [getAbsencePolicyLabel, handleExtendPress, handleDeletePress, handleCardPress, navigation],
  );

  const renderItem = useCallback(
    ({ item }: { item: StudentCardItem }) => renderStudentCard(item),
    [renderStudentCard],
  );

  const listEmptyComponent = useMemo(() => {
    // 계약 중 고객 섹션이 비어있을 때만 표시
    if (primaryCards.length > 0) {
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
          <EmptyImage source={nonImage} resizeMode="contain" />
        </EmptyContainer>
      );
    }

    return (
      <EmptyContainer>
        <EmptyImage source={nonImage} resizeMode="contain" />
        <EmptyTitle>계약 중인 이용권 고객이 없습니다.</EmptyTitle>
      </EmptyContainer>
    );
  }, [
    filteredItems.length,
    isInitialLoading,
    items.length,
    primaryCards.length,
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
    const showToggle = activeCardsAll.length > 3 || showAllActive;
    return (
      <SectionIntro>
        <SectionHeaderLeft>
          <SectionTitleText>
            계약 중 고객 <SectionCount>{activeCardsAll.length}명</SectionCount>
          </SectionTitleText>
          <SectionSubtext>일정 등록 변경 및 관리기록을 확인 할 수 있어요.</SectionSubtext>
        </SectionHeaderLeft>
        {showToggle && (
          <ShowMoreButtonInline onPress={() => setShowAllActive((prev) => !prev)}>
            <ShowMoreButtonText>{showAllActive ? '닫기' : '전체보기'}</ShowMoreButtonText>
          </ShowMoreButtonInline>
        )}
      </SectionIntro>
    );
  }, [activeCardsAll.length, showAllActive]);

  const expiredSection = useMemo(() => {
    // 항상 표시되어야 하므로 showExpiredSection 체크 제거
    const showToggle = expiredCardsAll.length > 3;
    return (
      <ExpiredSectionContainer>
        <ExpiredHeader onPress={showToggle ? handleExtendSectionToggle : undefined} activeOpacity={showToggle ? 0.6 : 1}>
          <ExpiredTitle>
            이용권 종료 고객 <SectionCount>{expiredCardsAll.length}명</SectionCount>
          </ExpiredTitle>
          {showToggle && <ExpandIcon>{showExpiredExpanded ? '▴' : '▾'}</ExpandIcon>}
        </ExpiredHeader>
        {(!showToggle || showExpiredExpanded) ? (
          expiredCardsAll.length === 0 ? (
            <EmptyContainer>
              <EmptyImage source={endImage} resizeMode="contain" />
              <EmptyTitle>이용권 종료된 고객이 없습니다.</EmptyTitle>
            </EmptyContainer>
          ) : (
            expiredCardsCollapsed.map((card) => (
              <View key={card.student.id}>{renderStudentCard(card)}</View>
            ))
          )
        ) : null}
        {showToggle && (
          <ShowMoreButton onPress={() => setShowAllExpired((prev) => !prev)}>
            <ShowMoreButtonText>{showAllExpired ? '닫기' : '고객 전체보기'}</ShowMoreButtonText>
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
    // activeToggle은 이제 listHeaderComponent에 포함됨
    if (!renderFooter) {
      return null;
    }
    return <View>{renderFooter}</View>;
  }, [renderFooter]);

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

      {/* 헤더 및 검색 영역 */}
      <HeaderTopSection>
      {/* 헤더: 서브텍스트 + 수강생 추가 버튼 */}
      <Header>
        <HeaderTexts>
          <HeaderTitle>이용권 고객</HeaderTitle>
          <HeaderSubtext>
              총 {totalStudentsCount}명 · 계약중 {totalActiveCount}명
          </HeaderSubtext>
        </HeaderTexts>
        <AddButton onPress={handleAddStudent}>
          <AddButtonText>+ 이용권</AddButtonText>
        </AddButton>
      </Header>

      {/* 검색 */}
      <SearchRow>
        <SearchInputWrapper>
          <SearchIconImage source={require('../../assets/s1.png')} />
          <SearchInput
            placeholder="이름 · 관리명으로 검색"
            value={searchInput}
            onChangeText={setSearchInput}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
        </SearchInputWrapper>
      </SearchRow>
      </HeaderTopSection>

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
              {primaryCards.map((item, index) => (
                <React.Fragment key={`${item.student.id}-${item.id ?? index}`}>
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
          totalAmount={selectedContractForExtend.totalAmount}
          remainingAmount={selectedContractForExtend.remainingAmount}
        />
      )}
    </Container>
  );
}

export default function StudentsListScreen() {
  return <StudentsListContent />;
}

// Styled Components
const Container = styled.SafeAreaView`
  flex: 1;
  background-color: #ffffff;
`;

const HeaderTopSection = styled.View`
  background-color: #303643;
  padding: 20px 16px 16px 16px;
`;

const Header = styled.View`
  padding: 0 0 12px 0;
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
  color: #ffffff;
  margin-bottom: 4px;
`;

const HeaderSubtext = styled.Text`
  font-size: 13px;
  color: #ffffff;
`;

const AddButton = styled.TouchableOpacity`
  padding: 8px 16px;
  background-color: #1d42d8;
  border-radius: 8px;
`;

const AddButtonText = styled.Text`
  color: #fff;
  font-size: 14px;
  font-weight: 600;
`;

const SearchRow = styled.View`
  padding: 0;
  flex-direction: row;
  align-items: center;
  gap: 10px;
`;

const SearchInputWrapper = styled.View`
  flex: 1;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  background-color: #ffffff;
  border-radius: 12px;
  padding: 0 12px;
  height: 44px;
  border-width: 1px;
  border-color: #e0e0e0;
`;

const SearchIconImage = styled.Image`
  width: 18px;
  height: 18px;
`;

const SearchInput = styled.TextInput`
  flex: 1;
  font-size: 14px;
  color: #111;
  padding: 0;
`;

const Card = styled.TouchableOpacity`
  background-color: #ffffff;
  border-radius: 12px;
  padding: 12px 16px;
  margin: 8px 0;
  border-width: 1px;
  border-color: #f0f0f0;
  position: relative;
  overflow: hidden;
`;

const CardLeftLine = styled.View<{ isExpired?: boolean }>`
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background-color: ${(props) => (props.isExpired ? '#eef2ff' : '#0f1b4d')};
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

const Badge = styled.View<{ contractType?: boolean; billingType?: boolean; absencePolicy?: boolean; billingTypeValue?: string; contractTypeValue?: 'sessions' | 'amount' | 'unknown'; absencePolicyValue?: string }>`
  padding: 4px 8px;
  background-color: ${(props) => {
    if (props.contractType) {
      // 금액권: 블루 배경, 횟수권: 빨강 배경
      return props.contractTypeValue === 'amount' ? '#e8f2ff' : '#ffe5e5';
    }
    if (props.billingType && props.billingTypeValue === 'prepaid') return '#e8f2ff';
    if (props.billingType && props.billingTypeValue === 'postpaid') return '#fff4e6';
    if (props.absencePolicy) {
      // 대체: 퍼플 배경, 소멸: 초록 배경
      return props.absencePolicyValue === 'carry_over' ? '#f3e8ff' : '#f0f8f0';
    }
    return '#f0f8f0';
  }};
  border-radius: 12px;
`;

const BadgeText = styled.Text<{ contractType?: boolean; absencePolicy?: boolean; billingTypeValue?: string; contractTypeValue?: 'sessions' | 'amount' | 'unknown'; absencePolicyValue?: string }>`
  font-size: 11px;
  color: ${(props) => {
    if (props.contractType) {
      // 금액권: 블루 텍스트, 횟수권: 빨강 텍스트
      return props.contractTypeValue === 'amount' ? '#246bfd' : '#ff3b30';
    }
    if (props.absencePolicy) {
      // 대체: 퍼플 텍스트, 소멸: 초록 텍스트
      return props.absencePolicyValue === 'carry_over' ? '#8b5cf6' : '#34c759';
    }
    if (props.billingTypeValue === 'prepaid') return '#246bfd';
    if (props.billingTypeValue === 'postpaid') return '#ff9500';
    return '#246bfd';
  }};
  font-weight: 600;
`;

const CardRow2Container = styled.View`
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 4px;
`;

const CardRow2 = styled.Text`
  font-size: 14px;
  color: #666;
  margin-bottom: 4px;
`;

const CardRow2Subject = styled.Text`
  font-size: 14px;
  color: #0f1b4d;
  font-weight: 500;
`;

const CardRow2Separator = styled.Text`
  font-size: 14px;
  color: #666;
`;

const CardRow2Day = styled.Text`
  font-size: 14px;
  color: #ff3b30;
  font-weight: 500;
`;

const CardRow2Time = styled.Text`
  font-size: 14px;
  color: #FFD700;
  font-weight: 500;
`;

const CardRow3 = styled.Text`
  font-size: 13px;
  color: #888;
`;

const RowWithFooter = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: flex-start;
  margin-top: 6px;
  gap: 12px;
  min-height: 32px;
`;

const FooterLeft = styled.View`
  flex: 1;
  justify-content: flex-start;
`;

const ButtonGroup = styled.View`
  flex-direction: row;
  gap: 8px;
  margin-left: 8px;
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
  margin-top: 4px;
  font-size: 13px;
  color: #4a4a4a;
`;

const ExtendNoteLabel = styled.Text`
  color: #000000;
  font-weight: 400;
  font-size: 13px;
`;

const ExtendNoteTotal = styled.Text`
  color: #ff3b30;
  font-weight: 600;
  font-size: 13px;
`;

const ExtendNoteRemaining = styled.Text`
  color: #ff9500;
  font-weight: 600;
  font-size: 13px;
`;

const ExtendActionButton = styled.TouchableOpacity`
  padding: 8px 14px;
  background-color: #eef2ff;
  border-radius: 8px;
`;

const ExtendActionButtonText = styled.Text`
  color: #1d42d8;
  font-size: 14px;
  font-weight: 600;
`;

const SectionIntro = styled.View`
  padding: 0 0 12px 0;
  margin-bottom: 12px;
  flex-direction: row;
  align-items: flex-start;
  justify-content: space-between;
`;

const SectionHeaderLeft = styled.View`
  flex: 1;
`;

const SectionSubtext = styled.Text`
  font-size: 12px;
  color: #8e8e93;
  margin-top: 4px;
`;

const SectionContainer = styled.View`
  background-color: #ffffff;
  margin: 0;
  padding: 16px 16px 16px 16px;
  border-bottom-width: 1px;
  border-bottom-color: #e0e0e0;
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
  font-size: 13px;
  font-weight: 600;
`;

const SectionTitleText = styled.Text`
  font-size: 18px;
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
  margin: 0;
  padding: 16px;
`;

const ExpiredHeader = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding-vertical: 0;
  margin-bottom: 12px;
`;

const ExpiredTitle = styled.Text`
  font-size: 18px;
  font-weight: 700;
  color: #333333;
`;

const ExpandIcon = styled.Text`
  font-size: 14px;
  color: #8e8e93;
`;

const DetailButton = styled.TouchableOpacity`
  padding: 8px 16px;
  background-color: #1d42d8;
  border-radius: 8px;
`;

const DetailButtonText = styled.Text`
  color: #fff;
  font-size: 14px;
  font-weight: 600;
`;

const DeleteButton = styled.TouchableOpacity`
  padding: 8px 16px;
  background-color: #ff3b30;
  border-radius: 8px;
`;

const DeleteButtonText = styled.Text`
  color: #fff;
  font-size: 14px;
  font-weight: 600;
`;

const CardScheduleButton = styled.TouchableOpacity`
  padding: 4px 0;
`;

const CardScheduleButtonText = styled.Text`
  font-size: 12px;
  font-weight: 500;
  color: #6b7280; /* 회색 텍스트 */
  flex-direction: row;
`;

const CardScheduleButtonArrow = styled.Text`
  font-size: 12px;
  font-weight: 500;
  color: #6b7280;
  margin-left: 2px;
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
  min-height: 160px;
  justify-content: center;
  align-items: center;
  padding: 40px 20px;
`;

const EmptyImage = styled.Image`
  width: 64px;
  height: 64px;
  opacity: 0.5;
  margin-bottom: 16px;
`;

const EmptyTitle = styled.Text`
  font-size: 14px;
  color: #8e8e93;
  text-align: center;
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

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: 16,
  },
});
