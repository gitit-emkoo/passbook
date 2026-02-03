import React, { useState, useEffect } from 'react';
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
  max-height: 95%;
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
  background-color: ${(props: { variant?: 'primary' | 'secondary' }) => (props.variant === 'primary' ? '#007AFF' : '#e0e0e0')};
`;

const ButtonText = styled.Text<{ variant?: 'primary' | 'secondary' }>`
  color: ${(props: { variant?: 'primary' | 'secondary' }) => (props.variant === 'primary' ? '#fff' : '#000')};
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
    status: 'vanish' | 'substitute'; // 소멸 = vanish, 대체 = substitute
    substitute_at?: string;
    reason: string; // 사유 (필수)
    amount?: number | null; // 차감 금액 (금액권 소멸 시 선택사항)
  }) => void;
  studentName: string;
  initialStatus?: 'vanish' | 'substitute'; // 기본 선택값 (마이페이지 설정값)
  isAmountBased?: boolean; // 금액권 여부
  remainingAmount?: number; // 잔여 금액 (금액권일 때만)
}

/**
 * 결석/대체 모달
 */
export default function AttendanceAbsenceModal({
  visible,
  onClose,
  onConfirm,
  studentName,
  initialStatus,
  isAmountBased = false,
  remainingAmount,
}: AttendanceAbsenceModalProps) {
  const [status, setStatus] = useState<'vanish' | 'substitute'>(initialStatus || 'vanish');
  const [substituteDate, setSubstituteDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [reason, setReason] = useState(''); // 사유 (필수)
  const [amount, setAmount] = useState<string>(''); // 차감 금액 (금액권 소멸 시)

  // 모달이 열릴 때 initialStatus 적용 및 초기화
  useEffect(() => {
    if (visible) {
      if (initialStatus) {
        setStatus(initialStatus);
      } else {
        setStatus('vanish'); // 기본값이 없으면 'vanish' (소멸)
      }
      setAmount(''); // 금액 초기화
      setReason(''); // 사유 초기화
      setSubstituteDate(null); // 대체일 초기화
    }
  }, [visible, initialStatus]);

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

    // 금액 검증 (금액권 소멸 시)
    let amountValue: number | null = null;
    if (isAmountBased && status === 'vanish' && amount.trim()) {
      const amountNum = parseInt(amount.trim().replace(/,/g, ''), 10);
      if (isNaN(amountNum) || amountNum < 0) {
        Alert.alert('알림', '올바른 금액을 입력해주세요.');
        return;
      }
      if (remainingAmount !== undefined && amountNum > remainingAmount) {
        Alert.alert('알림', `잔여 금액(${remainingAmount.toLocaleString()}원)을 초과할 수 없습니다.`);
        return;
      }
      amountValue = amountNum;
    }

    onConfirm({
      status,
      substitute_at: substituteDate ? substituteDate.toISOString() : undefined,
      reason: reason.trim(),
      amount: amountValue, // 입력하지 않으면 null
    });

    // 초기화
    setStatus(initialStatus || 'vanish');
    setSubstituteDate(null);
    setReason('');
    setAmount('');
    onClose();
  };

  const handleClose = () => {
    // 초기화
    setStatus(initialStatus || 'vanish');
    setSubstituteDate(null);
    setReason('');
    setAmount('');
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
              <ModalTitle>{studentName} 소멸/대체일 지정</ModalTitle>

              <InputLabel>처리 유형</InputLabel>
              <ButtonRow>
                <Button
                  variant={status === 'vanish' ? 'primary' : 'secondary'}
                  onPress={() => setStatus('vanish')}
                >
                  <ButtonText variant={status === 'vanish' ? 'primary' : 'secondary'}>소멸</ButtonText>
                </Button>
                <ButtonLast
                  variant={status === 'substitute' ? 'primary' : 'secondary'}
                  onPress={() => setStatus('substitute')}
                >
                  <ButtonText variant={status === 'substitute' ? 'primary' : 'secondary'}>대체일 지정</ButtonText>
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

              {/* 소멸 시 차감 정보 표시 */}
              {status === 'vanish' && (
                <>
                  {isAmountBased ? (
                    <>
                      {/* 금액권 소멸 시 차감 금액 입력 필드 */}
                      <InputLabel>차감 금액 (선택사항)</InputLabel>
                      <TextInput
                        placeholder={remainingAmount !== undefined ? `최대 ${remainingAmount.toLocaleString()}원` : '차감할 금액을 입력하세요'}
                        value={amount}
                        onChangeText={(text: string) => {
                          // 숫자와 쉼표만 허용
                          const numericText = text.replace(/[^0-9,]/g, '');
                          setAmount(numericText);
                        }}
                        keyboardType="numeric"
                      />
                      {remainingAmount !== undefined && (
                        <InputLabel style={{ fontSize: 12, color: '#999', marginTop: -12, marginBottom: 16 }}>
                          잔여 금액: {remainingAmount.toLocaleString()}원
                        </InputLabel>
                      )}
                    </>
                  ) : (
                    <>
                      {/* 회차권 소멸 시 1회 자동 차감 표시 */}
                      <InputLabel>차감 횟수</InputLabel>
                      <TextInput
                        value="1회"
                        editable={false}
                        style={{ backgroundColor: '#f5f5f5', color: '#666' }}
                      />
                      <InputLabel style={{ fontSize: 12, color: '#999', marginTop: -12, marginBottom: 16 }}>
                        회차권 소멸 시 1회 자동 차감됩니다
                      </InputLabel>
                    </>
                  )}
                </>
              )}

              <InputLabel>사유 *</InputLabel>
              <TextInput
                placeholder="소멸/대체일 지정 사유를 입력하세요"
                value={reason}
                onChangeText={setReason}
                multiline
                numberOfLines={3}
              />
            </ScrollView>
            <ButtonRow style={{ marginTop: 16 }}>
              <Button variant="secondary" onPress={handleClose}>
                <ButtonText variant="secondary">취소</ButtonText>
              </Button>
              <ButtonLast variant="primary" onPress={handleConfirm}>
                <ButtonText variant="primary">확인</ButtonText>
              </ButtonLast>
            </ButtonRow>
          </ModalContent>
        </KeyboardAvoidingView>
      </ModalOverlay>
    </Modal>
  );
}



