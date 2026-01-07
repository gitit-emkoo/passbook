import React, { useRef, useCallback, useState } from 'react';
import { Modal, Alert, TextInput } from 'react-native';
import styled from 'styled-components/native';
import Signature from 'react-native-signature-canvas';

const ModalOverlay = styled.View`
  flex: 1;
  background-color: rgba(0, 0, 0, 0.5);
  justify-content: center;
  align-items: center;
`;

const ModalContent = styled.View`
  background-color: #fff;
  border-radius: 12px;
  padding: 20px;
  width: 90%;
  max-height: 80%;
`;

const ModalTitle = styled.Text`
  font-size: 18px;
  font-weight: bold;
  color: #000;
  margin-bottom: 16px;
  text-align: center;
`;

const InputLabel = styled.Text`
  font-size: 14px;
  color: #666;
  margin-bottom: 8px;
`;

const AmountInput = styled.TextInput<{ disabled?: boolean }>`
  border-width: 1px;
  border-color: #ddd;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 16px;
  font-size: 14px;
  color: #000;
  background-color: ${(props) => (props.disabled ? '#f5f5f5' : '#fff')};
`;

const SignatureContainer = styled.View`
  width: 100%;
  height: 200px;
  border-width: 1px;
  border-color: #ddd;
  border-radius: 8px;
  margin-bottom: 16px;
  background-color: #fff;
`;

const ButtonRow = styled.View`
  flex-direction: row;
  gap: 12px;
`;

const Button = styled.TouchableOpacity<{ variant?: 'primary' | 'secondary' }>`
  flex: 1;
  padding: 12px;
  border-radius: 6px;
  align-items: center;
  background-color: ${(props) => (props.variant === 'primary' ? '#007AFF' : '#e0e0e0')};
`;

const ButtonText = styled.Text<{ variant?: 'primary' | 'secondary' }>`
  color: ${(props) => (props.variant === 'primary' ? '#fff' : '#000')};
  font-size: 16px;
  font-weight: bold;
`;

interface AttendanceSignatureModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (signature: string, amount?: number, memo?: string) => void;
  studentName: string;
  contractType: 'sessions' | 'amount'; // 횟수권 또는 금액권
  remainingAmount?: number; // 금액권: 잔여 금액 (잔액 체크용)
}

/**
 * 사용 후 서명 모달
 */
export default function AttendanceSignatureModal({
  visible,
  onClose,
  onConfirm,
  studentName,
  contractType,
  remainingAmount,
}: AttendanceSignatureModalProps) {
  const signatureRef = useRef<any>(null);
  const [amount, setAmount] = useState<string>('');
  const [memo, setMemo] = useState<string>('');
  const isSessions = contractType === 'sessions';

  const handleClear = () => {
    signatureRef.current?.clearSignature();
  };

  const handleSignatureOk = useCallback((base64: string) => {
    if (!base64) {
      Alert.alert('알림', '서명을 입력해주세요.');
      return;
    }

    // 금액권인 경우 금액 입력 확인
    if (!isSessions) {
      const amountNum = amount.trim() ? Number(amount.replace(/,/g, '')) : 0;
      if (!amount.trim() || amountNum <= 0) {
        Alert.alert('알림', '차감금액을 입력해주세요.');
        return;
      }
      // 잔액 체크: 잔액보다 많이 사용할 수 없음
      if (remainingAmount !== undefined && amountNum > remainingAmount) {
        Alert.alert('알림', `잔액(${remainingAmount.toLocaleString()}원)보다 많이 사용할 수 없습니다.`);
        return;
      }
      onConfirm(base64, amountNum, memo.trim() || undefined);
    } else {
      // 횟수권인 경우 amount는 전달하지 않음 (null)
      onConfirm(base64, undefined, memo.trim() || undefined);
    }
    onClose();
  }, [onConfirm, onClose, amount, memo, isSessions]);

  const handleConfirm = () => {
    // Signature 컴포넌트의 내장 확인 버튼을 트리거하기 위해 readSignature 호출
    signatureRef.current?.readSignature();
  };

  const handleClose = () => {
    setAmount('');
    setMemo('');
    signatureRef.current?.clearSignature();
    onClose();
  };

  // 금액 입력 포맷팅 (천단위 콤마)
  const handleAmountChange = (text: string) => {
    const numericValue = text.replace(/[^0-9]/g, '');
    if (numericValue) {
      const formatted = Number(numericValue).toLocaleString();
      setAmount(formatted);
    } else {
      setAmount('');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <ModalOverlay>
        <ModalContent>
          <ModalTitle>{studentName} 사용 서명</ModalTitle>
          
          {/* 차감 금액/횟수 입력 */}
          <InputLabel>{isSessions ? '사용 횟수' : '차감 금액'}</InputLabel>
          <AmountInput
            value={isSessions ? '1회' : amount}
            onChangeText={isSessions ? undefined : handleAmountChange}
            placeholder={isSessions ? undefined : '차감금액 입력'}
            keyboardType="numeric"
            editable={!isSessions}
            disabled={isSessions}
          />

          {/* 서비스 내용 입력 */}
          <InputLabel>서비스 내용 (선택사항)</InputLabel>
          <TextInput
            value={memo}
            onChangeText={setMemo}
            placeholder="서비스 내용을 입력하세요"
            multiline
            numberOfLines={3}
            style={{
              borderWidth: 1,
              borderColor: '#ddd',
              borderRadius: 6,
              padding: 12,
              marginBottom: 16,
              fontSize: 14,
              color: '#000',
              backgroundColor: '#fff',
              textAlignVertical: 'top',
            }}
          />

          <InputLabel>서명</InputLabel>
          <SignatureContainer>
            <Signature
              ref={signatureRef}
              onOK={handleSignatureOk}
              descriptionText="서명해주세요"
              clearText="지우기"
              confirmText="확인"
              webStyle={`
                .m-signature-pad {
                  box-shadow: none;
                  border: none;
                }
                .m-signature-pad--body {
                  border: none;
                }
                .m-signature-pad--body canvas {
                  border-radius: 8px;
                }
              `}
            />
          </SignatureContainer>
          <ButtonRow>
            <Button variant="secondary" onPress={handleClear}>
              <ButtonText variant="secondary">지우기</ButtonText>
            </Button>
            <Button variant="secondary" onPress={handleClose}>
              <ButtonText variant="secondary">취소</ButtonText>
            </Button>
            <Button variant="primary" onPress={handleConfirm}>
              <ButtonText variant="primary">확인</ButtonText>
            </Button>
          </ButtonRow>
        </ModalContent>
      </ModalOverlay>
    </Modal>
  );
}



