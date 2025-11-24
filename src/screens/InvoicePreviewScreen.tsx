import React, { useState, useEffect } from 'react';
import { useRoute, RouteProp } from '@react-navigation/native';
import { ActivityIndicator, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import { SettlementStackParamList } from '../navigation/AppNavigator';
import { invoicesApi } from '../api/invoices';
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

function InvoicePreviewContent() {
  const route = useRoute<RouteProp<SettlementStackParamList, 'InvoicePreview'>>();
  const { invoiceId } = route.params;
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadInvoice = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // 백엔드에서 HTML 가져오기
        const viewLink = invoicesApi.getViewLink(invoiceId);
        const response = await fetch(viewLink);
        
        if (!response.ok) {
          throw new Error('청구서를 불러오지 못했습니다.');
        }
        
        const data = await response.json();
        setHtml(data.html);
      } catch (err: any) {
        console.error('[InvoicePreview] load error', err);
        setError(err?.message || '청구서를 불러오는 중 오류가 발생했습니다.');
        Alert.alert('오류', err?.message || '청구서를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    };

    loadInvoice();
  }, [invoiceId]);

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

  return (
    <Container>
      <WebView
        source={{ html }}
        style={{ flex: 1 }}
        scalesPageToFit={true}
        showsVerticalScrollIndicator={true}
        showsHorizontalScrollIndicator={false}
        javaScriptEnabled={true}
      />
    </Container>
  );
}

export default function InvoicePreviewScreen() {
  return <InvoicePreviewContent />;
}

