import React, { useState } from 'react';
import { Alert, ActivityIndicator } from 'react-native';
import Modal from 'react-native-modal';
import styled from 'styled-components/native';
import { usersApi } from '../../api/users';
import { useAuthStore } from '../../store/useStore';

interface WithdrawModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function WithdrawModal({ visible, onClose }: WithdrawModalProps) {
  const [loading, setLoading] = useState(false);
  const logout = useAuthStore((state) => state.logout);

  const handleConfirm = async () => {
    Alert.alert(
      '회원 탈퇴',
      '정말 회원을 탈퇴하시겠습니까?\n탈퇴 시 모든 데이터가 삭제되며 복구할 수 없습니다.',
      [
        {
          text: '취소',
          style: 'cancel',
          onPress: onClose,
        },
        {
          text: '탈퇴',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await usersApi.deleteAccount();
              Alert.alert('탈퇴 완료', '회원 탈퇴가 완료되었습니다.', [
                {
                  text: '확인',
                  onPress: async () => {
                    await logout();
                    onClose();
                  },
                },
              ]);
            } catch (error: any) {
              console.error('[WithdrawModal] 탈퇴 실패:', error);
              const errorMessage = error?.response?.data?.message || error?.message || '탈퇴 처리 중 오류가 발생했습니다.';
              Alert.alert('오류', errorMessage);
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  return (
    <Modal
      isVisible={visible}
      onBackdropPress={onClose}
      onBackButtonPress={onClose}
      style={{ margin: 0, justifyContent: 'center', alignItems: 'center' }}
    >
      <ModalContainer>
        <ModalTitle>회원 탈퇴</ModalTitle>
        <ModalMessage>정말 회원을 탈퇴하시겠습니까?{'\n'}탈퇴 시 모든 데이터가 삭제됩니다.</ModalMessage>
        <ButtonRow>
          <Button onPress={onClose} variant="secondary" disabled={loading}>
            <ButtonText variant="secondary">취소</ButtonText>
          </Button>
          <Button onPress={handleConfirm} variant="primary" disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <ButtonText variant="primary">탈퇴</ButtonText>
            )}
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
  line-height: 24px;
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

