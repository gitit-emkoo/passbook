import React, { useState, useEffect } from 'react';
import { Alert, ActivityIndicator, Platform } from 'react-native';
import Modal from 'react-native-modal';
import styled from 'styled-components/native';
import { contractsApi } from '../../api/contracts';
import DateTimePicker from '@react-native-community/datetimepicker';

interface ExtendContractModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  contractId: number;
  contractType: 'sessions' | 'monthly';
  totalSessions?: number;
  remainingSessions?: number;
  currentEndDate?: string | null;
}

export default function ExtendContractModal({
  visible,
  onClose,
  onSuccess,
  contractId,
  contractType,
  totalSessions = 0,
  remainingSessions = 0,
  currentEndDate,
}: ExtendContractModalProps) {
  const [loading, setLoading] = useState(false);
  const [addedSessions, setAddedSessions] = useState('');
  const [extendedEndDate, setExtendedEndDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    if (visible) {
      setAddedSessions('');
      if (currentEndDate) {
        setExtendedEndDate(new Date(currentEndDate));
      } else {
        setExtendedEndDate(new Date());
      }
    }
  }, [visible, currentEndDate]);

  const handleConfirm = async () => {
    if (contractType === 'sessions') {
      const sessions = parseInt(addedSessions, 10);
      if (isNaN(sessions) || sessions <= 0) {
        Alert.alert('오류', '추가할 회차를 입력해주세요.');
        return;
      }
    } else {
      if (!extendedEndDate) {
        Alert.alert('오류', '연장 종료일을 선택해주세요.');
        return;
      }
      if (currentEndDate && extendedEndDate <= new Date(currentEndDate)) {
        Alert.alert('오류', '연장 종료일은 현재 종료일보다 이후여야 합니다.');
        return;
      }
    }

    try {
      setLoading(true);

      const data: { added_sessions?: number; extended_end_date?: string } = {};
      if (contractType === 'sessions') {
        data.added_sessions = parseInt(addedSessions, 10);
      } else {
        data.extended_end_date = extendedEndDate!.toISOString();
      }

      await contractsApi.extend(contractId, data);
      
      Alert.alert('완료', contractType === 'sessions' 
        ? `${data.added_sessions}회가 추가되었습니다.`
        : '계약 기간이 연장되었습니다.');
      
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('[ExtendContractModal] extend error', error);
      Alert.alert('오류', error?.message || '계약 연장에 실패했습니다.');
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
          <ModalTitle>계약 연장</ModalTitle>
          <CloseButton onPress={onClose}>
            <CloseButtonText>닫기</CloseButtonText>
          </CloseButton>
        </ModalHeader>

        <ModalContent>
          {/* 기존 계약 정보 */}
          <Section>
            <SectionTitle>기존 계약 정보</SectionTitle>
            {contractType === 'sessions' ? (
              <>
                <InfoRow>
                  <InfoLabel>총 회차</InfoLabel>
                  <InfoValue>{totalSessions}회</InfoValue>
                </InfoRow>
                <InfoRow>
                  <InfoLabel>남은 회차</InfoLabel>
                  <InfoValue>{remainingSessions}회</InfoValue>
                </InfoRow>
              </>
            ) : (
              <InfoRow>
                <InfoLabel>현재 종료일</InfoLabel>
                <InfoValue>
                  {currentEndDate
                    ? new Date(currentEndDate).toLocaleDateString('ko-KR')
                    : '미설정'}
                </InfoValue>
              </InfoRow>
            )}
          </Section>

          {/* 연장 정보 입력 */}
          <Section>
            <SectionTitle>연장 정보</SectionTitle>
            {contractType === 'sessions' ? (
              <>
                <InputLabel>추가할 회차 *</InputLabel>
                <StyledTextInput
                  value={addedSessions}
                  onChangeText={setAddedSessions}
                  placeholder="예: 5"
                  keyboardType="number-pad"
                />
                {addedSessions && !isNaN(parseInt(addedSessions, 10)) && (
                  <PreviewText>
                    연장 후: {totalSessions + parseInt(addedSessions, 10)}회
                  </PreviewText>
                )}
              </>
            ) : (
              <>
                <InputLabel>연장 종료일 *</InputLabel>
                <DateButton onPress={() => setShowDatePicker(true)}>
                  <DateButtonText>
                    {extendedEndDate
                      ? extendedEndDate.toLocaleDateString('ko-KR')
                      : '날짜 선택'}
                  </DateButtonText>
                </DateButton>
                {Platform.OS === 'android' && showDatePicker && (
                  <DateTimePicker
                    value={extendedEndDate || new Date()}
                    mode="date"
                    display="default"
                    onChange={(event, date) => {
                      setShowDatePicker(false);
                      if (date) {
                        setExtendedEndDate(date);
                      }
                    }}
                    minimumDate={currentEndDate ? new Date(currentEndDate) : new Date()}
                  />
                )}
                {Platform.OS === 'ios' && (
                  <DateTimePicker
                    value={extendedEndDate || new Date()}
                    mode="date"
                    display="spinner"
                    onChange={(event, date) => {
                      if (date) {
                        setExtendedEndDate(date);
                      }
                    }}
                    minimumDate={currentEndDate ? new Date(currentEndDate) : new Date()}
                  />
                )}
              </>
            )}
          </Section>
        </ModalContent>

        <ButtonContainer>
          <CancelButton onPress={onClose} disabled={loading}>
            <CancelButtonText>취소</CancelButtonText>
          </CancelButton>
          <ConfirmButton onPress={handleConfirm} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <ConfirmButtonText>확인</ConfirmButtonText>
            )}
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

const Section = styled.View`
  margin-bottom: 24px;
`;

const SectionTitle = styled.Text`
  font-size: 16px;
  font-weight: 700;
  color: #111111;
  margin-bottom: 12px;
`;

const InfoRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom-width: 1px;
  border-bottom-color: #f0f0f0;
`;

const InfoLabel = styled.Text`
  font-size: 14px;
  color: #666666;
`;

const InfoValue = styled.Text`
  font-size: 14px;
  color: #111111;
  font-weight: 600;
`;

const InputLabel = styled.Text`
  font-size: 14px;
  font-weight: 600;
  color: #111111;
  margin-top: 12px;
  margin-bottom: 8px;
`;

const StyledTextInput = styled.TextInput`
  border-width: 1px;
  border-color: #e0e0e0;
  border-radius: 8px;
  padding: 12px;
  font-size: 16px;
  background-color: #ffffff;
`;

const PreviewText = styled.Text`
  font-size: 13px;
  color: #666666;
  margin-top: 8px;
`;

const DateButton = styled.TouchableOpacity`
  border-width: 1px;
  border-color: #e0e0e0;
  border-radius: 8px;
  padding: 12px;
  background-color: #ffffff;
`;

const DateButtonText = styled.Text`
  font-size: 16px;
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

