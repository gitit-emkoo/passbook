import React from 'react';
import { Modal, Alert } from 'react-native';
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
  font-weight: bold;
  color: #000;
  margin-bottom: 8px;
  text-align: center;
`;

const ModalMainText = styled.Text`
  font-size: 16px;
  color: #333;
  margin-bottom: 12px;
  text-align: center;
  line-height: 24px;
`;

const ModalSubText = styled.Text`
  font-size: 13px;
  color: #666;
  margin-bottom: 24px;
  text-align: center;
  line-height: 20px;
`;

const Button = styled.TouchableOpacity<{ variant?: 'primary' | 'secondary' }>`
  width: 100%;
  padding: 14px;
  border-radius: 8px;
  align-items: center;
  background-color: ${(props) => (props.variant === 'primary' ? '#1d42d8' : '#f0f0f0')};
`;

const ButtonText = styled.Text<{ variant?: 'primary' | 'secondary' }>`
  color: ${(props) => (props.variant === 'primary' ? '#fff' : '#666')};
  font-size: 16px;
  font-weight: ${(props) => (props.variant === 'primary' ? 'bold' : 'normal')};
`;

interface SubscriptionIntroModalProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * 구독 안내 모달 (첫 이용권 추가 시) - 내용 확인용
 */
export default function SubscriptionIntroModal({
  visible,
  onClose,
}: SubscriptionIntroModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <ModalOverlay>
        <ModalContent>
          <ModalTitle>🎉 출시 기념 특별 혜택</ModalTitle>
          
          <ModalMainText>
            결제 수단 등록 필요 없이 즉시 무료로 2개월 동안 패스북의 모든 기능을 자유롭게 이용하실 수 있습니다.
          </ModalMainText>
          
          <ModalSubText>
            ※혜택 기간 종료 이후에도 고객 수 3명까지 무료 플랜으로도 동일하게 관리할 수 있어요.
          </ModalSubText>

          <Button variant="primary" onPress={onClose}>
            <ButtonText variant="primary">닫기</ButtonText>
          </Button>
        </ModalContent>
      </ModalOverlay>
    </Modal>
  );
}

