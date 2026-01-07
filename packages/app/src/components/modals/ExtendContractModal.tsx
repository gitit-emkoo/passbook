import React, { useState, useEffect } from 'react';
import { Alert, ActivityIndicator } from 'react-native';
import Modal from 'react-native-modal';
import styled from 'styled-components/native';
import { contractsApi } from '../../api/contracts';

interface ExtendContractModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  contractId: number;
  contractType: 'sessions' | 'amount';
  totalSessions?: number;
  remainingSessions?: number;
  totalAmount?: number;
  remainingAmount?: number;
}

export default function ExtendContractModal({
  visible,
  onClose,
  onSuccess,
  contractId,
  contractType,
  totalSessions = 0,
  remainingSessions = 0,
  totalAmount = 0,
  remainingAmount = 0,
}: ExtendContractModalProps) {
  const [loading, setLoading] = useState(false);
  const [addedSessions, setAddedSessions] = useState('');
  const [extensionAmount, setExtensionAmount] = useState(''); // 연장 정산서 금액 (횟수권용)
  const [addedAmount, setAddedAmount] = useState(''); // 금액권: 추가할 금액 (연장 정산서 금액과 동일)

  useEffect(() => {
    if (visible) {
      setAddedSessions('');
      setExtensionAmount('');
      setAddedAmount('');
    }
  }, [visible]);

  const handleConfirm = async () => {
    if (contractType === 'sessions') {
      const sessions = parseInt(addedSessions, 10);
      if (isNaN(sessions) || sessions <= 0) {
        Alert.alert('오류', '추가할 회차를 입력해주세요.');
        return;
      }
      const amount = extensionAmount ? parseInt(extensionAmount.replace(/,/g, ''), 10) : null;
      if (!amount || amount <= 0) {
        Alert.alert('오류', '연장 정산서 금액을 입력해주세요.');
        return;
      }
    } else if (contractType === 'amount') {
      // 금액권: 추가할 금액 (연장 정산서 금액과 동일)
      const amount = addedAmount ? parseInt(addedAmount.replace(/,/g, ''), 10) : null;
      if (!amount || amount <= 0) {
        Alert.alert('오류', '추가할 금액을 입력해주세요.');
        return;
      }
    }

    try {
      setLoading(true);

      const data: { added_sessions?: number; extension_amount?: number; added_amount?: number } = {};
      if (contractType === 'sessions') {
        data.added_sessions = parseInt(addedSessions, 10);
        const amount = extensionAmount ? parseInt(extensionAmount.replace(/,/g, ''), 10) : null;
        if (amount) {
          data.extension_amount = amount;
        }
      } else if (contractType === 'amount') {
        // 금액권: 추가할 금액 = 연장 정산서 금액
        const amount = parseInt(addedAmount.replace(/,/g, ''), 10);
        data.added_amount = amount;
        data.extension_amount = amount; // 추가하는 금액이 곧 연장 정산서 금액
      }

      await contractsApi.extend(contractId, data);
      
      Alert.alert('완료', contractType === 'sessions' 
        ? `${data.added_sessions}회가 추가되었습니다.`
        : `${data.added_amount?.toLocaleString()}원이 추가되었습니다.`);
      
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('[ExtendContractModal] extend error', error);
      Alert.alert('오류', error?.message || '계약 연장에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isVisible={visible}
      onBackdropPress={onClose}
      onBackButtonPress={onClose}
      style={{ margin: 0, justifyContent: 'flex-end' }}
    >
      <ModalContainer>
        <ModalHeader>
          <ModalTitle>계약 연장</ModalTitle>
          <CloseButton onPress={onClose}>
            <CloseButtonText>닫기</CloseButtonText>
          </CloseButton>
        </ModalHeader>

        <ModalContent>
          {/* 기존 계약 정보 */}
          <Section>
            <SectionTitle>기존 계약 정보</SectionTitle>
            {contractType === 'sessions' ? (
              <>
                <InfoRow>
                  <InfoLabel>총 회차</InfoLabel>
                  <InfoValue>{totalSessions}회</InfoValue>
                </InfoRow>
                <InfoRow>
                  <InfoLabel>남은 회차</InfoLabel>
                  <InfoValue>{remainingSessions}회</InfoValue>
                </InfoRow>
              </>
            ) : (
              <>
                <InfoRow>
                  <InfoLabel>총 금액</InfoLabel>
                  <InfoValue>{totalAmount.toLocaleString()}원</InfoValue>
                </InfoRow>
                <InfoRow>
                  <InfoLabel>남은 금액</InfoLabel>
                  <InfoValue>{remainingAmount.toLocaleString()}원</InfoValue>
                </InfoRow>
              </>
            )}
          </Section>

          {/* 연장 정보 입력 */}
          <Section>
            <SectionTitle>연장 정보</SectionTitle>
            {contractType === 'sessions' ? (
              <>
                <InputLabel>추가할 회차 *</InputLabel>
                <StyledTextInput
                  value={addedSessions}
                  onChangeText={setAddedSessions}
                  placeholder="예: 5"
                  keyboardType="number-pad"
                />
                {addedSessions && !isNaN(parseInt(addedSessions, 10)) && (
                  <PreviewText>
                    연장 후: {totalSessions + parseInt(addedSessions, 10)}회
                  </PreviewText>
                )}
                <InputLabel style={{ marginTop: 16 }}>연장 정산서 금액 (원) *</InputLabel>
                <StyledTextInput
                  value={extensionAmount}
                  onChangeText={(text) => {
                    // 숫자와 쉼표만 허용
                    const numericValue = text.replace(/[^0-9,]/g, '');
                    setExtensionAmount(numericValue);
                  }}
                  placeholder="예: 150000"
                  keyboardType="number-pad"
                />
                {extensionAmount && (
                  <PreviewText>
                    {parseInt(extensionAmount.replace(/,/g, ''), 10).toLocaleString()}원
                  </PreviewText>
                )}
              </>
            ) : (
              <>
                <InputLabel>추가할 금액 (원) *</InputLabel>
                <StyledTextInput
                  value={addedAmount}
                  onChangeText={(text) => {
                    // 숫자와 쉼표만 허용
                    const numericValue = text.replace(/[^0-9,]/g, '');
                    setAddedAmount(numericValue);
                  }}
                  placeholder="예: 200000"
                  keyboardType="number-pad"
                />
                {addedAmount && !isNaN(parseInt(addedAmount.replace(/,/g, ''), 10)) && (
                  <>
                    <PreviewText>
                      연장 후: {(remainingAmount + parseInt(addedAmount.replace(/,/g, ''), 10)).toLocaleString()}원
                    </PreviewText>
                    <PreviewText style={{ marginTop: 4 }}>
                      연장 정산서 금액: {parseInt(addedAmount.replace(/,/g, ''), 10).toLocaleString()}원
                    </PreviewText>
                  </>
                )}
              </>
            )}
          </Section>
        </ModalContent>

        <ButtonContainer>
          <CancelButton onPress={onClose} disabled={loading}>
            <CancelButtonText>취소</CancelButtonText>
          </CancelButton>
          <ConfirmButton onPress={handleConfirm} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <ConfirmButtonText>확인</ConfirmButtonText>
            )}
          </ConfirmButton>
        </ButtonContainer>
      </ModalContainer>
    </Modal>
  );
}

