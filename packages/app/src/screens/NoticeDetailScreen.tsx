import React, { useState, useEffect } from 'react';
import { ActivityIndicator, Linking, Alert } from 'react-native';
import { NavigationProp, RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import styled from 'styled-components/native';
import { noticesApi, Notice } from '../api/notices';

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${year}년 ${month}월 ${day}일`;
};

// URL 패턴 정규식
const URL_REGEX = /(https?:\/\/[^\s]+)/g;

// 텍스트를 URL과 일반 텍스트로 파싱
const parseTextWithUrls = (text: string): Array<{ type: 'text' | 'url'; content: string }> => {
  const parts: Array<{ type: 'text' | 'url'; content: string }> = [];
  let lastIndex = 0;
  let match;

  while ((match = URL_REGEX.exec(text)) !== null) {
    // URL 이전의 일반 텍스트
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: text.substring(lastIndex, match.index),
      });
    }
    // URL
    parts.push({
      type: 'url',
      content: match[0],
    });
    lastIndex = match.index + match[0].length;
  }

  // 마지막 URL 이후의 일반 텍스트
  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      content: text.substring(lastIndex),
    });
  }

  // URL이 없으면 전체를 일반 텍스트로
  if (parts.length === 0) {
    parts.push({ type: 'text', content: text });
  }

  return parts;
};

// URL 클릭 핸들러
const handleUrlPress = async (url: string) => {
  try {
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      Alert.alert('알림', '이 링크를 열 수 없습니다.');
    }
  } catch (error) {
    console.error('[NoticeDetail] Error opening URL:', error);
    Alert.alert('오류', '링크를 열 수 없습니다.');
  }
};

type NoticeStackParamList = {
  NoticesList: undefined;
  NoticeDetail: { noticeId: number };
};

export default function NoticeDetailScreen() {
  const route = useRoute<RouteProp<NoticeStackParamList, 'NoticeDetail'>>();
  const navigation = useNavigation<NavigationProp<NoticeStackParamList, 'NoticeDetail'>>();
  const { noticeId } = route.params;
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadNotice = async () => {
      try {
        setError(null);
        const data = await noticesApi.findOne(noticeId);
        setNotice(data);
      } catch (err: any) {
        console.error('[NoticeDetail] load error', err);
        setError(err?.message || '공지사항을 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    };

    loadNotice();
  }, [noticeId]);

  useEffect(() => {
    if (notice) {
      navigation.setOptions({
        title: notice.is_important ? '🔴 중요 공지' : '공지사항',
      });
    }
  }, [notice, navigation]);

  if (loading) {
    return (
      <Container>
        <CenteredContainer>
          <ActivityIndicator size="large" color="#1d42d8" />
          <CenteredText>공지사항을 불러오는 중...</CenteredText>
        </CenteredContainer>
      </Container>
    );
  }

  if (error || !notice) {
    return (
      <Container>
        <CenteredContainer>
          <ErrorText>{error || '공지사항을 찾을 수 없습니다.'}</ErrorText>
        </CenteredContainer>
      </Container>
    );
  }

  return (
    <Container>
      <StyledScrollView showsVerticalScrollIndicator={false}>
        <Content>
          <Header>
            {notice.is_important && (
              <ImportantBadge>
                <ImportantBadgeText>중요</ImportantBadgeText>
              </ImportantBadge>
            )}
            <DateText>{formatDate(notice.created_at)}</DateText>
          </Header>
          <Title>{notice.title}</Title>
          <ContentTextContainer>
            {parseTextWithUrls(notice.content).map((part, index) => {
              if (part.type === 'url') {
                return (
                  <LinkText key={index} onPress={() => handleUrlPress(part.content)}>
                    {part.content}
                  </LinkText>
                );
              }
              return <ContentText key={index}>{part.content}</ContentText>;
            })}
          </ContentTextContainer>
        </Content>
      </StyledScrollView>
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
`;

const StyledScrollView = styled.ScrollView`
  flex: 1;
`;

const Content = styled.View`
  background-color: #ffffff;
  margin: 16px;
  padding: 20px;
  border-radius: 12px;
  shadow-color: #000;
  shadow-opacity: 0.05;
  shadow-offset: 0px 2px;
  shadow-radius: 4px;
  elevation: 2;
`;

const Header = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
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

const DateText = styled.Text`
  font-size: 13px;
  color: #8e8e93;
`;

const Title = styled.Text`
  font-size: 20px;
  font-weight: 700;
  color: #111111;
  margin-bottom: 16px;
  line-height: 28px;
`;

const ContentTextContainer = styled.Text`
  font-size: 16px;
  color: #333333;
  line-height: 24px;
`;

const ContentText = styled.Text`
  font-size: 16px;
  color: #333333;
  line-height: 24px;
`;

const LinkText = styled.Text`
  font-size: 16px;
  color: #1d42d8;
  line-height: 24px;
  text-decoration-line: underline;
`;

