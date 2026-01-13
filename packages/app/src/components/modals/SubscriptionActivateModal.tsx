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
  font-weight: bold;
  color: #000;
  margin-bottom: 8px;
  text-align: center;
`;

const ModalSubtitle = styled.Text`
  font-size: 14px;
  color: #666;
  margin-bottom: 20px;
  text-align: center;
`;

const BenefitList = styled.View`
  margin-bottom: 24px;
`;

const BenefitItem = styled.View`
  flex-direction: row;
  align-items: flex-start;
  margin-bottom: 12px;
`;

const BenefitIcon = styled.Text`
  font-size: 18px;
  margin-right: 8px;
  margin-top: 2px;
  color: #1d42d8;
`;

const BenefitText = styled.Text`
  font-size: 15px;
  color: #333;
  flex: 1;
  line-height: 22px;
`;

const Button = styled.TouchableOpacity`
  width: 100%;
  padding: 14px;
  border-radius: 8px;
  align-items: center;
  background-color: #1d42d8;
`;

const ButtonText = styled.Text`
  color: #fff;
  font-size: 16px;
  font-weight: bold;
`;

interface SubscriptionActivateModalProps {
  visible: boolean;
  onClose: () => void;
  onActivate: () => void;
}

/**
 * 무료 구독 시작 모달 (마이페이지에서)
 */
export default function SubscriptionActivateModal({
  visible,
  onClose,
  onActivate,
}: SubscriptionActivateModalProps) {
  const handleActivate = () => {
    onActivate();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <ModalOverlay>
        <ModalContent>
          <ModalTitle>🎉 출시 기념 특별 혜택</ModalTitle>
          <ModalSubtitle>무료로 이용을 시작하세요</ModalSubtitle>

          <BenefitList>
            <BenefitItem>
              <BenefitIcon>✓</BenefitIcon>
              <BenefitText>지금부터 2개월 무료 체험</BenefitText>
            </BenefitItem>
            <BenefitItem>
              <BenefitIcon>✓</BenefitIcon>
              <BenefitText>체험 종료 후에도 이용권 5개까지 무료로 계속 이용 가능</BenefitText>
            </BenefitItem>
            <BenefitItem>
              <BenefitIcon>✓</BenefitIcon>
              <BenefitText>6개 이상부터 월 3,900원</BenefitText>
            </BenefitItem>
          </BenefitList>

          <Button onPress={handleActivate}>
            <ButtonText>무료 구독 시작하기</ButtonText>
          </Button>
        </ModalContent>
      </ModalOverlay>
    </Modal>
  );
}

