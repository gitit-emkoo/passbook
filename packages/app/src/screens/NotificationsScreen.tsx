import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl } from 'react-native';
import styled from 'styled-components/native';
import { useNavigation } from '@react-navigation/native';
import { notificationsApi } from '../api/notifications';
import { MainAppStackNavigationProp } from '../navigation/AppNavigator';

type NotificationCategory = 'settlement' | 'student' | 'attendance' | 'contract' | 'system';

interface NotificationItem {
  id: number;
  category: NotificationCategory;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  target?: {
    screen: 'Settlement' | 'Students' | 'Home';
    params?: any;
  };
}

const STUB_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 1,
    category: 'settlement',
    title: '11월 정산 미전송',
    message: '11월 정산 대상 3명이 아직 전송되지 않았습니다.',
    createdAt: new Date().toISOString(),
    read: false,
    target: { screen: 'Settlement' },
  },
  {
    id: 2,
    category: 'student',
    title: '김수민 수강생 계약 만료 예정',
    message: '계약 종료 5일 전입니다. 연장 안내를 진행해 주세요.',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    read: false,
    target: { screen: 'Students', params: { screen: 'StudentDetail', params: { studentId: 21 } } },
  },
  {
    id: 3,
    category: 'attendance',
    title: '장기 미출석 알림',
    message: '박소정 수강생이 3주 이상 미출석 상태입니다.',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    read: true,
    target: { screen: 'Students' },
  },
  {
    id: 4,
    category: 'contract',
    title: '계약서 전송 대기',
    message: '최지우 수강생과 작성한 계약서가 아직 전송되지 않았습니다.',
    createdAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    read: false,
    target: { screen: 'Home' },
  },
];

const FILTERS: { label: string; value: 'all' | NotificationCategory }[] = [
  { label: '전체', value: 'all' },
  { label: '정산', value: 'settlement' },
  { label: '수강생', value: 'student' },
  { label: '출결', value: 'attendance' },
];

const CATEGORY_ICON: Record<NotificationCategory, string> = {
  settlement: '💰',
  student: '📘',
  attendance: '⚠️',
  contract: '📆',
  system: '🔔',
};

const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  settlement: '정산',
  student: '수강생',
  attendance: '출결',
  contract: '계약',
  system: '시스템',
};

export default function NotificationsScreen() {
  const navigation = useNavigation<MainAppStackNavigationProp>();
  const [filter, setFilter] = useState<'all' | NotificationCategory>('all');
  const [items, setItems] = useState<NotificationItem[]>(STUB_NOTIFICATIONS);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const unreadCount = useMemo(() => items.filter((item) => !item.read).length, [items]);

  const filteredItems = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((item) => item.category === filter);
  }, [items, filter]);

  const loadNotifications = useCallback(
    async (selectedFilter: typeof filter) => {
      setLoading(true);
      try {
        const data = await notificationsApi.getAll(selectedFilter === 'all' ? undefined : selectedFilter);
        setItems(data);
      } catch (error) {
        console.warn('[Notifications] load error, fallback to stub', error);
        // 필터에 맞춰 스텁 데이터를 반환
        setItems(STUB_NOTIFICATIONS);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    loadNotifications(filter);
  }, [filter, loadNotifications]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadNotifications(filter);
    setRefreshing(false);
  }, [filter, loadNotifications]);

  const handleMarkAllRead = useCallback(async () => {
    try {
      await notificationsApi.markAllAsRead();
    } catch (error) {
      console.warn('[Notifications] mark all read failed, local only', error);
    } finally {
      setItems((prev) => prev.map((item) => ({ ...item, read: true })));
    }
  }, []);

  const handleCardPress = useCallback(
    (item: NotificationItem) => {
      setItems((prev) => prev.map((notif) => (notif.id === item.id ? { ...notif, read: true } : notif)));

      if (!item.target) {
        return;
      }

      navigation.navigate('MainTabs', {
        screen: item.target.screen,
        params: item.target.params,
      } as any);
    },
    [navigation],
  );

  const renderItem = useCallback(
    ({ item }: { item: NotificationItem }) => (
      <Card onPress={() => handleCardPress(item)}>
        <CardIcon>{CATEGORY_ICON[item.category]}</CardIcon>
        <CardContent>
          <CardHeader>
            <CardTitle numberOfLines={1}>{item.title}</CardTitle>
            {!item.read && <UnreadDot />}
          </CardHeader>
          <CardMessage numberOfLines={2}>{item.message}</CardMessage>
          <CardMeta>
            <CardMetaText>{CATEGORY_LABEL[item.category]}</CardMetaText>
            <CardMetaDot>•</CardMetaDot>
            <CardMetaText>{formatKoreanDateTime(item.createdAt)}</CardMetaText>
          </CardMeta>
        </CardContent>
      </Card>
    ),
    [handleCardPress],
  );

  return (
    <Container>
      <Header>
        <BackPlaceholder />
        <HeaderTitle>알림</HeaderTitle>
        <BackPlaceholder />
      </Header>
      <Subtitle>읽지 않은 알림 {unreadCount}개</Subtitle>

      <FilterWrapper>
        <FilterRow
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 0, gap: 8 }}
        >
          {FILTERS.map((chip) => (
            <FilterChip key={chip.value} active={chip.value === filter} onPress={() => setFilter(chip.value)}>
              <FilterChipText active={chip.value === filter}>{chip.label}</FilterChipText>
            </FilterChip>
          ))}
          <FilterChip active={false} onPress={handleMarkAllRead}>
            <FilterChipText active={false}>모두 읽음</FilterChipText>
          </FilterChip>
        </FilterRow>
      </FilterWrapper>

      {loading ? (
        <Loader>
          <ActivityIndicator color="#ff6b00" />
          <LoaderText>알림을 불러오는 중...</LoaderText>
        </Loader>
      ) : filteredItems.length === 0 ? (
        <EmptyContainer>
          <EmptyIconWrapper>
            <EmptyIcon>🔔</EmptyIcon>
          </EmptyIconWrapper>
          <EmptyTitle>새로운 알림이 없어요</EmptyTitle>
          <EmptyDescription>정산, 출결, 계약 알림이 이곳에 표시됩니다.</EmptyDescription>
        </EmptyContainer>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#ff6b00" />}
        />
      )}
    </Container>
  );
}

