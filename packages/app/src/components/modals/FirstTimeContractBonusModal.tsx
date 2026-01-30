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

const ButtonRow = styled.View`
  flex-direction: row;
  gap: 12px;
`;

interface ButtonProps {
  variant: 'primary' | 'secondary';
}

const Button = styled.TouchableOpacity<ButtonProps>`
  flex: 1;
  padding: 14px;
  border-radius: 8px;
  align-items: center;
  background-color: ${(props: ButtonProps) => (props.variant === 'primary' ? '#1d42d8' : '#f0f0f0')};
`;

const ButtonText = styled.Text<ButtonProps>`
  color: ${(props: ButtonProps) => (props.variant === 'primary' ? '#ffffff' : '#666666')};
  font-size: 16px;
  font-weight: 600;
`;

interface FirstTimeContractBonusModalProps {
  visible: boolean;
  onClose: () => void;
  onExtend: () => void;
}

/**
 * 최초 접속 시 이용권 생성 무료구독 연장 이벤트 팝업
 */
export default function FirstTimeContractBonusModal({
  visible,
  onClose,
  onExtend,
}: FirstTimeContractBonusModalProps) {
  const handleExtend = () => {
    onExtend();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <ModalOverlay>
        <ModalContent>
          <ModalTitle>기존 고객으로 첫 이용권을 만들어 보세요</ModalTitle>
          <ModalMessage>
            지금 바로 생성 하면 무료 사용 기간이 30일(총90일){'\n'}
            더 늘어나는 추가 혜택이 적용됩니다.
          </ModalMessage>

          <ButtonRow>
            <Button variant="secondary" onPress={onClose}>
              <ButtonText variant="secondary">다음에</ButtonText>
            </Button>
            <Button variant="primary" onPress={handleExtend}>
              <ButtonText variant="primary">무료기간연장</ButtonText>
            </Button>
          </ButtonRow>
        </ModalContent>
      </ModalOverlay>
    </Modal>
  );
}


