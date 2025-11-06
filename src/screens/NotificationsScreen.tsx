import React, { useEffect, useState } from 'react';
import { ScrollView, TouchableOpacity, Alert } from 'react-native';
import styled from 'styled-components/native';
import { useNavigation } from '@react-navigation/native';
import { notificationsApi } from '../api/notifications';

const Container = styled.View`
  flex: 1;
  background-color: #f5f5f5;
`;

const Header = styled.View`
  background-color: #fff;
  padding: 16px;
  padding-top: 50px;
  border-bottom-width: 1px;
  border-bottom-color: #e0e0e0;
`;

const HeaderRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
`;

const Title = styled.Text`
  font-size: 24px;
  font-weight: bold;
  color: #000;
`;

const MarkAllReadButton = styled.TouchableOpacity`
  padding: 8px 16px;
  background-color: #007AFF;
  border-radius: 6px;
`;

const MarkAllReadText = styled.Text`
  color: #fff;
  font-size: 14px;
  font-weight: bold;
`;

const FilterContainer = styled.View`
  flex-direction: row;
  justify-content: space-around;
  padding: 10px 0;
  background-color: #fff;
  border-bottom-width: 1px;
  border-bottom-color: #e0e0e0;
`;

const FilterButton = styled.TouchableOpacity<{ active: boolean }>`
  padding: 8px 12px;
  border-radius: 20px;
  background-color: ${(props) => (props.active ? '#007AFF' : '#f0f0f0')};
`;

const FilterButtonText = styled.Text<{ active: boolean }>`
  color: ${(props) => (props.active ? '#fff' : '#333')};
  font-size: 14px;
`;

const NotificationItem = styled.TouchableOpacity<{ unread?: boolean }>`
  background-color: ${(props) => (props.unread ? '#f0f8ff' : '#fff')};
  padding: 16px;
  margin-bottom: 12px;
  margin-horizontal: 16px;
  border-radius: 8px;
  border-left-width: 4px;
  border-left-color: ${(props) => (props.unread ? '#007AFF' : '#e0e0e0')};
`;

const NotificationTitle = styled.Text<{ unread?: boolean }>`
  font-size: 16px;
  font-weight: ${(props) => (props.unread ? 'bold' : 'normal')};
  color: #000;
  margin-bottom: 4px;
`;

const NotificationBody = styled.Text`
  font-size: 14px;
  color: #666;
  margin-bottom: 8px;
`;

const NotificationTime = styled.Text`
  font-size: 12px;
  color: #999;
`;

const EmptyText = styled.Text`
  text-align: center;
  color: #999;
  margin-top: 40px;
  font-size: 14px;
`;

interface Notification {
  id: number;
  type: string;
  title: string;
  body: string;
  target_route: string;
  is_read: boolean;
  created_at: string;
}

/**
 * 알림 화면
 */
export default function NotificationsScreen() {
  const navigation = useNavigation();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    loadNotifications();
  }, [filter]);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const data = await notificationsApi.getAll(filter !== 'all' ? filter : undefined);
      setNotifications(data);
    } catch (error) {
      console.error('Failed to load notifications:', error);
      Alert.alert('오류', '알림을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleNotificationPress = async (notification: Notification) => {
    // 읽음 처리
    if (!notification.is_read) {
      try {
        await notificationsApi.markAsRead(notification.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n)),
        );
      } catch (error) {
        console.error('Failed to mark as read:', error);
      }
    }

    // 딥링크 처리 (target_route 기반)
    // TODO: 실제 딥링크 처리 구현
    console.log('Navigate to:', notification.target_route);
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      Alert.alert('완료', '모든 알림을 읽음 처리했습니다.');
    } catch (error) {
      console.error('Failed to mark all as read:', error);
      Alert.alert('오류', '알림 읽음 처리에 실패했습니다.');
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return '방금 전';
    if (minutes < 60) return `${minutes}분 전`;
    if (hours < 24) return `${hours}시간 전`;
    if (days < 7) return `${days}일 전`;
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <Container>
      <Header>
        <HeaderRow>
          <Title>알림 {unreadCount > 0 && `(${unreadCount})`}</Title>
          {unreadCount > 0 && (
            <MarkAllReadButton onPress={handleMarkAllRead}>
              <MarkAllReadText>모두 읽음</MarkAllReadText>
            </MarkAllReadButton>
          )}
        </HeaderRow>
      </Header>

      <FilterContainer>
        <FilterButton active={filter === 'all'} onPress={() => setFilter('all')}>
          <FilterButtonText active={filter === 'all'}>전체</FilterButtonText>
        </FilterButton>
        <FilterButton active={filter === 'settlement'} onPress={() => setFilter('settlement')}>
          <FilterButtonText active={filter === 'settlement'}>정산</FilterButtonText>
        </FilterButton>
        <FilterButton active={filter === 'student'} onPress={() => setFilter('student')}>
          <FilterButtonText active={filter === 'student'}>수강생</FilterButtonText>
        </FilterButton>
        <FilterButton active={filter === 'attendance'} onPress={() => setFilter('attendance')}>
          <FilterButtonText active={filter === 'attendance'}>출결</FilterButtonText>
        </FilterButton>
      </FilterContainer>

      <ScrollView style={{ flex: 1, paddingTop: 16 }}>
        {loading ? (
          <EmptyText>로딩 중...</EmptyText>
        ) : notifications.length === 0 ? (
          <EmptyText>알림이 없습니다.</EmptyText>
        ) : (
          notifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              unread={!notification.is_read}
              onPress={() => handleNotificationPress(notification)}
            >
              <NotificationTitle unread={!notification.is_read}>{notification.title}</NotificationTitle>
              <NotificationBody>{notification.body}</NotificationBody>
              <NotificationTime>{formatTime(notification.created_at)}</NotificationTime>
            </NotificationItem>
          ))
        )}
      </ScrollView>
    </Container>
  );
}



