import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRoute, RouteProp } from '@react-navigation/native';
import { ActivityIndicator, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import { HomeStackParamList } from '../navigation/AppNavigator';
import { contractsApi } from '../api/contracts';
import styled from 'styled-components/native';
import ContractSignatureModal from '../components/modals/ContractSignatureModal';
import ContractSendModal from '../components/modals/ContractSendModal';
import { useDashboardStore } from '../store/useDashboardStore';
import { useInvoicesStore } from '../store/useInvoicesStore';

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
  gap: 12px;
`;

const ActionButton = styled.TouchableOpacity<{ $primary?: boolean; disabled?: boolean }>`
  padding: 14px 16px;
  border-radius: 10px;
  background-color: ${(p) => (p.$primary ? '#ff6b00' : '#f2f2f7')};
  opacity: ${(p) => (p.disabled ? 0.5 : 1)};
  align-items: center;
  justify-content: center;
`;

const ActionButtonText = styled.Text<{ $primary?: boolean }>`
  color: ${(p) => (p.$primary ? '#ffffff' : '#111111')};
  font-size: 16px;
  font-weight: 600;
`;

const StatusText = styled.Text`
  font-size: 13px;
  color: #8e8e93;
  text-align: center;
`;

const SignatureButtonsRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
`;

const SignatureButton = styled.TouchableOpacity<{ $filled?: boolean }>`
  flex: 1;
  padding: 12px 10px;
  border-radius: 10px;
  border-width: 1px;
  border-color: ${(p) => (p.$filled ? '#d1d1d6' : '#ff6b00')};
  background-color: ${(p) => (p.$filled ? '#f0f0f0' : '#ff6b00')};
  align-items: center;
  justify-content: center;
  opacity: ${(p) => (p.disabled ? 0.6 : 1)};
`;

const SignatureButtonText = styled.Text<{ $filled?: boolean }>`
  color: ${(p) => (p.$filled ? '#8e8e93' : '#ffffff')};
  font-size: 15px;
  font-weight: 600;
`;

function ContractPreviewContent() {
  const route = useRoute<RouteProp<HomeStackParamList, 'ContractPreview'>>();
  const { contractId } = route.params;
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contractMeta, setContractMeta] = useState<any | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [signatureModalVisible, setSignatureModalVisible] = useState(false);
  const [signerType, setSignerType] = useState<'teacher' | 'student' | null>(null);
  const [tempTeacherSignature, setTempTeacherSignature] = useState<string | null>(null);
  const [tempStudentSignature, setTempStudentSignature] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [sending, setSending] = useState(false);
  const fetchDashboard = useDashboardStore((s) => s.fetchDashboard);
  const fetchInvoicesCurrent = useInvoicesStore((s) => s.fetchCurrentMonth);

  useEffect(() => {
    const loadContract = async () => {
      try {
        setLoading(true);
        setError(null);
        const viewLink = contractsApi.getViewLink(contractId);
        const response = await fetch(viewLink);
        if (!response.ok) {
          throw new Error('계약서를 불러오지 못했습니다.');
        }
        const data = await response.json();
        setHtml(data.html);
      } catch (err: any) {
        console.error('[ContractPreview] load error', err);
        setError(err?.message || '계약서를 불러오는 중 오류가 발생했습니다.');
        Alert.alert('오류', err?.message || '계약서를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    };

    loadContract();
  }, [contractId]);

  useEffect(() => {
    const loadMeta = async () => {
      try {
        setLoadingMeta(true);
        const contract = await contractsApi.getById(contractId);
        setContractMeta(contract);
      } catch (err: any) {
        console.error('[ContractPreview] meta load error', err);
        Alert.alert('오류', err?.message || '계약 정보를 불러오지 못했습니다.');
      } finally {
        setLoadingMeta(false);
      }
    };

    loadMeta();
  }, [contractId]);

  const openSignatureModal = useCallback((type: 'teacher' | 'student') => {
    setSignerType(type);
    setSignatureModalVisible(true);
  }, []);

  const handleSignatureComplete = useCallback(
    (signature: string) => {
      if (!signerType) return;
      if (signerType === 'teacher') {
        setTempTeacherSignature(signature);
      } else {
        setTempStudentSignature(signature);
      }
      setSignatureModalVisible(false);
      setSignerType(null);
    },
    [signerType],
  );

  const hasTeacherSignature = useMemo(
    () => Boolean(tempTeacherSignature || contractMeta?.teacher_signature),
    [tempTeacherSignature, contractMeta?.teacher_signature],
  );

  const hasStudentSignature = useMemo(
    () => Boolean(tempStudentSignature || contractMeta?.student_signature),
    [tempStudentSignature, contractMeta?.student_signature],
  );

  const canConfirm = hasTeacherSignature && hasStudentSignature;
  const status = contractMeta?.status ?? 'draft';
  const isConfirmed = status === 'confirmed' || status === 'sent';
  const isSent = status === 'sent';

  const handleConfirmContract = useCallback(async () => {
    if (!contractMeta) {
      Alert.alert('계약', '계약 정보를 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    if (!canConfirm) {
      Alert.alert('계약', '선생님과 수강생 모두 서명한 후 확정할 수 있습니다.');
      return;
    }
    try {
      setConfirming(true);
      await contractsApi.updateStatus(contractId, 'confirmed', {
        teacherSignature: tempTeacherSignature ?? contractMeta.teacher_signature ?? undefined,
        studentSignature: tempStudentSignature ?? contractMeta.student_signature ?? undefined,
      });
      setContractMeta((prev: any) =>
        prev
          ? {
              ...prev,
              status: 'confirmed',
              teacher_signature: tempTeacherSignature ?? prev.teacher_signature,
              student_signature: tempStudentSignature ?? prev.student_signature,
            }
          : prev,
      );
      await Promise.all([
        fetchDashboard({ force: true }),
        fetchInvoicesCurrent({ historyMonths: 3, force: true }),
      ]);
      Alert.alert('완료', '계약이 확정되었습니다.');
      setShowSendModal(true);
      setTempTeacherSignature(null);
      setTempStudentSignature(null);
    } catch (err: any) {
      console.error('[ContractPreview] confirm error', err);
      Alert.alert('오류', err?.message || '계약 확정에 실패했습니다.');
    } finally {
      setConfirming(false);
    }
  }, [contractId, contractMeta, canConfirm, tempTeacherSignature, tempStudentSignature]);

  const handleSend = useCallback(
    async (channel: 'sms' | 'link') => {
      if (!contractMeta) {
        return;
      }
      if (channel === 'link') {
        return;
      }
      try {
        setSending(true);
        await contractsApi.updateStatus(contractId, 'sent');
        setContractMeta((prev: any) =>
          prev
            ? {
                ...prev,
                status: 'sent',
              }
            : prev,
        );
        await Promise.all([
          fetchDashboard({ force: true }),
          fetchInvoicesCurrent({ historyMonths: 3, force: true }),
        ]);
        Alert.alert('완료', '계약서가 전송되었습니다.');
      } catch (err: any) {
        console.error('[ContractPreview] send error', err);
        Alert.alert('오류', err?.message || '계약서 전송에 실패했습니다.');
      } finally {
        setSending(false);
      }
    },
    [contractId, contractMeta],
  );

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

  const recipientPhone =
    contractMeta?.recipient_targets?.[0] ??
    contractMeta?.student?.phone ??
    contractMeta?.student?.guardian_phone;

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
        <StatusText>
          {loadingMeta
            ? '계약 정보를 불러오는 중입니다...'
            : `현재 상태: ${status === 'sent' ? '전송 완료' : status === 'confirmed' ? '확정됨' : '초안'}`}
        </StatusText>
        <SignatureButtonsRow>
          <SignatureButton
            onPress={() => openSignatureModal('teacher')}
            disabled={loadingMeta || isSent}
            $filled={hasTeacherSignature}
          >
            <SignatureButtonText $filled={hasTeacherSignature}>
              {hasTeacherSignature ? '선생님 서명 완료' : '선생님 서명'}
            </SignatureButtonText>
          </SignatureButton>
          <SignatureButton
            onPress={() => openSignatureModal('student')}
            disabled={loadingMeta || isSent}
            $filled={hasStudentSignature}
          >
            <SignatureButtonText $filled={hasStudentSignature}>
              {hasStudentSignature ? '수강생 서명 완료' : '수강생 서명'}
            </SignatureButtonText>
          </SignatureButton>
        </SignatureButtonsRow>
        {!isConfirmed ? (
          <ActionButton
            $primary
            onPress={handleConfirmContract}
            disabled={!canConfirm || confirming}
          >
            <ActionButtonText $primary>
              {confirming ? '확정 중...' : '확정 후 전송'}
            </ActionButtonText>
          </ActionButton>
        ) : (
          <ActionButton
            $primary
            onPress={() => setShowSendModal(true)}
            disabled={isSent || sending}
          >
            <ActionButtonText $primary>
              {isSent ? '계약서 전송 완료' : '계약서 전송'}
            </ActionButtonText>
          </ActionButton>
        )}
      </Footer>
      <ContractSignatureModal
        visible={signatureModalVisible}
        signerLabel={signerType === 'student' ? '수강생' : '선생님'}
        onClose={() => {
          setSignatureModalVisible(false);
          setSignerType(null);
        }}
        onConfirm={handleSignatureComplete}
      />
      {contractMeta && (
        <ContractSendModal
          visible={showSendModal}
          onClose={() => setShowSendModal(false)}
          onSend={handleSend}
          contractLink={contractsApi.getViewLink(contractId)}
          recipientPhone={recipientPhone}
          billingType={contractMeta.billing_type}
        />
      )}
    </Container>
  );
}

export default function ContractPreviewScreen() {
  return <ContractPreviewContent />;
}