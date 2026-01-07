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
  const [lessonType, setLessonType] = useState<'monthly' | 'session'>('monthly');
  const [absencePolicy, setAbsencePolicy] = useState<'carry_over' | 'deduct_next' | 'vanish'>('carry_over');
  const [sendTarget, setSendTarget] = useState<'student_only' | 'guardian_only' | 'both'>('student_only');

  useEffect(() => {
    if (visible) {
      loadSettings();
    }
  }, [visible]);

  const loadSettings = async () => {
    try {
      const user = await usersApi.getMe();
      const settings = (user.settings || {}) as Record<string, unknown>;
      if (settings.default_lesson_type) setLessonType(settings.default_lesson_type as 'monthly' | 'session');
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
        default_lesson_type: lessonType,
        default_absence_policy: absencePolicy,
        default_send_target: sendTarget,
        // 뷰티앱: 결제 방식은 항상 선불로 고정
        default_billing_type: 'prepaid',
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
          <ModalTitle>이용권 기본값 설정</ModalTitle>
          <CloseButton onPress={onClose}>
            <CloseButtonText>닫기</CloseButtonText>
          </CloseButton>
        </ModalHeader>

        <ModalContent>
          <SettingSection>
            <SettingLabel>이용권 타입</SettingLabel>
            <OptionRow>
              <OptionButton $active={lessonType === 'monthly'} onPress={() => setLessonType('monthly')}>
                <OptionText $active={lessonType === 'monthly'}>선불권</OptionText>
              </OptionButton>
              <OptionButton $active={lessonType === 'session'} onPress={() => setLessonType('session')}>
                <OptionText $active={lessonType === 'session'}>횟수권</OptionText>
              </OptionButton>
            </OptionRow>
          </SettingSection>

          <SettingSection>
            <SettingLabel>결제 방식</SettingLabel>
            {/* 뷰티앱에서는 결제 방식은 항상 선불로 고정, 버튼은 선택된 상태로만 표시 (클릭 불가) */}
            <OptionRow>
              <OptionButton $active>
                <OptionText $active>선불</OptionText>
              </OptionButton>
            </OptionRow>
          </SettingSection>

          <SettingSection>
            <SettingLabel>노쇼처리</SettingLabel>
            <OptionRow>
              <OptionButton $active={absencePolicy === 'carry_over'} onPress={() => setAbsencePolicy('carry_over')}>
                <OptionText $active={absencePolicy === 'carry_over'}>대체</OptionText>
              </OptionButton>
              <OptionButton $active={absencePolicy === 'vanish'} onPress={() => setAbsencePolicy('vanish')}>
                <OptionText $active={absencePolicy === 'vanish'}>소멸</OptionText>
              </OptionButton>
            </OptionRow>
          </SettingSection>

          <SettingSection>
            <SettingLabel>청구서 전송</SettingLabel>
            <OptionRow>
              <OptionButton $active={sendTarget === 'student_only'} onPress={() => setSendTarget('student_only')}>
                <OptionText $active={sendTarget === 'student_only'}>고객</OptionText>
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

const SettingValue = styled.Text`
  font-size: 14px;
  color: #333333;
`;

const OptionRow = styled.View`
  flex-direction: row;
  gap: 8px;
`;

const OptionButton = styled.TouchableOpacity<{ $active?: boolean }>`
  flex: 1;
  padding: 12px;
  border-radius: 8px;
  background-color: ${(props) => (props.$active ? '#1d42d8' : '#f0f0f0')};
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
  background-color: #1d42d8;
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

