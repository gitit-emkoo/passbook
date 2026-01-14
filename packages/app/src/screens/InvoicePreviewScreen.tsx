import React, { useState, useEffect, useRef } from 'react';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { ActivityIndicator, Alert, Dimensions, FlatList, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { SettlementStackParamList, SettlementStackNavigationProp } from '../navigation/AppNavigator';
import { invoicesApi } from '../api/invoices';
import { useInvoicesStore } from '../store/useInvoicesStore';
import styled from 'styled-components/native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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

const WebViewContainer = styled.View`
  width: ${SCREEN_WIDTH}px;
  flex: 1;
  overflow: hidden;
`;

const Footer = styled.View`
  padding: 16px;
  background-color: #ffffff;
  border-top-width: 1px;
  border-top-color: #e0e0e0;
`;

const SendButton = styled.TouchableOpacity`
  background-color: #1d42d8;
  border-radius: 12px;
  padding: 16px;
  align-items: center;
  justify-content: center;
`;

const SendButtonText = styled.Text`
  color: #ffffff;
  font-size: 16px;
  font-weight: 700;
`;

const PageIndicator = styled.View`
  flex-direction: row;
  justify-content: center;
  align-items: center;
  padding: 12px;
  gap: 8px;
`;

const IndicatorDot = styled.TouchableOpacity<{ $active: boolean }>`
  width: ${props => props.$active ? '8px' : '6px'};
  height: ${props => props.$active ? '8px' : '6px'};
  border-radius: ${props => props.$active ? '4px' : '3px'};
  background-color: ${props => props.$active ? '#1d42d8' : '#d0d0d0'};
  margin: 0 4px;
`;

function InvoicePreviewContent() {
  const route = useRoute<RouteProp<SettlementStackParamList, 'InvoicePreview'>>();
  const navigation = useNavigation<SettlementStackNavigationProp>();
  const { invoiceIds, initialIndex = 0 } = route.params;
  const [htmls, setHtmls] = useState<Array<{ id: number; html: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const flatListRef = useRef<FlatList>(null);
  const fetchSections = useInvoicesStore((state) => state.fetchSections);

  useEffect(() => {
    const loadInvoices = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // 모든 청구서 HTML 가져오기
        const htmlPromises = invoiceIds.map(async (id) => {
          try {
            const viewLink = invoicesApi.getViewLink(id);
            const response = await fetch(viewLink);
            
            if (!response.ok) {
              throw new Error(`청구서 ${id}를 불러오지 못했습니다.`);
            }
            
            const html = await response.text();
            return { id, html };
          } catch (err) {
            console.error(`[InvoicePreview] load error for invoice ${id}`, err);
            return { id, html: null };
          }
        });

        const results = await Promise.all(htmlPromises);
        setHtmls(results);
      } catch (err: any) {
        console.error('[InvoicePreview] load error', err);
        setError(err?.message || '청구서를 불러오는 중 오류가 발생했습니다.');
        Alert.alert('오류', err?.message || '청구서를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    };

    loadInvoices();
  }, [invoiceIds]);

  useEffect(() => {
    // 스크롤 위치 조정
    if (flatListRef.current && currentIndex < htmls.length) {
      flatListRef.current.scrollToIndex({
        index: currentIndex,
        animated: true,
      });
    }
  }, [currentIndex, htmls.length]);

  const handleSend = async () => {
    try {
      // 모든 선택된 청구서 전송 (SMS로만 전송)
      await invoicesApi.send(invoiceIds, 'sms');
      
      // 데이터 새로고침
      await fetchSections(true);
      
      Alert.alert('완료', `${invoiceIds.length}건의 청구서가 전송되었습니다.`, [
        {
          text: '확인',
          onPress: () => {
            navigation.goBack();
          },
        },
      ]);
    } catch (error: any) {
      console.error('[InvoicePreview] send error', error);
      Alert.alert('오류', error?.response?.data?.message || error?.message || '청구서 전송에 실패했습니다.');
    }
  };

  const handleDotPress = (index: number) => {
    if (index >= 0 && index < htmls.length && index !== currentIndex) {
      setCurrentIndex(index);
      if (flatListRef.current) {
        flatListRef.current.scrollToIndex({
          index,
          animated: true,
        });
      }
    }
  };

  const renderItem = ({ item, index }: { item: { id: number; html: string | null }; index: number }) => (
    <WebViewContainer>
      {item.html ? (
        <WebView
          source={{ html: item.html }}
          style={{ flex: 1 }}
          scalesPageToFit={true}
          showsVerticalScrollIndicator={true}
          showsHorizontalScrollIndicator={false}
          javaScriptEnabled={true}
          scrollEnabled={true}
          bounces={false}
          overScrollMode="never"
          nestedScrollEnabled={false}
          androidLayerType="hardware"
          cacheEnabled={true}
          cacheMode="LOAD_DEFAULT"
          directionalLockEnabled={true}
          startInLoadingState={false}
          domStorageEnabled={false}
          sharedCookiesEnabled={false}
        />
      ) : (
        <LoadingContainer>
          <ActivityIndicator size="large" color="#ff6b00" />
        </LoadingContainer>
      )}
    </WebViewContainer>
  );

  if (loading) {
    return (
      <LoadingContainer>
        <ActivityIndicator size="large" color="#ff6b00" />
      </LoadingContainer>
    );
  }

  if (error || htmls.length === 0) {
    return (
      <LoadingContainer>
        <ActivityIndicator size="large" color="#ff6b00" />
      </LoadingContainer>
    );
  }

  return (
    <Container>
      <FlatList
        ref={flatListRef}
        data={htmls}
        renderItem={renderItem}
        keyExtractor={(item) => String(item.id)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        scrollEventThrottle={16}
        decelerationRate="fast"
        bounces={false}
        nestedScrollEnabled={false}
        removeClippedSubviews={false}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
        onScrollToIndexFailed={(info) => {
          // 인덱스 스크롤 실패 시 대체 처리
          const wait = new Promise((resolve) => setTimeout(resolve, 500));
          wait.then(() => {
            flatListRef.current?.scrollToIndex({ index: info.index, animated: true });
          });
        }}
      />
      
      {htmls.length > 1 && (
        <PageIndicator>
          {htmls.map((_, index) => (
            <IndicatorDot
              key={index}
              $active={index === currentIndex}
              onPress={() => handleDotPress(index)}
              activeOpacity={0.7}
            />
          ))}
        </PageIndicator>
      )}
      
      <Footer>
        <SendButton onPress={handleSend}>
          <SendButtonText>전송하기 ({invoiceIds.length}건)</SendButtonText>
        </SendButton>
      </Footer>
    </Container>
  );
}

export default function InvoicePreviewScreen() {
  return <InvoicePreviewContent />;
}
