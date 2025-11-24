import React, { useState, useEffect } from 'react';
import { Alert } from 'react-native';
import Modal from 'react-native-modal';
import styled from 'styled-components/native';
import { usersApi } from '../../api/users';

interface AccountInfoModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: () => void;
  initialBankName?: string;
  initialAccountNumber?: string;
  initialAccountHolder?: string;
}

export default function AccountInfoModal({
  visible,
  onClose,
  onSave,
  initialBankName = '',
  initialAccountNumber = '',
  initialAccountHolder = '',
}: AccountInfoModalProps) {
  const [loading, setLoading] = useState(false);
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');

  useEffect(() => {
    if (visible) {
      setBankName(initialBankName);
      setAccountNumber(initialAccountNumber);
      setAccountHolder(initialAccountHolder);
    }
  }, [visible, initialBankName, initialAccountNumber, initialAccountHolder]);

  const handleSave = async () => {
    if (!bankName.trim() || !accountNumber.trim() || !accountHolder.trim()) {
      Alert.alert('입력 필요', '은행명, 계좌번호, 예금주를 모두 입력해주세요.');
      return;
    }

    try {
      setLoading(true);
      const user = await usersApi.getMe();
      const currentSettings = (user.settings || {}) as Record<string, unknown>;
      
      await usersApi.updateSettings({
        ...currentSettings,
        account_info: {
          bank_name: bankName.trim(),
          account_number: accountNumber.trim(),
          account_holder: accountHolder.trim(),
        },
      });
      
      Alert.alert('완료', '계좌정보가 저장되었습니다.');
      onSave();
      onClose();
    } catch (error: any) {
      console.error('[AccountInfoModal] save error', error);
      Alert.alert('오류', '계좌정보 저장에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isVisible={visible}
      onBackdropPress={onClose}
      onBackButtonPress={onClose}
      style={{ margin: 0, justifyContent: 'flex-end' }}
    >
      <ModalContainer>
        <ModalHeader>
          <ModalTitle>계좌 정보</ModalTitle>
          <CloseButton onPress={onClose}>
            <CloseButtonText>닫기</CloseButtonText>
          </CloseButton>
        </ModalHeader>

        <ModalContent>
          <SettingSection>
            <SettingLabel>은행명</SettingLabel>
            <AccountTextInput
              value={bankName}
              onChangeText={setBankName}
              placeholder="예: 국민은행"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </SettingSection>

          <SettingSection>
            <SettingLabel>계좌번호</SettingLabel>
            <AccountTextInput
              value={accountNumber}
              onChangeText={setAccountNumber}
              placeholder="예: 123-456-789012"
              keyboardType="numeric"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </SettingSection>

          <SettingSection>
            <SettingLabel>예금주</SettingLabel>
            <AccountTextInput
              value={accountHolder}
              onChangeText={setAccountHolder}
              placeholder="예: 홍길동"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </SettingSection>
        </ModalContent>

        <ButtonContainer>
          <CancelButton onPress={onClose} disabled={loading}>
            <CancelButtonText>취소</CancelButtonText>
          </CancelButton>
          <ConfirmButton onPress={handleSave} disabled={loading}>
            <ConfirmButtonText>저장</ConfirmButtonText>
          </ConfirmButton>
        </ButtonContainer>
      </ModalContainer>
    </Modal>
  );
}

const ModalContainer = styled.View`
  background-color: #ffffff;
  border-top-left-radius: 20px;
  border-top-right-radius: 20px;
  max-height: 90%;
  padding-bottom: 40px;
`;

const ModalHeader = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom-width: 1px;
  border-bottom-color: #e0e0e0;
`;

const ModalTitle = styled.Text`
  font-size: 18px;
  font-weight: 700;
  color: #111111;
`;

const CloseButton = styled.TouchableOpacity`
  padding: 8px;
`;

const CloseButtonText = styled.Text`
  font-size: 16px;
  color: #ff6b00;
  font-weight: 600;
`;

const ModalContent = styled.ScrollView`
  padding: 20px;
`;

const SettingSection = styled.View`
  margin-bottom: 24px;
`;

const SettingLabel = styled.Text`
  font-size: 14px;
  font-weight: 600;
  color: #111111;
  margin-bottom: 12px;
`;

const AccountTextInput = styled.TextInput`
  border-width: 1px;
  border-color: #e0e0e0;
  border-radius: 8px;
  padding: 12px;
  font-size: 15px;
  background-color: #ffffff;
  color: #111111;
`;

const ButtonContainer = styled.View`
  flex-direction: row;
  padding: 20px;
  gap: 12px;
`;

const CancelButton = styled.TouchableOpacity<{ disabled?: boolean }>`
  flex: 1;
  background-color: #f0f0f0;
  padding: 16px;
  border-radius: 12px;
  align-items: center;
  opacity: ${(props) => (props.disabled ? 0.5 : 1)};
`;

const CancelButtonText = styled.Text`
  font-size: 16px;
  font-weight: 600;
  color: #666666;
`;

const ConfirmButton = styled.TouchableOpacity<{ disabled?: boolean }>`
  flex: 1;
  background-color: #ff6b00;
  padding: 16px;
  border-radius: 12px;
  align-items: center;
  opacity: ${(props) => (props.disabled ? 0.5 : 1)};
`;

const ConfirmButtonText = styled.Text`
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
`;


