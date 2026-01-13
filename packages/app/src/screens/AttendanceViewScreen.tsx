import React, { useState, useEffect } from 'react';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { ActivityIndicator, Alert, Linking, Platform, Clipboard } from 'react-native';
import { WebView } from 'react-native-webview';
import { HomeStackParamList } from '../navigation/AppNavigator';
import { attendanceApi } from '../api/attendance';
import styled from 'styled-components/native';

const Container = styled.View`
  flex: 1;
  background-color: #ffffff;
`;

const LoadingContainer = styled.View`
  flex: 1;
  justify-content: center;
  align-items: center;
  background-color: #ffffff;
`;

const Footer = styled.View`
  padding: 16px;
  border-top-width: 1px;
  border-top-color: #f0f0f0;
  background-color: #ffffff;
`;

const SendButton = styled.TouchableOpacity<{ disabled?: boolean }>`
  padding: 14px 16px;
  border-radius: 10px;
  background-color: #1d42d8;
  align-items: center;
  justify-content: center;
  opacity: ${(props) => (props.disabled ? 0.5 : 1)};
`;

const SendButtonText = styled.Text`
  color: #ffffff;
  font-size: 16px;
  font-weight: 600;
`;

function AttendanceViewContent() {
  const route = useRoute<RouteProp<HomeStackParamList, 'AttendanceView'>>();
  const navigation = useNavigation();
  const { attendanceLogId, studentPhone } = route.params;
  // 디버그 로그 제거: 동일한 파라미터가 여러 번 출력됨
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const loadAttendance = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // 백엔드에서 HTML 가져오기 (이제 HTML을 직접 반환)
        const viewLink = attendanceApi.getViewLink(attendanceLogId);
        const response = await fetch(viewLink);
        
        if (!response.ok) {
          throw new Error('사용처리 완료 안내를 불러오지 못했습니다.');
        }
        
        // HTML을 직접 받아서 사용
        const htmlContent = await response.text();
        setHtml(htmlContent);
      } catch (err: any) {
        console.error('[AttendanceView] load error', err);
        setError(err?.message || '사용처리 완료 안내를 불러오는 중 오류가 발생했습니다.');
        Alert.alert('오류', err?.message || '사용처리 완료 안내를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    };

    loadAttendance();
  }, [attendanceLogId]);

  const handleSend = async () => {
    if (!studentPhone) {
      Alert.alert('오류', '수신자 번호가 없습니다.');
      return;
    }

    try {
      setSending(true);
      
      // 백엔드에 SMS 전송 완료 표시
      await attendanceApi.markSmsSent(attendanceLogId);
      
      const attendanceLink = attendanceApi.getViewLink(attendanceLogId);
      const message = `이용권 사용 처리 완료 안내: ${attendanceLink}`;
      const smsUrl = Platform.select({
        ios: `sms:${studentPhone}&body=${encodeURIComponent(message)}`,
        android: `sms:${studentPhone}?body=${encodeURIComponent(message)}`,
      });

      if (smsUrl && (await Linking.canOpenURL(smsUrl))) {
        await Linking.openURL(smsUrl);
        Alert.alert('완료', '사용처리 완료 안내가 전송되었습니다.');
        navigation.goBack();
      } else {
        await Clipboard.setString(attendanceLink);
        Alert.alert('완료', '링크가 클립보드에 복사되었습니다.');
      }
    } catch (err: any) {
      console.error('[AttendanceView] send error', err);
      Alert.alert('오류', err?.message || '전송에 실패했습니다.');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <LoadingContainer>
        <ActivityIndicator size="large" color="#ff6b00" />
      </LoadingContainer>
    );
  }

  if (error || !html) {
    return (
      <LoadingContainer>
        <ActivityIndicator size="large" color="#ff6b00" />
      </LoadingContainer>
    );
  }

  // 미리보기 화면에서는 "링크 공유하기" 버튼 숨기기
  const hideShareButtonScript = `
    (function() {
      setTimeout(function() {
        const shareButton = document.querySelector('.share-button');
        if (shareButton) {
          shareButton.style.display = 'none';
        }
      }, 100);
    })();
    true;
  `;

  return (
    <Container>
      <WebView
        source={{ html }}
        style={{ flex: 1 }}
        scalesPageToFit={true}
        showsVerticalScrollIndicator={true}
        showsHorizontalScrollIndicator={false}
        injectedJavaScript={hideShareButtonScript}
        onMessage={() => {}}
      />
      <Footer>
        <SendButton onPress={handleSend} disabled={sending}>
          {sending ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <SendButtonText>전송</SendButtonText>
          )}
        </SendButton>
      </Footer>
    </Container>
  );
}

export default function AttendanceViewScreen() {
  return <AttendanceViewContent />;
}

