import React, { useState } from 'react';
import { Modal, Alert } from 'react-native';
import styled from 'styled-components/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { attendanceApi } from '../../api/attendance';

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
  width: 90%;
  max-height: 80%;
`;

const ModalTitle = styled.Text`
  font-size: 18px;
  font-weight: bold;
  color: #000;
  margin-bottom: 16px;
  text-align: center;
`;

const InputLabel = styled.Text`
  font-size: 14px;
  color: #666;
  margin-bottom: 8px;
`;

const TextInput = styled.TextInput`
  border-width: 1px;
  border-color: #ddd;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 16px;
  font-size: 14px;
  color: #000;
`;

const PickerContainer = styled.View`
  border-width: 1px;
  border-color: #ddd;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 16px;
`;

const PickerButton = styled.TouchableOpacity`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
`;

const PickerText = styled.Text`
  font-size: 14px;
  color: #000;
`;

const ButtonRow = styled.View`
  flex-direction: row;
`;

const Button = styled.TouchableOpacity<{ variant?: 'primary' | 'secondary' }>`
  flex: 1;
  padding: 12px;
  border-radius: 6px;
  align-items: center;
  margin-right: 8px;
  background-color: ${(props) => (props.variant === 'primary' ? '#007AFF' : '#e0e0e0')};
`;

const ButtonText = styled.Text<{ variant?: 'primary' | 'secondary' }>`
  color: ${(props) => (props.variant === 'primary' ? '#fff' : '#000')};
  font-size: 16px;
  font-weight: bold;
`;

const ButtonLast = styled(Button)`
  margin-right: 0;
`;

interface AttendanceEditModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  attendanceId: number;
  initialStatus?: string;
  initialMemoPublic?: string;
  initialMemoInternal?: string;
}

/**
 * 출결 수정 모달
 */
export default function AttendanceEditModal({
  visible,
  onClose,
  onConfirm,
  attendanceId,
  initialStatus,
  initialMemoPublic,
  initialMemoInternal,
}: AttendanceEditModalProps) {
  const [status, setStatus] = useState<string>(initialStatus || 'present');
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [memoPublic, setMemoPublic] = useState(initialMemoPublic || '');
  const [memoInternal, setMemoInternal] = useState(initialMemoInternal || '');
  const [changeReason, setChangeReason] = useState('');
  const [loading, setLoading] = useState(false);

  const statusOptions = [
    { value: 'present', label: '출석' },
    { value: 'absent', label: '결석' },
    { value: 'substitute', label: '대체' },
    { value: 'vanish', label: '소멸' },
  ];

  const handleConfirm = async () => {
    if (!changeReason.trim()) {
      Alert.alert('알림', '변경 사유를 입력해주세요.');
      return;
    }

    try {
      setLoading(true);
      await attendanceApi.update(attendanceId, {
        status: status as any,
        memo_public: memoPublic || undefined,
        memo_internal: memoInternal || undefined,
        change_reason: changeReason,
      });
      Alert.alert('완료', '출결이 수정되었습니다.');
      onConfirm();
      handleClose();
    } catch (error) {
      console.error('Failed to update attendance:', error);
      Alert.alert('오류', '출결 수정에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStatus(initialStatus || 'present');
    setMemoPublic(initialMemoPublic || '');
    setMemoInternal(initialMemoInternal || '');
    setChangeReason('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <ModalOverlay>
        <ModalContent>
          <ModalTitle>출결 수정</ModalTitle>

          <InputLabel>출결 상태</InputLabel>
          <PickerContainer>
            <PickerButton onPress={() => setShowStatusPicker(!showStatusPicker)}>
              <PickerText>
                {statusOptions.find((opt) => opt.value === status)?.label || status}
              </PickerText>
              <PickerText>▼</PickerText>
            </PickerButton>
            {showStatusPicker && (
              <>
                {statusOptions.map((option) => (
                  <PickerButton
                    key={option.value}
                    onPress={() => {
                      setStatus(option.value);
                      setShowStatusPicker(false);
                    }}
                    style={{ paddingVertical: 8 }}
                  >
                    <PickerText>{option.label}</PickerText>
                  </PickerButton>
                ))}
              </>
            )}
          </PickerContainer>

          <InputLabel>공개 메모 (수강생에게 표시)</InputLabel>
          <TextInput
            placeholder="공개 메모를 입력하세요"
            value={memoPublic}
            onChangeText={setMemoPublic}
            multiline
            numberOfLines={2}
          />

          <InputLabel>내부 메모 (강사 전용)</InputLabel>
          <TextInput
            placeholder="내부 메모를 입력하세요"
            value={memoInternal}
            onChangeText={setMemoInternal}
            multiline
            numberOfLines={2}
          />

          <InputLabel>변경 사유 *</InputLabel>
          <TextInput
            placeholder="변경 사유를 입력해주세요"
            value={changeReason}
            onChangeText={setChangeReason}
            multiline
            numberOfLines={2}
          />

          <ButtonRow>
            <Button variant="secondary" onPress={handleClose} disabled={loading}>
              <ButtonText variant="secondary">취소</ButtonText>
            </Button>
            <ButtonLast variant="primary" onPress={handleConfirm} disabled={loading}>
              <ButtonText variant="primary">{loading ? '처리 중...' : '확인'}</ButtonText>
            </ButtonLast>
          </ButtonRow>
        </ModalContent>
      </ModalOverlay>
    </Modal>
  );
}



