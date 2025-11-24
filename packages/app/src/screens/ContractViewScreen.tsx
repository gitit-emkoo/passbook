import React, { useState, useEffect } from 'react';
import { useRoute, RouteProp } from '@react-navigation/native';
import { ActivityIndicator, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import { StudentsStackParamList } from '../navigation/AppNavigator';
import { contractsApi } from '../api/contracts';
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

const ModifyButton = styled.TouchableOpacity`
  padding: 14px 16px;
  border-radius: 10px;
  background-color: #0a84ff;
  align-items: center;
  justify-content: center;
`;

const ModifyButtonText = styled.Text`
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

  useEffect(() => {
    const loadContract = async () => {
      try {
        setLoading(true);
        setError(null);
        
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
        <ModifyButton onPress={() => Alert.alert('준비 중', '계약 수정 기능은 준비 중입니다.')}>
          <ModifyButtonText>수정하기</ModifyButtonText>
        </ModifyButton>
      </Footer>
    </Container>
  );
}

export default function ContractViewScreen() {
  return <ContractViewContent />;
}

