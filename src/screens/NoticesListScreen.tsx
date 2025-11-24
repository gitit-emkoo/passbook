import React, { useState, useCallback, useEffect } from 'react';
import { ActivityIndicator, RefreshControl } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import styled from 'styled-components/native';
import { noticesApi, Notice } from '../api/notices';

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
};

export default function NoticesListScreen() {
  const navigation = useNavigation();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadNotices = useCallback(async () => {
    try {
      setError(null);
      const data = await noticesApi.findAll();
      setNotices(data);
    } catch (err: any) {
      console.error('[NoticesList] load error', err);
      setError(err?.message || '공지사항을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadNotices();
    }, [loadNotices]),
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadNotices();
  }, [loadNotices]);

  const handleNoticePress = useCallback(
    (noticeId: number) => {
      navigation.navigate('NoticeDetail' as never, { noticeId } as never);
    },
    [navigation],
  );

  if (loading) {
    return (
      <Container>
        <CenteredContainer>
          <ActivityIndicator size="large" color="#ff6b00" />
          <CenteredText>공지사항을 불러오는 중...</CenteredText>
        </CenteredContainer>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <CenteredContainer>
          <ErrorText>{error}</ErrorText>
          <RetryButton onPress={loadNotices}>
            <RetryButtonText>다시 시도</RetryButtonText>
          </RetryButton>
        </CenteredContainer>
      </Container>
    );
  }

  return (
    <Container>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {notices.length === 0 ? (
          <EmptyContainer>
            <EmptyText>공지사항이 없습니다.</EmptyText>
          </EmptyContainer>
        ) : (
          <NoticesList>
            {notices.map((notice) => (
              <NoticeCard key={notice.id} onPress={() => handleNoticePress(notice.id)}>
                <NoticeCardHeader>
                  {notice.is_important && (
                    <ImportantBadge>
                      <ImportantBadgeText>중요</ImportantBadgeText>
                    </ImportantBadge>
                  )}
                  <NoticeDate>{formatDate(notice.created_at)}</NoticeDate>
                </NoticeCardHeader>
                <NoticeTitle>{notice.title}</NoticeTitle>
                <NoticePreview numberOfLines={2}>{notice.content}</NoticePreview>
                <ChevronIcon>›</ChevronIcon>
              </NoticeCard>
            ))}
          </NoticesList>
        )}
      </ScrollView>
    </Container>
  );
}

const Container = styled.SafeAreaView`
  flex: 1;
  background-color: #f2f2f7;
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
  margin-top: 12px;
`;

const ErrorText = styled.Text`
  font-size: 16px;
  color: #ff3b30;
  text-align: center;
  margin-bottom: 12px;
`;

const RetryButton = styled.TouchableOpacity`
  padding: 10px 18px;
  background-color: #ff6b00;
  border-radius: 8px;
`;

const RetryButtonText = styled.Text`
  font-size: 14px;
  font-weight: 600;
  color: #fff;
`;

const EmptyContainer = styled.View`
  flex: 1;
  justify-content: center;
  align-items: center;
  padding: 40px;
`;

const EmptyText = styled.Text`
  font-size: 16px;
  color: #8e8e93;
`;

const ScrollView = styled.ScrollView`
  flex: 1;
`;

const NoticesList = styled.View`
  padding: 16px;
  gap: 12px;
`;

const NoticeCard = styled.TouchableOpacity`
  background-color: #ffffff;
  border-radius: 12px;
  padding: 16px;
  shadow-color: #000;
  shadow-opacity: 0.05;
  shadow-offset: 0px 2px;
  shadow-radius: 4px;
  elevation: 2;
  position: relative;
`;

const NoticeCardHeader = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
`;

const ImportantBadge = styled.View`
  background-color: #ff3b30;
  padding: 4px 8px;
  border-radius: 4px;
`;

const ImportantBadgeText = styled.Text`
  font-size: 11px;
  font-weight: 600;
  color: #ffffff;
`;

const NoticeDate = styled.Text`
  font-size: 12px;
  color: #8e8e93;
`;

const NoticeTitle = styled.Text`
  font-size: 16px;
  font-weight: 600;
  color: #111111;
  margin-bottom: 8px;
`;

const NoticePreview = styled.Text`
  font-size: 14px;
  color: #666666;
  line-height: 20px;
`;

const ChevronIcon = styled.Text`
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-12px);
  font-size: 24px;
  color: #c7c7cc;
`;

