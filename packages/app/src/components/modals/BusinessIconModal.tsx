import React, { useState, useEffect } from 'react';
import { Alert } from 'react-native';
import Modal from 'react-native-modal';
import styled from 'styled-components/native';
import { usersApi } from '../../api/users';

interface BusinessIconModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: () => void;
  initialIcon?: string | null;
}

// 업종 아이콘 목록 (나중에 실제 이미지로 교체 가능)
const BUSINESS_ICONS = [
  { id: 'health', label: '헬스', emoji: '💪' },
  { id: 'tutoring', label: '과외', emoji: '📚' },
  { id: 'yoga', label: '요가', emoji: '🧘' },
  { id: 'dance', label: '댄스', emoji: '💃' },
  { id: 'music', label: '음악', emoji: '🎵' },
  { id: 'art', label: '미술', emoji: '🎨' },
  { id: 'sports', label: '스포츠', emoji: '⚽' },
  { id: 'language', label: '어학', emoji: '🌐' },
];

export default function BusinessIconModal({
  visible,
  onClose,
  onSave,
  initialIcon = null,
}: BusinessIconModalProps) {
  const [loading, setLoading] = useState(false);
  const [selectedIcon, setSelectedIcon] = useState<string | null>(initialIcon);

  useEffect(() => {
    if (visible) {
      setSelectedIcon(initialIcon);
    }
  }, [visible, initialIcon]);

  const handleSave = async () => {
    if (!selectedIcon) {
      Alert.alert('선택 오류', '업종 아이콘을 선택해주세요.');
      return;
    }

    try {
      setLoading(true);
      const user = await usersApi.getMe();
      const currentSettings = user.settings || {};
      await usersApi.updateSettings({
        ...currentSettings,
        business_icon: selectedIcon,
      });
      Alert.alert('완료', '업종 아이콘이 저장되었습니다.');
      onSave();
      onClose();
    } catch (error: any) {
      if (__DEV__) {
        console.log('[BusinessIconModal] save error (handled)', error);
      }
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
          <ModalTitle>업종 아이콘 선택</ModalTitle>
          <CloseButton onPress={onClose}>
            <CloseButtonText>닫기</CloseButtonText>
          </CloseButton>
        </ModalHeader>

        <ModalContent>
          <HelperText>업장과 관련된 아이콘을 선택해주세요.</HelperText>
          <IconGrid>
            {BUSINESS_ICONS.map((icon) => (
              <IconItem
                key={icon.id}
                onPress={() => setSelectedIcon(icon.id)}
                $selected={selectedIcon === icon.id}
              >
                <IconEmoji>{icon.emoji}</IconEmoji>
                <IconLabel $selected={selectedIcon === icon.id}>{icon.label}</IconLabel>
              </IconItem>
            ))}
          </IconGrid>
        </ModalContent>

        <ButtonContainer>
          <CancelButton onPress={onClose} disabled={loading}>
            <CancelButtonText>취소</CancelButtonText>
          </CancelButton>
          <ConfirmButton onPress={handleSave} disabled={loading || !selectedIcon}>
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

const HelperText = styled.Text`
  font-size: 14px;
  color: #8e8e93;
  margin-bottom: 20px;
  text-align: center;
`;

const IconGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 16px;
  justify-content: space-between;
`;

interface IconItemProps {
  $selected: boolean;
}

const IconItem = styled.TouchableOpacity<IconItemProps>`
  width: 30%;
  aspect-ratio: 1;
  border-width: 2px;
  border-color: ${(props: IconItemProps) => (props.$selected ? '#ff6b00' : '#e0e0e0')};
  border-radius: 12px;
  background-color: ${(props: IconItemProps) => (props.$selected ? '#fff2e5' : '#ffffff')};
  align-items: center;
  justify-content: center;
  padding: 12px;
`;

const IconEmoji = styled.Text`
  font-size: 32px;
  margin-bottom: 8px;
`;

interface IconLabelProps {
  $selected: boolean;
}

const IconLabel = styled.Text<IconLabelProps>`
  font-size: 12px;
  font-weight: ${(props: IconLabelProps) => (props.$selected ? 600 : 400)};
  color: ${(props: IconLabelProps) => (props.$selected ? '#ff6b00' : '#666666')};
`;

const ButtonContainer = styled.View`
  flex-direction: row;
  padding: 20px;
  gap: 12px;
`;

interface CancelButtonProps {
  disabled?: boolean;
}

const CancelButton = styled.TouchableOpacity<CancelButtonProps>`
  flex: 1;
  background-color: #f0f0f0;
  padding: 16px;
  border-radius: 12px;
  align-items: center;
  opacity: ${(props: CancelButtonProps) => (props.disabled ? 0.5 : 1)};
`;

const CancelButtonText = styled.Text`
  font-size: 16px;
  font-weight: 600;
  color: #666666;
`;

interface ConfirmButtonProps {
  disabled?: boolean;
}

const ConfirmButton = styled.TouchableOpacity<ConfirmButtonProps>`
  flex: 1;
  background-color: #ff6b00;
  padding: 16px;
  border-radius: 12px;
  align-items: center;
  opacity: ${(props: ConfirmButtonProps) => (props.disabled ? 0.5 : 1)};
`;

const ConfirmButtonText = styled.Text`
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
`;

