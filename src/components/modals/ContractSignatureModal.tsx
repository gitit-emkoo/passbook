import React, { useRef, useCallback } from 'react';
import { Alert } from 'react-native';
import Modal from 'react-native-modal';
import Signature from 'react-native-signature-canvas';
import styled from 'styled-components/native';

interface ContractSignatureModalProps {
  visible: boolean;
  signerLabel?: string;
  onClose: () => void;
  onConfirm: (signature: string) => void;
}

const ModalContainer = styled.View`
  background-color: #ffffff;
  padding: 20px;
  border-radius: 16px;
  gap: 16px;
`;

const ModalTitle = styled.Text`
  font-size: 20px;
  font-weight: 700;
  text-align: center;
  color: #111111;
`;

const SignatureContainer = styled.View`
  height: 220px;
  border-width: 1px;
  border-color: #d1d1d6;
  border-radius: 12px;
  overflow: hidden;
`;

const ButtonRow = styled.View`
  flex-direction: row;
  gap: 12px;
`;

const ModalButton = styled.TouchableOpacity<{ $primary?: boolean }>`
  flex: 1;
  padding: 12px 16px;
  border-radius: 10px;
  align-items: center;
  justify-content: center;
  background-color: ${(p) => (p.$primary ? '#ff6b00' : '#f2f2f7')};
`;

const ModalButtonText = styled.Text<{ $primary?: boolean }>`
  font-size: 16px;
  font-weight: 600;
  color: ${(p) => (p.$primary ? '#ffffff' : '#111111')};
`;

export default function ContractSignatureModal({
  visible,
  signerLabel = '서명자',
  onClose,
  onConfirm,
}: ContractSignatureModalProps) {
  const signatureRef = useRef<any>(null);

  const handleSignatureOk = useCallback(
    (base64: string) => {
      if (!base64) {
        Alert.alert('서명', '서명을 입력해주세요.');
        return;
      }
      onConfirm(base64);
    },
    [onConfirm],
  );

  const handleConfirmPress = useCallback(() => {
    signatureRef.current?.readSignature();
  }, []);

  const handleClear = useCallback(() => {
    signatureRef.current?.clearSignature();
  }, []);

  return (
    <Modal isVisible={visible} onBackdropPress={onClose}>
      <ModalContainer>
        <ModalTitle>{signerLabel} 서명</ModalTitle>
        <SignatureContainer>
          <Signature
            ref={signatureRef}
            onOK={handleSignatureOk}
            onEmpty={() => Alert.alert('서명', '서명을 입력해주세요.')}
            descriptionText={`${signerLabel} 서명해주세요`}
            clearText="초기화"
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
                border-radius: 12px;
                border: none;
                background-color: #ffffff;
              }
              .m-signature-pad--footer {
                display: none;
              }
            `}
          />
        </SignatureContainer>
        <ButtonRow>
          <ModalButton onPress={handleClear}>
            <ModalButtonText>초기화</ModalButtonText>
          </ModalButton>
          <ModalButton $primary onPress={handleConfirmPress}>
            <ModalButtonText $primary>서명 저장</ModalButtonText>
          </ModalButton>
        </ButtonRow>
      </ModalContainer>
    </Modal>
  );
}


