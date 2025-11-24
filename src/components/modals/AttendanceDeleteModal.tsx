import React from 'react';
import { Modal } from 'react-native';
import styled from 'styled-components/native';

interface AttendanceDeleteModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  studentName: string;
}

export default function AttendanceDeleteModal({
  visible,
  onClose,
  onConfirm,
  studentName,
}: AttendanceDeleteModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <ModalOverlay>
        <ModalContent>
          <ModalTitle>출결 기록 삭제</ModalTitle>
          <ModalMessage>{studentName}의 출결 기록을 삭제하시겠습니까?</ModalMessage>
          <ButtonRow>
            <Button onPress={onClose} variant="secondary">
              <ButtonText variant="secondary">취소</ButtonText>
            </Button>
            <Button onPress={onConfirm} variant="primary">
              <ButtonText variant="primary">삭제</ButtonText>
            </Button>
          </ButtonRow>
        </ModalContent>
      </ModalOverlay>
    </Modal>
  );
}

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
  width: 80%;
`;

const ModalTitle = styled.Text`
  font-size: 18px;
  font-weight: bold;
  color: #000;
  margin-bottom: 12px;
  text-align: center;
`;

const ModalMessage = styled.Text`
  font-size: 16px;
  color: #666;
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
  background-color: ${(props) => (props.variant === 'primary' ? '#ff3b30' : '#e0e0e0')};
`;

const ButtonText = styled.Text<{ variant?: 'primary' | 'secondary' }>`
  color: ${(props) => (props.variant === 'primary' ? '#fff' : '#000')};
  font-size: 16px;
  font-weight: 600;
`;

