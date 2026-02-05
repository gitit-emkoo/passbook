import React from 'react';
import { Modal } from 'react-native';
import styled from 'styled-components/native';

const ModalOverlay = styled.View`
  flex: 1;
  background-color: rgba(0, 0, 0, 0.5);
  justify-content: center;
  align-items: center;
`;

const ModalContent = styled.View`
  background-color: #fff;
  border-radius: 16px;
  padding: 24px;
  width: 85%;
  max-width: 400px;
`;

const ModalTitle = styled.Text`
  font-size: 20px;
  font-weight: 700;
  color: #111111;
  margin-bottom: 12px;
  text-align: center;
  line-height: 28px;
`;

const ModalMessage = styled.Text`
  font-size: 15px;
  color: #333333;
  text-align: center;
  line-height: 22px;
  margin-bottom: 24px;
`;

const Button = styled.TouchableOpacity`
  width: 100%;
  padding: 14px;
  border-radius: 8px;
  align-items: center;
  background-color: #1d42d8;
`;

const ButtonText = styled.Text`
  color: #ffffff;
  font-size: 16px;
  font-weight: 600;
`;

interface FirstContractBonusSuccessModalProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * 첫 이용권 생성 완료 시 30일 추가 지급 안내 모달
 */
export default function FirstContractBonusSuccessModal({
  visible,
  onClose,
}: FirstContractBonusSuccessModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <ModalOverlay>
        <ModalContent>
          <ModalTitle>🎉 첫 이용권 생성 완료</ModalTitle>
          <ModalMessage>
            첫 이용권을 생성하셨습니다.{'\n'}
            30일 추가로 지급됩니다.
          </ModalMessage>

          <Button onPress={onClose}>
            <ButtonText>확인</ButtonText>
          </Button>
        </ModalContent>
      </ModalOverlay>
    </Modal>
  );
}