const ModalContainer = styled.View`
  background-color: #ffffff;
  border-top-left-radius: 20px;
  border-top-right-radius: 20px;
  max-height: 90%;
  padding-bottom: 40px;
`;

const ModalHeader = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom-width: 1px;
  border-bottom-color: #e0e0e0;
`;

const ModalTitle = styled.Text`
  font-size: 18px;
  font-weight: 700;
  color: #111111;
`;

const CloseButton = styled.TouchableOpacity`
  padding: 8px;
`;

const CloseButtonText = styled.Text`
  font-size: 16px;
  color: #ff6b00;
  font-weight: 600;
`;

const ModalContent = styled.ScrollView`
  padding: 20px;
`;

const Section = styled.View`
  margin-bottom: 24px;
`;

const SectionTitle = styled.Text`
  font-size: 16px;
  font-weight: 700;
  color: #111111;
  margin-bottom: 12px;
`;

const InfoRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom-width: 1px;
  border-bottom-color: #f0f0f0;
`;

const InfoLabel = styled.Text`
  font-size: 14px;
  color: #666666;
`;

const InfoValue = styled.Text`
  font-size: 14px;
  color: #111111;
  font-weight: 600;
`;

const InputLabel = styled.Text`
  font-size: 14px;
  font-weight: 600;
  color: #111111;
  margin-top: 12px;
  margin-bottom: 8px;
`;

const StyledTextInput = styled.TextInput`
  border-width: 1px;
  border-color: #e0e0e0;
  border-radius: 8px;
  padding: 12px;
  font-size: 16px;
  background-color: #ffffff;
`;

const PreviewText = styled.Text`
  font-size: 13px;
  color: #666666;
  margin-top: 8px;
`;

const ButtonContainer = styled.View`
  flex-direction: row;
  padding: 20px;
  gap: 12px;
`;

const CancelButton = styled.TouchableOpacity<{ disabled?: boolean }>`
  flex: 1;
  background-color: #f0f0f0;
  padding: 16px;
  border-radius: 12px;
  align-items: center;
  opacity: ${(props) => (props.disabled ? 0.5 : 1)};
`;

const CancelButtonText = styled.Text`
  font-size: 16px;
  font-weight: 600;
  color: #666666;
`;

const ConfirmButton = styled.TouchableOpacity<{ disabled?: boolean }>`
  flex: 1;
  background-color: #ff6b00;
  padding: 16px;
  border-radius: 12px;
  align-items: center;
  opacity: ${(props) => (props.disabled ? 0.5 : 1)};
`;

const ConfirmButtonText = styled.Text`
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
`;

