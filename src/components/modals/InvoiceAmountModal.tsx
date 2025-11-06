import React, { useState } from 'react';
import { Alert } from 'react-native';
import Modal from 'react-native-modal';
import styled from 'styled-components/native';
import { invoicesApi } from '../api/invoices';

const ModalContainer = styled.View`
  background-color: #fff;
  padding: 20px;
  border-radius: 10px;
`;

const ModalTitle = styled.Text`
  font-size: 20px;
  font-weight: bold;
  margin-bottom: 15px;
  text-align: center;
`;

const InputLabel = styled.Text`
  font-size: 16px;
  margin-top: 10px;
  margin-bottom: 5px;
  color: #333;
`;

const StyledTextInput = styled.TextInput`
  border-width: 1px;
  border-color: #e0e0e0;
  border-radius: 8px;
  padding: 10px;
  font-size: 16px;
  margin-bottom: 10px;
`;

const AmountInfo = styled.View`
  background-color: #f9f9f9;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 10px;
`;

const AmountRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  margin-bottom: 4px;
`;

const AmountLabel = styled.Text`
  font-size: 14px;
  color: #666;
`;

const AmountValue = styled.Text`
  font-size: 14px;
  color: #000;
  font-weight: 500;
`;

const FinalAmount = styled.Text`
  font-size: 18px;
  font-weight: bold;
  color: #007AFF;
  margin-top: 8px;
  text-align: right;
`;

const ButtonRow = styled.View`
  flex-direction: row;
  justify-content: space-around;
  margin-top: 20px;
`;

const ModalButton = styled.TouchableOpacity<{ primary?: boolean }>`
  padding: 12px 20px;
  border-radius: 8px;
  background-color: ${(props) => (props.primary ? '#007AFF' : '#f0f0f0')};
  margin-horizontal: 5px;
`;

const ModalButtonText = styled.Text<{ primary?: boolean }>`
  color: ${(props) => (props.primary ? '#fff' : '#333')};
  font-size: 16px;
  font-weight: bold;
`;

interface InvoiceAmountModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  invoiceId: number;
  currentAmount: number;
  baseAmount: number;
  autoAdjustment: number;
  manualAdjustment: number;
}

/**
 * 금액 수정 모달
 */
export default function InvoiceAmountModal({
  visible,
  onClose,
  onConfirm,
  invoiceId,
  currentAmount,
  baseAmount,
  autoAdjustment,
  manualAdjustment,
}: InvoiceAmountModalProps) {
  const [manualAdjustmentInput, setManualAdjustmentInput] = useState(
    manualAdjustment.toString(),
  );
  const [manualReason, setManualReason] = useState('');

  const handleConfirm = async () => {
    const adjustment = Number(manualAdjustmentInput);
    if (isNaN(adjustment)) {
      Alert.alert('알림', '올바른 숫자를 입력해주세요.');
      return;
    }

    try {
      await invoicesApi.update(invoiceId, adjustment, manualReason || undefined);
      Alert.alert('완료', '금액이 수정되었습니다.');
      onConfirm();
      onClose();
    } catch (error) {
      console.error('Failed to update invoice:', error);
      Alert.alert('오류', '금액 수정에 실패했습니다.');
    }
  };

  const calculatedFinalAmount = baseAmount + autoAdjustment + Number(manualAdjustmentInput || 0);

  return (
    <Modal isVisible={visible} onBackdropPress={onClose}>
      <ModalContainer>
        <ModalTitle>금액 수정</ModalTitle>

        <AmountInfo>
          <AmountRow>
            <AmountLabel>기본 금액</AmountLabel>
            <AmountValue>{baseAmount.toLocaleString()}원</AmountValue>
          </AmountRow>
          <AmountRow>
            <AmountLabel>자동 조정</AmountLabel>
            <AmountValue>
              {autoAdjustment >= 0 ? '+' : ''}
              {autoAdjustment.toLocaleString()}원
            </AmountValue>
          </AmountRow>
          <AmountRow>
            <AmountLabel>수동 조정</AmountLabel>
            <AmountValue>
              {Number(manualAdjustmentInput || 0) >= 0 ? '+' : ''}
              {Number(manualAdjustmentInput || 0).toLocaleString()}원
            </AmountValue>
          </AmountRow>
          <FinalAmount>최종 금액: {calculatedFinalAmount.toLocaleString()}원</FinalAmount>
        </AmountInfo>

        <InputLabel>수동 조정 금액</InputLabel>
        <StyledTextInput
          value={manualAdjustmentInput}
          onChangeText={setManualAdjustmentInput}
          placeholder="예: -5000 (차감) 또는 +5000 (추가)"
          keyboardType="numeric"
        />

        <InputLabel>수정 사유 (선택)</InputLabel>
        <StyledTextInput
          value={manualReason}
          onChangeText={setManualReason}
          placeholder="수정 사유를 입력하세요"
          multiline
        />

        <ButtonRow>
          <ModalButton onPress={onClose}>
            <ModalButtonText>취소</ModalButtonText>
          </ModalButton>
          <ModalButton primary onPress={handleConfirm}>
            <ModalButtonText>수정</ModalButtonText>
          </ModalButton>
        </ButtonRow>
      </ModalContainer>
    </Modal>
  );
}



