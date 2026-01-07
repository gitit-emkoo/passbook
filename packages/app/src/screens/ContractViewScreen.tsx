import React, { useState, useEffect } from 'react';
import { useRoute, RouteProp } from '@react-navigation/native';
import { ActivityIndicator, Alert, Linking, Platform, Clipboard } from 'react-native';
import { WebView } from 'react-native-webview';
import { StudentsStackParamList } from '../navigation/AppNavigator';
import { contractsApi } from '../api/contracts';
import { useDashboardStore } from '../store/useDashboardStore';
import { useInvoicesStore } from '../store/useInvoicesStore';
import styled from 'styled-components/native';

const Container = styled.View`
  flex: 1;
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

const LoadingContainer = styled.View`
  flex: 1;
  justify-content: center;
  align-items: center;
  background-color: #ffffff;
`;

function ContractViewContent() {
  const route = useRoute<RouteProp<StudentsStackParamList, 'ContractView'>>();
  const { contractId } = route.params;
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contractMeta, setContractMeta] = useState<any | null>(null);
  const [sending, setSending] = useState(false);
  const fetchDashboard = useDashboardStore((s) => s.fetchDashboard);
  const fetchInvoicesCurrent = useInvoicesStore((s) => s.fetchCurrentMonth);
  const fetchInvoicesSections = useInvoicesStore((s) => s.fetchSections);

  useEffect(() => {
    const loadContract = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // 계약서 메타 정보 가져오기 (전화번호 확인용)
        const contract = await contractsApi.getById(contractId);
        setContractMeta(contract);
        
        // 백엔드에서 HTML 가져오기 (연장 기록 포함)
        const viewLink = contractsApi.getViewLink(contractId);
        const response = await fetch(viewLink);
        
        if (!response.ok) {
          throw new Error('계약서를 불러오지 못했습니다.');
        }
        
        const data = await response.json();
        setHtml(data.html);
      } catch (err: any) {
        console.error('[ContractView] load error', err);
        setError(err?.message || '계약서를 불러오는 중 오류가 발생했습니다.');
        Alert.alert('오류', err?.message || '계약서를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    };

    loadContract();
  }, [contractId]);

  const handleSend = async () => {
    if (!contractMeta) {
      Alert.alert('오류', '계약서 정보를 불러오는 중입니다.');
      return;
    }

    const recipientPhone =
      contractMeta.recipient_targets?.[0] ??
      contractMeta.student?.phone ??
      contractMeta.student?.guardian_phone;

    if (!recipientPhone) {
      Alert.alert('오류', '수신자 번호가 없습니다.');
      return;
    }

    try {
      setSending(true);
      const contractLink = contractsApi.getViewLink(contractId);
      const message = `계약서 확인 링크: ${contractLink}`;
      const smsUrl = Platform.select({
        ios: `sms:${recipientPhone}&body=${encodeURIComponent(message)}`,
        android: `sms:${recipientPhone}?body=${encodeURIComponent(message)}`,
      });

      if (smsUrl && (await Linking.canOpenURL(smsUrl))) {
        await Linking.openURL(smsUrl);
        // 계약서 상태를 'sent'로 업데이트
        await contractsApi.updateStatus(contractId, 'sent');
        // 계약서 메타 정보 업데이트
        setContractMeta((prev: any) =>
          prev
            ? {
                ...prev,
                status: 'sent',
              }
            : prev,
        );
        // 대시보드 및 청구서 섹션 새로고침
        await Promise.all([
          fetchDashboard({ force: true }),
          fetchInvoicesCurrent({ historyMonths: 3, force: true }),
          fetchInvoicesSections(true),
        ]);
        Alert.alert('완료', '계약서가 전송되었습니다.');
      } else {
        await Clipboard.setString(contractLink);
        Alert.alert('완료', '계약서 링크가 클립보드에 복사되었습니다.');
      }
    } catch (err: any) {
      console.error('[ContractView] send error', err);
      Alert.alert('오류', err?.message || '계약서 전송에 실패했습니다.');
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

  return (
    <Container>
      <WebView
        source={{ html }}
        style={{ flex: 1 }}
        scalesPageToFit={true}
        showsVerticalScrollIndicator={true}
        showsHorizontalScrollIndicator={false}
      />
      <Footer>
        <SendButton onPress={handleSend} disabled={sending || contractMeta?.status === 'sent'}>
          {sending ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <SendButtonText>
              {contractMeta?.status === 'sent' ? '전송 완료' : '전송'}
            </SendButtonText>
          )}
        </SendButton>
      </Footer>
    </Container>
  );
}

export default function ContractViewScreen() {
  return <ContractViewContent />;
}

