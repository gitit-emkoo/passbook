import React, { useRef, useCallback } from 'react';
import { Modal, Alert } from 'react-native';
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
  onConfirm: (signature: string) => void;
  studentName: string;
}

/**
 * 출석 후 서명 모달
 */
export default function AttendanceSignatureModal({
  visible,
  onClose,
  onConfirm,
  studentName,
}: AttendanceSignatureModalProps) {
  const signatureRef = useRef<any>(null);

  const handleClear = () => {
    signatureRef.current?.clearSignature();
  };

  const handleSignatureOk = useCallback((base64: string) => {
    if (base64) {
      onConfirm(base64);
      onClose();
    } else {
      Alert.alert('알림', '서명을 입력해주세요.');
    }
  }, [onConfirm, onClose]);

  const handleConfirm = () => {
    // Signature 컴포넌트의 내장 확인 버튼을 트리거하기 위해 readSignature 호출
    signatureRef.current?.readSignature();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <ModalOverlay>
        <ModalContent>
          <ModalTitle>{studentName} 출석 서명</ModalTitle>
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
            <Button variant="secondary" onPress={onClose}>
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