function formatKoreanDateTime(isoString: string) {
  const date = new Date(isoString);
  return date.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const Container = styled.SafeAreaView`
  flex: 1;
  background-color: #f4f0ff;
  padding: 20px 20px 0;
`;

const Header = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const HeaderTitle = styled.Text`
  font-size: 22px;
  font-weight: 700;
  color: #111111;
`;

const BackPlaceholder = styled.View`
  width: 32px;
  height: 32px;
`;

const Subtitle = styled.Text`
  font-size: 15px;
  color: #666666;
  margin-top: 10px;
  margin-bottom: 18px;
`;

const FilterWrapper = styled.View`
  margin-bottom: 24px;
`;

const FilterRow = styled.ScrollView``;

const FilterChip = styled.TouchableOpacity<{ active: boolean }>`
  padding: 10px 18px;
  border-radius: 20px;
  border-width: 1px;
  border-color: ${(props) => (props.active ? '#ff924a' : '#e1e1e1')};
  background-color: ${(props) => (props.active ? '#ff6b00' : '#ffffff')};
  shadow-color: #ffdcc2;
  shadow-opacity: ${(props) => (props.active ? 0.3 : 0)};
  shadow-offset: 0px 5px;
  shadow-radius: 12px;
  elevation: ${(props) => (props.active ? 4 : 0)};
`;

const FilterChipText = styled.Text<{ active: boolean }>`
  font-size: 13px;
  color: ${(props) => (props.active ? '#ffffff' : '#666666')};
  font-weight: ${(props) => (props.active ? '700' : '500')};
`;

const Loader = styled.View`
  flex: 1;
  justify-content: center;
  align-items: center;
  gap: 12px;
`;

const LoaderText = styled.Text`
  color: #555555;
  font-size: 14px;
`;

const EmptyContainer = styled.View`
  flex: 1;
  justify-content: center;
  align-items: center;
  padding: 20px;
`;

const EmptyIconWrapper = styled.View`
  width: 90px;
  height: 90px;
  border-radius: 45px;
  background-color: #ffe1c5;
  justify-content: center;
  align-items: center;
  margin-bottom: 16px;
`;

const EmptyIcon = styled.Text`
  font-size: 34px;
`;

const EmptyTitle = styled.Text`
  font-size: 18px;
  font-weight: 600;
  color: #222222;
`;

const EmptyDescription = styled.Text`
  margin-top: 6px;
  font-size: 14px;
  color: #888888;
  text-align: center;
`;

const Card = styled.TouchableOpacity`
  flex-direction: row;
  background-color: #ffffff;
  border-radius: 16px;
  padding: 16px;
  margin-bottom: 12px;
  shadow-color: #000000;
  shadow-opacity: 0.05;
  shadow-offset: 0px 6px;
  shadow-radius: 10px;
  elevation: 2;
`;

const CardIcon = styled.Text`
  font-size: 26px;
  margin-right: 14px;
`;

const CardContent = styled.View`
  flex: 1;
`;

const CardHeader = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const CardTitle = styled.Text`
  font-size: 16px;
  font-weight: 700;
  color: #111111;
  flex: 1;
  margin-right: 8px;
`;

const UnreadDot = styled.View`
  width: 8px;
  height: 8px;
  border-radius: 4px;
  background-color: #ff6b00;
`;

const CardMessage = styled.Text`
  margin-top: 6px;
  font-size: 14px;
  color: #555555;
`;

const CardMeta = styled.View`
  margin-top: 10px;
  flex-direction: row;
  align-items: center;
`;

const CardMetaText = styled.Text`
  font-size: 13px;
  color: #888888;
`;

const CardMetaDot = styled.Text`
  margin: 0 6px;
  color: #bbbbbb;
`;
