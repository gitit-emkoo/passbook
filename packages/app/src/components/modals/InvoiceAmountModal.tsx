import React, { useState } from 'react';
import { Alert, Platform } from 'react-native';
import Modal from 'react-native-modal';
import styled from 'styled-components/native';
import { invoicesApi } from '../../api/invoices';

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

const ModalSubtitle = styled.Text`
  font-size: 13px;
  color: #6b7280; /* gray-500 */
  text-align: center;
  margin-top: -8px;
  margin-bottom: 12px;
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

const SignRow = styled.View`
  flex-direction: row;
  justify-content: flex-end;
  align-items: center;
  margin-bottom: 8px;
  gap: 8px;
`;

const SignToggle = styled.TouchableOpacity<{ $active?: boolean }>`
  padding: 6px 10px;
  border-radius: 8px;
  background-color: ${(p) => (p.$active ? '#ff6b00' : '#f0f0f0')};
`;

const SignToggleText = styled.Text<{ $active?: boolean }>`
  color: ${(p) => (p.$active ? '#ffffff' : '#333333')};
  font-size: 14px;
  font-weight: 700;
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
  background-color: ${(props) => (props.primary ? '#ff6b00' : '#f0f0f0')};
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
  autoAdjustmentDetail?: string | null;
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
  autoAdjustmentDetail,
}: InvoiceAmountModalProps) {
  const initialSign = manualAdjustment < 0 ? -1 : 1;
  const [sign, setSign] = useState<number>(initialSign);
  const [manualAdjustmentInput, setManualAdjustmentInput] = useState(
    Math.abs(manualAdjustment).toString(),
  );
  const [manualReason, setManualReason] = useState('');

  const handleConfirm = async () => {
    const raw = manualAdjustmentInput.replace(/[^0-9]/g, '');
    const numberOnly = raw.length ? Number(raw) : 0;
    const adjustment = sign * numberOnly;
    if (isNaN(adjustment)) {
      Alert.alert('알림', '올바른 숫자를 입력해주세요.');
      return;
    }

    if (!manualReason.trim()) {
      Alert.alert('알림', '수정 사유를 입력해주세요.');
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

  const signedManual = sign * Number((manualAdjustmentInput || '0').replace(/[^0-9]/g, ''));
  const calculatedFinalAmount = baseAmount + autoAdjustment + signedManual;

  return (
    <Modal isVisible={visible} onBackdropPress={onClose}>
      <ModalContainer>
        <ModalTitle>청구금액 확인</ModalTitle>
        <ModalSubtitle>최종 청구금액을 확인하고 수정할 수 있어요</ModalSubtitle>

        <AmountInfo>
          <AmountRow>
            <AmountLabel>계약금액</AmountLabel>
            <AmountValue>{baseAmount.toLocaleString()}원</AmountValue>
          </AmountRow>
          <AmountRow>
            <AmountLabel>
              차감금액
              {autoAdjustmentDetail ? ` ${autoAdjustmentDetail}` : ''}
            </AmountLabel>
            <AmountValue>
              {autoAdjustment >= 0 ? '+' : ''}
              {autoAdjustment.toLocaleString()}원
            </AmountValue>
          </AmountRow>
          <AmountRow>
            <AmountLabel>수동 조정</AmountLabel>
            <AmountValue>
              {signedManual >= 0 ? '+' : ''}
              {Math.abs(signedManual).toLocaleString()}원
            </AmountValue>
          </AmountRow>
          <FinalAmount>최종 금액: {calculatedFinalAmount.toLocaleString()}원</FinalAmount>
        </AmountInfo>

        <InputLabel>수동 조정 금액</InputLabel>
        <SignRow>
          <SignToggle $active={sign === 1} onPress={() => setSign(1)}>
            <SignToggleText $active={sign === 1}>+ 추가</SignToggleText>
          </SignToggle>
          <SignToggle $active={sign === -1} onPress={() => setSign(-1)}>
            <SignToggleText $active={sign === -1}>− 차감</SignToggleText>
          </SignToggle>
        </SignRow>
        <StyledTextInput
          value={manualAdjustmentInput}
          onChangeText={(t) => setManualAdjustmentInput(t.replace(/[^0-9]/g, ''))}
          placeholder="예: 5000 (숫자만)"
          keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'number-pad'}
        />

        <InputLabel>수정 사유 (필수)</InputLabel>
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



