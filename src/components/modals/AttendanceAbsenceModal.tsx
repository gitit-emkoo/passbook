import React, { useState } from 'react';
import { Modal, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import styled from 'styled-components/native';
import DateTimePicker from '@react-native-community/datetimepicker';

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
  max-height: 85%;
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

const DatePickerButton = styled.TouchableOpacity`
  border-width: 1px;
  border-color: #ddd;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 16px;
`;

const DatePickerText = styled.Text`
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

interface AttendanceAbsenceModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (data: {
    status: 'absent' | 'substitute';
    substitute_at?: string;
    memo_public?: string;
    memo_internal?: string;
    reason: string; // 사유 (필수)
  }) => void;
  studentName: string;
}

/**
 * 결석/대체 모달
 */
export default function AttendanceAbsenceModal({
  visible,
  onClose,
  onConfirm,
  studentName,
}: AttendanceAbsenceModalProps) {
  const [status, setStatus] = useState<'absent' | 'substitute'>('absent');
  const [substituteDate, setSubstituteDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [reason, setReason] = useState(''); // 사유 (필수)
  const [memoPublic, setMemoPublic] = useState(''); // 메모 (선택)
  const [memoInternal, setMemoInternal] = useState(''); // 내부 메모 (선택)

  const handleConfirm = () => {
    // 사유 필수 검증
    if (!reason.trim()) {
      Alert.alert('알림', '사유를 입력해주세요.');
      return;
    }

    if (status === 'substitute' && !substituteDate) {
      Alert.alert('알림', '대체 수업 날짜를 선택해주세요.');
      return;
    }

    onConfirm({
      status,
      substitute_at: substituteDate ? substituteDate.toISOString() : undefined,
      memo_public: memoPublic.trim() || undefined,
      memo_internal: memoInternal.trim() || undefined,
      reason: reason.trim(), // 사유 포함
    });

    // 초기화
    setStatus('absent');
    setSubstituteDate(null);
    setReason('');
    setMemoPublic('');
    setMemoInternal('');
    onClose();
  };

  const handleClose = () => {
    // 초기화
    setStatus('absent');
    setSubstituteDate(null);
    setReason('');
    setMemoPublic('');
    setMemoInternal('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <ModalOverlay>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ width: '100%', justifyContent: 'center', alignItems: 'center' }}
        >
          <ModalContent>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 20 }}
            >
              <ModalTitle>{studentName} 결석/대체 처리</ModalTitle>

              <InputLabel>처리 유형</InputLabel>
              <ButtonRow>
                <Button
                  variant={status === 'absent' ? 'primary' : 'secondary'}
                  onPress={() => setStatus('absent')}
                >
                  <ButtonText variant={status === 'absent' ? 'primary' : 'secondary'}>결석</ButtonText>
                </Button>
                <ButtonLast
                  variant={status === 'substitute' ? 'primary' : 'secondary'}
                  onPress={() => setStatus('substitute')}
                >
                  <ButtonText variant={status === 'substitute' ? 'primary' : 'secondary'}>대체</ButtonText>
                </ButtonLast>
              </ButtonRow>

              {status === 'substitute' && (
                <>
                  <InputLabel>대체 수업 날짜</InputLabel>
                  <DatePickerButton onPress={() => setShowDatePicker(true)}>
                    <DatePickerText>
                      {substituteDate ? substituteDate.toLocaleDateString('ko-KR') : '날짜 선택'}
                    </DatePickerText>
                  </DatePickerButton>
                  {showDatePicker && (
                    <DateTimePicker
                      value={substituteDate || new Date()}
                      mode="date"
                      display="default"
                      onChange={(event, date) => {
                        setShowDatePicker(false);
                        if (date) {
                          setSubstituteDate(date);
                        }
                      }}
                    />
                  )}
                </>
              )}

              <InputLabel>사유 *</InputLabel>
              <TextInput
                placeholder="결석/대체 사유를 입력하세요"
                value={reason}
                onChangeText={setReason}
                multiline
                numberOfLines={2}
              />

              <InputLabel>공개 메모 (수강생에게 표시)</InputLabel>
              <TextInput
                placeholder="예: 다음 주에 보충 수업 진행 예정"
                value={memoPublic}
                onChangeText={setMemoPublic}
                multiline
                numberOfLines={2}
              />

              <InputLabel>내부 메모 (강사 전용)</InputLabel>
              <TextInput
                placeholder="강사 전용 메모를 입력하세요"
                value={memoInternal}
                onChangeText={setMemoInternal}
                multiline
                numberOfLines={2}
              />

              <ButtonRow>
                <Button variant="secondary" onPress={handleClose}>
                  <ButtonText variant="secondary">취소</ButtonText>
                </Button>
                <ButtonLast variant="primary" onPress={handleConfirm}>
                  <ButtonText variant="primary">확인</ButtonText>
                </ButtonLast>
              </ButtonRow>
            </ScrollView>
          </ModalContent>
        </KeyboardAvoidingView>
      </ModalOverlay>
    </Modal>
  );
}



