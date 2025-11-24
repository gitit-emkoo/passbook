import React, { useState, useEffect } from 'react';
import { Alert } from 'react-native';
import Modal from 'react-native-modal';
import styled from 'styled-components/native';
import { usersApi } from '../../api/users';

interface ContractSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: () => void;
}

export default function ContractSettingsModal({
  visible,
  onClose,
  onSave,
}: ContractSettingsModalProps) {
  const [loading, setLoading] = useState(false);
  const [billingType, setBillingType] = useState<'prepaid' | 'postpaid'>('postpaid');
  const [absencePolicy, setAbsencePolicy] = useState<'carry_over' | 'deduct_next' | 'vanish'>('deduct_next');
  const [sendTarget, setSendTarget] = useState<'student_only' | 'guardian_only' | 'both'>('guardian_only');

  useEffect(() => {
    if (visible) {
      loadSettings();
    }
  }, [visible]);

  const loadSettings = async () => {
    try {
      const user = await usersApi.getMe();
      const settings = (user.settings || {}) as Record<string, unknown>;
      if (settings.default_billing_type) setBillingType(settings.default_billing_type as 'prepaid' | 'postpaid');
      if (settings.default_absence_policy) setAbsencePolicy(settings.default_absence_policy as 'carry_over' | 'deduct_next' | 'vanish');
      if (settings.default_send_target) setSendTarget(settings.default_send_target as 'student_only' | 'guardian_only' | 'both');
    } catch (error) {
      console.error('[ContractSettingsModal] load error', error);
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      await usersApi.updateSettings({
        default_billing_type: billingType,
        default_absence_policy: absencePolicy,
        default_send_target: sendTarget,
      });
      Alert.alert('완료', '계약서 기본값이 저장되었습니다.');
      onSave();
      onClose();
    } catch (error: any) {
      console.error('[ContractSettingsModal] save error', error);
      Alert.alert('오류', '저장에 실패했습니다.');
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
          <ModalTitle>계약서 기본값 설정</ModalTitle>
          <CloseButton onPress={onClose}>
            <CloseButtonText>닫기</CloseButtonText>
          </CloseButton>
        </ModalHeader>

        <ModalContent>
          <SettingSection>
            <SettingLabel>결제 방식</SettingLabel>
            <OptionRow>
              <OptionButton $active={billingType === 'prepaid'} onPress={() => setBillingType('prepaid')}>
                <OptionText $active={billingType === 'prepaid'}>선불</OptionText>
              </OptionButton>
              <OptionButton $active={billingType === 'postpaid'} onPress={() => setBillingType('postpaid')}>
                <OptionText $active={billingType === 'postpaid'}>후불</OptionText>
              </OptionButton>
            </OptionRow>
          </SettingSection>

          <SettingSection>
            <SettingLabel>결석 처리</SettingLabel>
            <OptionRow>
              <OptionButton $active={absencePolicy === 'carry_over'} onPress={() => setAbsencePolicy('carry_over')}>
                <OptionText $active={absencePolicy === 'carry_over'}>이월</OptionText>
              </OptionButton>
              <OptionButton $active={absencePolicy === 'deduct_next'} onPress={() => setAbsencePolicy('deduct_next')}>
                <OptionText $active={absencePolicy === 'deduct_next'}>차감</OptionText>
              </OptionButton>
              <OptionButton $active={absencePolicy === 'vanish'} onPress={() => setAbsencePolicy('vanish')}>
                <OptionText $active={absencePolicy === 'vanish'}>소멸</OptionText>
              </OptionButton>
            </OptionRow>
          </SettingSection>

          <SettingSection>
            <SettingLabel>전송 대상</SettingLabel>
            <OptionRow>
              <OptionButton $active={sendTarget === 'student_only'} onPress={() => setSendTarget('student_only')}>
                <OptionText $active={sendTarget === 'student_only'}>수강생</OptionText>
              </OptionButton>
              <OptionButton $active={sendTarget === 'guardian_only'} onPress={() => setSendTarget('guardian_only')}>
                <OptionText $active={sendTarget === 'guardian_only'}>보호자</OptionText>
              </OptionButton>
              <OptionButton $active={sendTarget === 'both'} onPress={() => setSendTarget('both')}>
                <OptionText $active={sendTarget === 'both'}>둘 다</OptionText>
              </OptionButton>
            </OptionRow>
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

const OptionRow = styled.View`
  flex-direction: row;
  gap: 8px;
`;

const OptionButton = styled.TouchableOpacity<{ $active?: boolean }>`
  flex: 1;
  padding: 12px;
  border-radius: 8px;
  background-color: ${(props) => (props.$active ? '#ff6b00' : '#f0f0f0')};
  align-items: center;
`;

const OptionText = styled.Text<{ $active?: boolean }>`
  font-size: 14px;
  font-weight: 600;
  color: ${(props) => (props.$active ? '#ffffff' : '#666666')};
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

