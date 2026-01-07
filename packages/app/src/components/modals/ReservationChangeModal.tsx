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

const TimeSelectionContainer = styled.View`
  flex-direction: row;
  gap: 12px;
  margin-bottom: 16px;
`;

const TimeButton = styled.TouchableOpacity<{ $selected?: boolean }>`
  flex: 1;
  padding: 12px;
  border-radius: 6px;
  border-width: 1px;
  border-color: ${(props) => (props.$selected ? '#007AFF' : '#ddd')};
  background-color: ${(props) => (props.$selected ? '#e8f4f8' : '#fff')};
  align-items: center;
`;

const TimeButtonText = styled.Text<{ $selected?: boolean }>`
  font-size: 14px;
  color: ${(props) => (props.$selected ? '#007AFF' : '#000')};
  font-weight: ${(props) => (props.$selected ? '600' : '400')};
`;

const ButtonRow = styled.View`
  flex-direction: row;
`;

const Button = styled.TouchableOpacity<{ variant?: 'primary' | 'secondary'; disabled?: boolean }>`
  flex: 1;
  padding: 12px;
  border-radius: 6px;
  align-items: center;
  margin-right: 8px;
  background-color: ${(props) => 
    props.disabled ? '#e0e0e0' : 
    props.variant === 'primary' ? '#007AFF' : '#e0e0e0'};
  opacity: ${(props) => (props.disabled ? 0.5 : 1)};
`;

const ButtonText = styled.Text<{ variant?: 'primary' | 'secondary'; disabled?: boolean }>`
  color: ${(props) => 
    props.disabled ? '#999' : 
    props.variant === 'primary' ? '#fff' : '#000'};
  font-size: 16px;
  font-weight: bold;
`;

const ButtonLast = styled(Button)`
  margin-right: 0;
`;

interface ReservationChangeModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  studentName: string;
  currentTime: string | null;
  selectedDate: Date | null;
  selectedHour: number | null;
  selectedMinute: number | null;
  onDateChange: (date: Date | null) => void;
  onHourChange: (hour: number | null) => void;
  onMinuteChange: (minute: number | null) => void;
  submitting: boolean;
}

/**
 * 예약 변경 모달
 */
export default function ReservationChangeModal({
  visible,
  onClose,
  onConfirm,
  studentName,
  currentTime,
  selectedDate,
  selectedHour,
  selectedMinute,
  onDateChange,
  onHourChange,
  onMinuteChange,
  submitting,
}: ReservationChangeModalProps) {
  const [showDatePicker, setShowDatePicker] = useState(false);

  // 현재 시간 파싱
  const parseCurrentTime = () => {
    if (!currentTime) return { hour: null, minute: null };
    const [hour, minute] = currentTime.split(':').map(Number);
    return { hour, minute };
  };

  const { hour: defaultHour, minute: defaultMinute } = parseCurrentTime();

  const handleConfirm = () => {
    if (!selectedDate) {
      Alert.alert('알림', '날짜를 선택해주세요.');
      return;
    }
    onConfirm();
  };

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = [0, 10, 20, 30, 40, 50];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
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
              <ModalTitle>{studentName} 예약 변경</ModalTitle>

              <InputLabel>변경할 날짜</InputLabel>
              <DatePickerButton onPress={() => setShowDatePicker(true)}>
                <DatePickerText>
                  {selectedDate ? selectedDate.toLocaleDateString('ko-KR') : '날짜 선택'}
                </DatePickerText>
              </DatePickerButton>
              {showDatePicker && (
                <DateTimePicker
                  value={selectedDate || new Date()}
                  mode="date"
                  display="default"
                  minimumDate={new Date()}
                  onChange={(event, date) => {
                    setShowDatePicker(false);
                    if (date) {
                      onDateChange(date);
                      // 시간이 선택되지 않았으면 기본값 설정
                      if (selectedHour === null && defaultHour !== null) {
                        onHourChange(defaultHour);
                      }
                      if (selectedMinute === null && defaultMinute !== null) {
                        onMinuteChange(defaultMinute);
                      }
                    }
                  }}
                />
              )}

              <InputLabel>시간 선택</InputLabel>
              <TimeSelectionContainer>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                  <TimeButton
                    $selected={selectedHour === null}
                    onPress={() => onHourChange(null)}
                    style={{ marginRight: 8 }}
                  >
                    <TimeButtonText $selected={selectedHour === null}>시간 없음</TimeButtonText>
                  </TimeButton>
                  {hours.map((hour) => (
                    <TimeButton
                      key={hour}
                      $selected={selectedHour === hour}
                      onPress={() => onHourChange(hour)}
                      style={{ marginRight: 8 }}
                    >
                      <TimeButtonText $selected={selectedHour === hour}>
                        {String(hour).padStart(2, '0')}시
                      </TimeButtonText>
                    </TimeButton>
                  ))}
                </ScrollView>
              </TimeSelectionContainer>

              {selectedHour !== null && (
                <>
                  <InputLabel>분 선택</InputLabel>
                  <TimeSelectionContainer>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                      {minutes.map((minute) => (
                        <TimeButton
                          key={minute}
                          $selected={selectedMinute === minute}
                          onPress={() => onMinuteChange(minute)}
                          style={{ marginRight: 8 }}
                        >
                          <TimeButtonText $selected={selectedMinute === minute}>
                            {String(minute).padStart(2, '0')}분
                          </TimeButtonText>
                        </TimeButton>
                      ))}
                    </ScrollView>
                  </TimeSelectionContainer>
                </>
              )}

              <ButtonRow>
                <Button variant="secondary" onPress={onClose} disabled={submitting}>
                  <ButtonText variant="secondary" disabled={submitting}>취소</ButtonText>
                </Button>
                <ButtonLast 
                  variant="primary" 
                  onPress={handleConfirm} 
                  disabled={!selectedDate || submitting}
                >
                  <ButtonText variant="primary" disabled={!selectedDate || submitting}>
                    {submitting ? '변경 중...' : '확인'}
                  </ButtonText>
                </ButtonLast>
              </ButtonRow>
            </ScrollView>
          </ModalContent>
        </KeyboardAvoidingView>
      </ModalOverlay>
    </Modal>
  );
}

