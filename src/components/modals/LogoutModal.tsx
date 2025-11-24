import React from 'react';
import { Alert } from 'react-native';
import Modal from 'react-native-modal';
import styled from 'styled-components/native';
import { useAuthStore } from '../../store/useStore';

interface LogoutModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function LogoutModal({ visible, onClose }: LogoutModalProps) {
  const logout = useAuthStore((state) => state.logout);

  const handleConfirm = () => {
    logout();
    Alert.alert('완료', '로그아웃되었습니다.');
    onClose();
  };

  return (
    <Modal
      isVisible={visible}
      onBackdropPress={onClose}
      onBackButtonPress={onClose}
      style={{ margin: 0, justifyContent: 'center', alignItems: 'center' }}
    >
      <ModalContainer>
        <ModalTitle>로그아웃</ModalTitle>
        <ModalMessage>로그아웃하시겠습니까?</ModalMessage>
        <ButtonRow>
          <Button onPress={onClose} variant="secondary">
            <ButtonText variant="secondary">취소</ButtonText>
          </Button>
          <Button onPress={handleConfirm} variant="primary">
            <ButtonText variant="primary">로그아웃</ButtonText>
          </Button>
        </ButtonRow>
      </ModalContainer>
    </Modal>
  );
}

const ModalContainer = styled.View`
  background-color: #ffffff;
  border-radius: 12px;
  padding: 20px;
  width: 80%;
`;

const ModalTitle = styled.Text`
  font-size: 18px;
  font-weight: 700;
  color: #111111;
  margin-bottom: 12px;
  text-align: center;
`;

const ModalMessage = styled.Text`
  font-size: 16px;
  color: #666666;
  margin-bottom: 20px;
  text-align: center;
`;

const ButtonRow = styled.View`
  flex-direction: row;
  gap: 12px;
`;

const Button = styled.TouchableOpacity<{ variant?: 'primary' | 'secondary' }>`
  flex: 1;
  padding: 12px;
  border-radius: 8px;
  align-items: center;
  background-color: ${(props) => (props.variant === 'primary' ? '#ff6b00' : '#e0e0e0')};
`;

const ButtonText = styled.Text<{ variant?: 'primary' | 'secondary' }>`
  color: ${(props) => (props.variant === 'primary' ? '#fff' : '#000')};
  font-size: 16px;
  font-weight: 600;
`;

